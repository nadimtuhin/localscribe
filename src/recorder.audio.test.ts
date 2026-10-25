import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { list, start, stop } from "./recorder.ts";
import type { ProcessRunner } from "./runner.ts";
import { readState, writeState, type RecordingState } from "./state.ts";

const AUDIO_ONLY_DEVICES = `[AVFoundation indev @ 0x1] AVFoundation video devices:
[AVFoundation indev @ 0x1] AVFoundation audio devices:
[AVFoundation indev @ 0x1] [0] Built-in Mic
[AVFoundation indev @ 0x1] [1] USB Headset`;

let dir: string;
let statePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "localscribe-audio-test-"));
  statePath = join(dir, "state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const path = (name: string) => join(dir, name);
const put = (name: string, content: string) => writeFileSync(path(name), content);

function fakeStartRunner(options: { devices?: string } = {}) {
  const spawned: { command: string[]; logFile: string }[] = [];
  const alive = new Set<number>();
  let nextPid = 100;
  const runner = {
    which: () => "/usr/bin/ffmpeg",
    run: (cmd: string[]) => {
      if (cmd.includes("swiftc")) return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: options.devices ?? AUDIO_ONLY_DEVICES };
    },
    spawnDetached: (command: string[], logFile: string) => {
      const pid = nextPid++;
      spawned.push({ command, logFile });
      alive.add(pid);
      return pid;
    },
    isAlive: (pid: number) => alive.has(pid),
    isRunning: (pid: number) => alive.has(pid),
    kill: (pid: number) => void alive.delete(pid),
    sleep: async () => {},
  } as unknown as ProcessRunner;
  return { runner, spawned, alive };
}

function fakeStopRunner(mixResult: { exitCode: number; stderr: string } = { exitCode: 0, stderr: "" }) {
  const alive = new Map<number, string>();
  const ran: string[][] = [];
  const killed: string[] = [];
  const runner = {
    isRunning: (pid: number, exe: string) => alive.get(pid) === exe,
    isAlive: (pid: number) => alive.has(pid),
    kill: (pid: number, sig: string) => {
      killed.push(`${sig}:${pid}`);
      alive.delete(pid);
    },
    sleep: async () => {},
    run: (command: string[]) => {
      ran.push(command);
      return { exitCode: mixResult.exitCode, stdout: "", stderr: mixResult.stderr };
    },
  } as unknown as ProcessRunner;
  return { alive, ran, killed, runner };
}

