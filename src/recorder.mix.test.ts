import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { list, stop } from "./recorder.ts";
import type { ProcessRunner } from "./runner.ts";
import { writeState, type RecordingState } from "./state.ts";

// Every recorded process is already running under the exe name the state expects; stop only has to signal it.
function fakeRunner(muxResult: { exitCode: number; stderr: string } = { exitCode: 0, stderr: "" }) {
  const alive = new Map<number, string>();
  const ran: string[][] = [];
  const runner = {
    isRunning: (pid: number, exe: string) => alive.get(pid) === exe,
    isAlive: (pid: number) => alive.has(pid),
    kill: (pid: number) => void alive.delete(pid),
    sleep: async () => {},
    run: (command: string[]) => (ran.push(command), { exitCode: muxResult.exitCode, stdout: "", stderr: muxResult.stderr }),
  } as unknown as ProcessRunner;
  return { alive, ran, runner };
}

let dir: string;
let statePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "localscribe-mix-"));
  statePath = join(dir, "state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const path = (name: string) => join(dir, name);
const put = (name: string, content: string) => writeFileSync(path(name), content);

function seed(fake: ReturnType<typeof fakeRunner>, state: Partial<RecordingState>) {
  fake.alive.set(10, state.exe ?? "ffmpeg");
  writeState(statePath, { pid: 10, file: path("demo.mp4"), videoFile: path("demo.video.mp4"), videoHasMic: false, startedAt: new Date().toISOString(), ...state });
}

describe("stop mixing with the ffmpeg engine", () => {
  const withSystemAudio = (fake: ReturnType<typeof fakeRunner>) => {
    fake.alive.set(20, "sysaudio");
    seed(fake, { systemAudio: { pid: 20, file: path("demo.system.m4a") } });
  };

  test("a missing video part keeps the system audio and reports which part is missing", async () => {
    const fake = fakeRunner();
    put("demo.system.m4a", "sound");
    withSystemAudio(fake);
    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(result.mixError).toBe(`video part missing: ${path("demo.video.mp4")}`);
    expect(result.keptParts).toEqual([path("demo.system.m4a")]);
  });

  test("a missing video part with no system audio file keeps nothing", async () => {
    const fake = fakeRunner();
    withSystemAudio(fake);
    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(result.keptParts).toEqual([]);
    expect(result.mixError).toContain("video part missing");
  });

  test("when no system sound was captured the video part becomes the final file", async () => {
    const fake = fakeRunner();
    put("demo.video.mp4", "just video");
    put("demo.system.m4a", "");
    withSystemAudio(fake);
    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(readFileSync(path("demo.mp4"), "utf8")).toBe("just video");
    expect(existsSync(path("demo.video.mp4"))).toBe(false);
    expect(existsSync(path("demo.system.m4a"))).toBe(false);
    expect(fake.ran).toEqual([]);
    expect(result).toMatchObject({ keptParts: [], bytes: 10 });
    expect(result.mixError).toBeUndefined();
  });

  test("a successful mux removes both parts", async () => {
    const fake = fakeRunner();
    put("demo.video.mp4", "video");
    put("demo.system.m4a", "sound");
    withSystemAudio(fake);
    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(fake.ran).toHaveLength(1);
    expect(fake.ran[0]).toContain(path("demo.video.mp4"));
    expect(fake.ran[0]).toContain(path("demo.system.m4a"));
    expect(fake.ran[0]!.at(-1)).toBe(path("demo.mp4"));
    expect(existsSync(path("demo.video.mp4"))).toBe(false);
    expect(existsSync(path("demo.system.m4a"))).toBe(false);
    expect(result.keptParts).toEqual([]);
  });

  test("a failed mux keeps both parts and reports ffmpeg's message", async () => {
    const fake = fakeRunner({ exitCode: 1, stderr: "  mux broke\n" });
    put("demo.video.mp4", "video");
    put("demo.system.m4a", "sound");
    withSystemAudio(fake);
    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(result.mixError).toBe("mux broke");
    expect(result.keptParts).toEqual([path("demo.video.mp4"), path("demo.system.m4a")]);
    expect(existsSync(path("demo.video.mp4"))).toBe(true);
  });
});

describe("stop mixing with the sck engine", () => {
  const sck = (fake: ReturnType<typeof fakeRunner>, extra: Partial<RecordingState> = {}) => seed(fake, { engine: "sck", exe: "localscribe-capture", ...extra });

  test("a missing video part keeps the audio that did record", async () => {
    const fake = fakeRunner();
    put("demo.mic.m4a", "voice");
    put("demo.system.m4a", "");
    sck(fake, { systemAudioFile: path("demo.system.m4a"), mic: { pid: 99, file: path("demo.mic.m4a") } });
    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(result.mixError).toBe(`video part missing: ${path("demo.video.mp4")}`);
    expect(result.keptParts).toEqual([path("demo.mic.m4a")]);
  });

  test("a recording without any audio becomes the final file as is", async () => {
    const fake = fakeRunner();
    put("demo.video.mp4", "pictures");
    sck(fake);
    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(readFileSync(path("demo.mp4"), "utf8")).toBe("pictures");
    expect(fake.ran).toEqual([]);
    expect(result.keptParts).toEqual([]);
  });

  test("a failed mux keeps the video and the recorded audio", async () => {
    const fake = fakeRunner({ exitCode: 1, stderr: "no codec" });
    put("demo.video.mp4", "pictures");
    put("demo.system.m4a", "sound");
    sck(fake, { systemAudioFile: path("demo.system.m4a") });
    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(result.mixError).toBe("no codec");
    expect(result.keptParts).toEqual([path("demo.video.mp4"), path("demo.system.m4a")]);
  });

  test("a successful mux writes the final file and removes the parts", async () => {
    const fake = fakeRunner();
    put("demo.video.mp4", "pictures");
    put("demo.system.m4a", "sound");
    sck(fake, { systemAudioFile: path("demo.system.m4a") });
    const result = await stop({ runner: fake.runner, plugins: [], statePath });
    expect(fake.ran[0]!.at(-1)).toBe(path("demo.mp4"));
    expect(existsSync(path("demo.video.mp4"))).toBe(false);
    expect(existsSync(path("demo.system.m4a"))).toBe(false);
    expect(result.keptParts).toEqual([]);
  });
});

describe("list", () => {
  test("a folder that does not exist has no recordings", () => {
    expect(list(path("nowhere"))).toEqual([]);
  });

  test("lists finished mp4 files newest first and skips video parts and other files", () => {
    put("old.mp4", "1");
    put("new.mp4", "22");
    put("new.video.mp4", "part");
    put("notes.txt", "x");
    utimesSync(path("old.mp4"), 1000, 1000);
    utimesSync(path("new.mp4"), 2000, 2000);
    expect(list(dir).map(({ name, bytes }) => ({ name, bytes }))).toEqual([
      { name: "new.mp4", bytes: 2 },
      { name: "old.mp4", bytes: 1 },
    ]);
  });
});