describe("audio-only recording start", () => {
  test("starts even when no video screens exist", async () => {
    const { runner, spawned } = fakeStartRunner();
    const state = await start({ audioOnly: true, out: path("test.m4a") }, { runner, statePath, plugins: [] });
    expect(state.audioOnly).toBe(true);
    expect(state.file).toBe(path("test.m4a"));
    expect(spawned.length).toBe(2); // mic ffmpeg + sysaudio helper
  });

  test("defaults extension to .m4a when out is not specified", async () => {
    const { runner } = fakeStartRunner();
    const state = await start({ audioOnly: true, name: "meeting" }, { runner, statePath, plugins: [] });
    expect(state.file.endsWith(".m4a")).toBe(true);
    expect(state.file).toContain("meeting");
  });

  test("preserves .mp4 extension when explicitly requested in out", async () => {
    const { runner } = fakeStartRunner();
    const state = await start({ audioOnly: true, out: path("explicit.mp4") }, { runner, statePath, plugins: [] });
    expect(state.file).toBe(path("explicit.mp4"));
  });

  test("defaults extensionless out to .m4a", async () => {
    const { runner } = fakeStartRunner();
    const state = await start({ audioOnly: true, out: path("explicit") }, { runner, statePath, plugins: [] });
    expect(state.file).toBe(path("explicit.m4a"));
  });

  test("records mic only when system audio is disabled", async () => {
    const { runner, spawned } = fakeStartRunner();
    const state = await start({ audioOnly: true, systemAudio: false, out: path("mic-only.m4a") }, { runner, statePath, plugins: [] });
    expect(state.audioOnly).toBe(true);
    expect(state.systemAudio).toBeUndefined();
    expect(state.mic).toBeDefined();
    expect(state.exe).toBe("ffmpeg");
    expect(spawned.length).toBe(1);
    expect(spawned[0]!.command[0]).toBe("ffmpeg");
    expect(spawned[0]!.command).toContain("none:0");
  });

  test("records system audio only when mic is disabled", async () => {
    const { runner, spawned } = fakeStartRunner();
    const state = await start({ audioOnly: true, mic: false, out: path("sys-only.m4a") }, { runner, statePath, plugins: [] });
    expect(state.audioOnly).toBe(true);
    expect(state.mic).toBeUndefined();
    expect(state.systemAudio).toBeDefined();
    expect(state.exe).toBe("sysaudio");
    expect(spawned.length).toBe(1);
    expect(spawned[0]!.command[0]).toContain("sysaudio");
  });

  test("records both mic and system audio simultaneously", async () => {
    const { runner, spawned } = fakeStartRunner();
    const state = await start({ audioOnly: true, mic: 1, out: path("both.m4a") }, { runner, statePath, plugins: [] });
    expect(state.audioOnly).toBe(true);
    expect(state.mic).toBeDefined();
    expect(state.systemAudio).toBeDefined();
    expect(state.exe).toBe("ffmpeg");
    expect(spawned.length).toBe(2);
    expect(spawned[0]!.command).toContain("none:1");
    expect(spawned[1]!.command[0]).toContain("sysaudio");
  });

  test("refuses to overwrite existing recording or part files", async () => {
    const { runner } = fakeStartRunner();
    put("existing.m4a", "taken");
    await expect(start({ audioOnly: true, out: path("existing.m4a") }, { runner, statePath, plugins: [] })).rejects.toThrow(
      "refusing to overwrite existing file",
    );
  });

  test("rejects when both mic and system audio are disabled", async () => {
    const { runner } = fakeStartRunner();
    await expect(start({ audioOnly: true, mic: false, systemAudio: false, out: path("fail.m4a") }, { runner, statePath, plugins: [] })).rejects.toThrow(
      "cannot record audio-only with both --no-mic and --no-system-audio",
    );
  });
});

describe("audio-only recording stop", () => {
  test("mixes both audio parts with ffmpeg when both were recorded", async () => {
    const fake = fakeStopRunner();
    fake.alive.set(10, "ffmpeg");
    fake.alive.set(20, "sysaudio");

    put("demo.system.m4a", "system sound bytes");
    put("demo.mic.m4a", "mic speech bytes");

    const state: RecordingState = {
      pid: 10,
      exe: "ffmpeg",
      audioOnly: true,
      file: path("demo.m4a"),
      videoFile: path("demo.m4a"),
      videoHasMic: true,
      mic: { pid: 10, file: path("demo.mic.m4a") },
      systemAudio: { pid: 20, file: path("demo.system.m4a") },
      startedAt: new Date().toISOString(),
    };
    writeState(statePath, state);

    // Mock successful mix writing final file
    const origRun = fake.runner.run;
    fake.runner.run = (cmd: string[]) => {
      put("demo.m4a", "mixed audio content");
      return origRun(cmd);
    };

    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(result.mixError).toBeUndefined();
    expect(result.keptParts).toEqual([]);
    expect(fake.ran.length).toBe(1);
    expect(fake.ran[0]).toContain("-filter_complex");
    expect(fake.ran[0]!.join(" ")).toContain("amix=inputs=2:duration=longest:normalize=0[mixed]");
    expect(fake.ran[0]!.at(-1)).toBe(path("demo.m4a"));
    expect(existsSync(path("demo.mic.m4a"))).toBe(false);
    expect(existsSync(path("demo.system.m4a"))).toBe(false);
    expect(existsSync(path("demo.m4a"))).toBe(true);
  });

  test("finalizes mic file when only mic was recorded", async () => {
    const fake = fakeStopRunner();
    fake.alive.set(10, "ffmpeg");

    put("demo.mic.m4a", "mic speech only");
    put("demo.system.m4a", ""); // empty system audio

    const state: RecordingState = {
      pid: 10,
      exe: "ffmpeg",
      audioOnly: true,
      file: path("demo.m4a"),
      videoFile: path("demo.m4a"),
      videoHasMic: true,
      mic: { pid: 10, file: path("demo.mic.m4a") },
      systemAudio: { pid: 20, file: path("demo.system.m4a") },
      startedAt: new Date().toISOString(),
    };
    writeState(statePath, state);

    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(result.mixError).toBeUndefined();
    expect(fake.ran).toEqual([]); // no mix needed
    expect(existsSync(path("demo.mic.m4a"))).toBe(false);
    expect(existsSync(path("demo.system.m4a"))).toBe(false);
    expect(readFileSync(path("demo.m4a"), "utf8")).toBe("mic speech only");
  });

  test("finalizes system audio file when only system audio was recorded", async () => {
    const fake = fakeStopRunner();
    fake.alive.set(20, "sysaudio");

    put("demo.system.m4a", "system audio only");

    const state: RecordingState = {
      pid: 20,
      exe: "sysaudio",
      audioOnly: true,
      file: path("demo.m4a"),
      videoFile: path("demo.m4a"),
      videoHasMic: false,
      systemAudio: { pid: 20, file: path("demo.system.m4a") },
      startedAt: new Date().toISOString(),
    };
    writeState(statePath, state);

    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(result.mixError).toBeUndefined();
    expect(fake.ran).toEqual([]);
    expect(existsSync(path("demo.system.m4a"))).toBe(false);
    expect(readFileSync(path("demo.m4a"), "utf8")).toBe("system audio only");
  });

  test("reports mixError when no audio was recorded", async () => {
    const fake = fakeStopRunner();
    fake.alive.set(10, "ffmpeg");

    put("demo.mic.m4a", "");
    put("demo.system.m4a", "");

    const state: RecordingState = {
      pid: 10,
      exe: "ffmpeg",
      audioOnly: true,
      file: path("demo.m4a"),
      videoFile: path("demo.m4a"),
      videoHasMic: true,
      mic: { pid: 10, file: path("demo.mic.m4a") },
      systemAudio: { pid: 20, file: path("demo.system.m4a") },
      startedAt: new Date().toISOString(),
    };
    writeState(statePath, state);

    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(result.mixError).toBe("no audio recorded");
  });

  test("keeps raw parts when mixing fails", async () => {
    const fake = fakeStopRunner({ exitCode: 1, stderr: "amix failed" });
    fake.alive.set(10, "ffmpeg");
    fake.alive.set(20, "sysaudio");

    put("demo.system.m4a", "system sound bytes");
    put("demo.mic.m4a", "mic speech bytes");

    const state: RecordingState = {
      pid: 10,
      exe: "ffmpeg",
      audioOnly: true,
      file: path("demo.m4a"),
      videoFile: path("demo.m4a"),
      videoHasMic: true,
      mic: { pid: 10, file: path("demo.mic.m4a") },
      systemAudio: { pid: 20, file: path("demo.system.m4a") },
      startedAt: new Date().toISOString(),
    };
    writeState(statePath, state);

    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(result.mixError).toBe("amix failed");
    expect(result.keptParts).toContain(path("demo.system.m4a"));
    expect(result.keptParts).toContain(path("demo.mic.m4a"));
    expect(existsSync(path("demo.system.m4a"))).toBe(true);
    expect(existsSync(path("demo.mic.m4a"))).toBe(true);
  });
});

describe("list recordings with audio-only files", () => {
  test("includes .m4a files and excludes intermediate parts", () => {
    put("video.mp4", "vid");
    put("voice.m4a", "audio");
    put("recording.system.m4a", "part");
    put("recording.mic.m4a", "part");
    put("recording.video.mp4", "part");
    put("transcript.md", "text");

    const files = list(dir);
    const names = files.map((f) => f.name);
    expect(names).toContain("video.mp4");
    expect(names).toContain("voice.m4a");
    expect(names).not.toContain("recording.system.m4a");
    expect(names).not.toContain("recording.mic.m4a");
    expect(names).not.toContain("recording.video.mp4");
    expect(names).not.toContain("transcript.md");
  });
});
