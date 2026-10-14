import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { activeRecording, readActive, start, stop } from "./recorder.ts";
import { clearState, readState, writeState } from "./state.ts";
import type { ProcessRunner } from "./runner.ts";
import type { RecorderPlugin, StoppedContext } from "./plugins/types.ts";

const DEVICES = `[AVFoundation indev @ 0x1] AVFoundation video devices:
[AVFoundation indev @ 0x1] [0] Capture screen 0
[AVFoundation indev @ 0x1] AVFoundation audio devices:
[AVFoundation indev @ 0x1] [0] Mic`;

class FakeRunner implements ProcessRunner {
  alive = new Map<number, string>(); // pid -> executable name
  signals: string[] = [];
  private nextPid = 1000;
  which = () => "/fake/bin";
  run = (command: string[]) => ({ exitCode: 0, stdout: "", stderr: command.includes("-list_devices") ? DEVICES : "" });
  spawnDetached = (command: string[]) => {
    const pid = this.nextPid++;
    this.alive.set(pid, basename(command[0]!));
    if (basename(command[0]!) === "ffmpeg") writeFileSync(command[command.length - 1]!, "video");
    return pid;
  };
  isAlive = (pid: number) => this.alive.has(pid);
  isRunning = (pid: number, executableName: string) => this.alive.get(pid) === executableName;
  kill = (pid: number, signal: NodeJS.Signals) => {
    this.signals.push(`${signal}:${pid}`);
    this.alive.delete(pid);
  };
  sleep = async () => {};
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "localscribe-test-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const deps = (runner: FakeRunner, plugins: RecorderPlugin[]) => ({ runner, plugins, statePath: join(dir, "state.json") });
const startOptions = () => ({ out: join(dir, "demo.mp4"), systemAudio: false, plugins: { transcribe: true } });

describe("recorder wiring", () => {
  test("start runs start hooks and stop runs stop hooks with the finished file", async () => {
    const runner = new FakeRunner();
    const stopped: StoppedContext[] = [];
    const plugin: RecorderPlugin = {
      name: "spy",
      enabled: (options) => options.transcribe === true,
      start: async () => ({ marker: 1 }),
      stop: async (ctx) => { stopped.push(ctx); },
    };

    const state = await start(startOptions(), deps(runner, [plugin]));
    expect(state.plugins).toEqual({ spy: { marker: 1 } });

    const result = await stop(deps(runner, [plugin]));
    expect(stopped).toHaveLength(1);
    expect(stopped[0]!.file).toBe(join(dir, "demo.mp4"));
    expect(stopped[0]!.pluginState).toEqual({ marker: 1 });
    expect(result.file).toBe(join(dir, "demo.mp4"));
  });
});

describe("state during plugin startup", () => {
  test("pluginOptions are in state before start hooks run", async () => {
    const runner = new FakeRunner();
    let seen: unknown;
    const plugin: RecorderPlugin = {
      name: "spy",
      enabled: () => true,
      start: async () => { seen = readState(join(dir, "state.json"))?.pluginOptions; return null; },
    };
    await start(startOptions(), deps(runner, [plugin]));
    expect(seen).toEqual({ transcribe: true });
  });

  test("does not resurrect state cleared while plugins were starting", async () => {
    const runner = new FakeRunner();
    const plugin: RecorderPlugin = { name: "slow", enabled: () => true, start: async () => { clearState(join(dir, "state.json")); return null; } };
    await expect(start(startOptions(), deps(runner, [plugin]))).rejects.toThrow("stopped while plugins were starting");
    expect(readState(join(dir, "state.json"))).toBeNull();
  });
});

describe("stop context", () => {
  test("stop hooks get startedAt and durationMs", async () => {
    const runner = new FakeRunner();
    const stopped: StoppedContext[] = [];
    const plugin: RecorderPlugin = { name: "spy", enabled: () => true, stop: async (ctx) => { stopped.push(ctx); } };
    const state = await start(startOptions(), deps(runner, [plugin]));
    const result = await stop(deps(runner, [plugin]));
    expect(stopped[0]!.startedAt).toBe(state.startedAt);
    expect(stopped[0]!.durationMs).toBe(result.durationMs);
  });
});

describe("sidecars", () => {
  const sidecarPlugin = (runner: FakeRunner): RecorderPlugin => ({
    name: "side",
    enabled: () => true,
    start: async (ctx) => {
      const pid = runner.spawnDetached(["whisper-stream"]);
      ctx.addSidecar(pid, "whisper-stream");
      return { pid };
    },
  });

  test("start records sidecars in state", async () => {
    const runner = new FakeRunner();
    const state = await start(startOptions(), deps(runner, [sidecarPlugin(runner)]));
    expect(state.sidecars).toEqual([{ pid: 1001, exe: "whisper-stream" }]);
  });

  test("stop interrupts sidecars before stop hooks run", async () => {
    const runner = new FakeRunner();
    let sidecarAliveInHook: boolean | undefined;
    const plugin: RecorderPlugin = { ...sidecarPlugin(runner), stop: async () => { sidecarAliveInHook = runner.isAlive(1001); } };
    await start(startOptions(), deps(runner, [plugin]));
    await stop(deps(runner, [plugin]));
    expect(runner.signals).toContain("SIGINT:1001");
    expect(sidecarAliveInHook).toBe(false);
  });

  test("stop interrupts draining sidecars only after the others have exited", async () => {
    const runner = new FakeRunner();
    const plugin: RecorderPlugin = {
      name: "pipeline",
      enabled: () => true,
      start: async (ctx) => {
        ctx.addSidecar(runner.spawnDetached(["worker"]), "worker", { drain: true });
        ctx.addSidecar(runner.spawnDetached(["segmenter"]), "segmenter");
        return null;
      },
    };
    await start(startOptions(), deps(runner, [plugin]));
    await stop(deps(runner, [plugin]));
    const sidecarSignals = runner.signals.filter((s) => s === "SIGINT:1001" || s === "SIGINT:1002");
    expect(sidecarSignals).toEqual(["SIGINT:1002", "SIGINT:1001"]);
  });

  test("stop kills sidecars even when mixing fails", async () => {
    const runner = new FakeRunner();
    runner.run = (command: string[]) =>
      command.includes("-list_devices") ? { exitCode: 0, stdout: "", stderr: DEVICES } : { exitCode: 1, stdout: "", stderr: "mux broke" };
    // Starting with system audio would compile the swift helper, so seed the state directly.
    const statePath = join(dir, "state.json");
    writeFileSync(join(dir, "demo.video.mp4"), "v");
    writeFileSync(join(dir, "demo.system.m4a"), "a");
    const ffmpegPid = runner.spawnDetached(["ffmpeg", join(dir, "x.mp4")]);
    const sysPid = runner.spawnDetached(["sysaudio"]);
    const sidePid = runner.spawnDetached(["whisper-stream"]);
    writeState(statePath, {
      pid: ffmpegPid, file: join(dir, "demo.mp4"), videoFile: join(dir, "demo.video.mp4"), videoHasMic: false,
      systemAudio: { pid: sysPid, file: join(dir, "demo.system.m4a") }, startedAt: new Date().toISOString(),
      sidecars: [{ pid: sidePid, exe: "whisper-stream" }],
    });
    const result = await stop(deps(runner, []));
    expect(result.mixError).toBe("mux broke");
    expect(runner.signals).toContain(`SIGINT:${sidePid}`);
    expect(runner.isAlive(sidePid)).toBe(false);
  });

  test("sidecars started before a concurrent stop are interrupted, not leaked", async () => {
    const runner = new FakeRunner();
    const plugin: RecorderPlugin = {
      ...sidecarPlugin(runner),
      start: async (ctx) => {
        ctx.addSidecar(runner.spawnDetached(["whisper-stream"]), "whisper-stream");
        clearState(join(dir, "state.json"));
        return null;
      },
    };
    await expect(start(startOptions(), deps(runner, [plugin]))).rejects.toThrow("stopped while plugins were starting");
    expect(runner.signals).toContain("SIGINT:1001");
  });

  test("a sidecar whose pid now belongs to another program is left alone", async () => {
    const runner = new FakeRunner();
    await start(startOptions(), deps(runner, [sidecarPlugin(runner)]));
    runner.alive.set(1001, "unrelated");
    await stop(deps(runner, [sidecarPlugin(runner)]));
    expect(runner.signals).not.toContain("SIGINT:1001");
  });

  test("stale cleanup interrupts sidecars of a dead recording", () => {
    const runner = new FakeRunner();
    const statePath = join(dir, "state.json");
    const sidePid = runner.spawnDetached(["whisper-stream"]);
    writeState(statePath, {
      pid: 4242, file: join(dir, "d.mp4"), videoFile: join(dir, "d.mp4"), videoHasMic: false,
      startedAt: new Date().toISOString(), sidecars: [{ pid: sidePid, exe: "whisper-stream" }],
    });
    expect(activeRecording(statePath, runner)).toBeNull();
    expect(runner.signals).toContain(`SIGINT:${sidePid}`);
  });
});

describe("state file", () => {
  const stateOf = (pid: number, sidecars: { pid: number; exe: string }[] = []) => ({
    pid, file: join(dir, "d.mp4"), videoFile: join(dir, "d.mp4"), videoHasMic: false, startedAt: new Date().toISOString(), sidecars,
  });

  test("writeState replaces the file in one step, so a reader never sees a half-written state", () => {
    const statePath = join(dir, "state.json");
    writeState(statePath, stateOf(1));
    const before = statSync(statePath).ino;
    writeState(statePath, stateOf(2));
    expect(statSync(statePath).ino).not.toBe(before);
    expect(readState(statePath)?.pid).toBe(2);
    expect(readdirSync(dir)).toEqual(["state.json"]);
  });

  test("readActive reports the live recording without touching anything", () => {
    const runner = new FakeRunner();
    const statePath = join(dir, "state.json");
    const pid = runner.spawnDetached(["ffmpeg", join(dir, "x.mp4")]);
    writeState(statePath, stateOf(pid));
    expect(readActive(statePath, runner)?.pid).toBe(pid);
  });

  test("readActive on a dead recording is null but leaves state and sidecars alone", () => {
    const runner = new FakeRunner();
    const statePath = join(dir, "state.json");
    const sidePid = runner.spawnDetached(["bun"]);
    writeState(statePath, stateOf(4242, [{ pid: sidePid, exe: "bun" }]));
    expect(readActive(statePath, runner)).toBeNull();
    expect(runner.signals).toEqual([]);
    expect(readState(statePath)).not.toBeNull();
  });

  test("readActive survives an unreadable state file", () => {
    const statePath = join(dir, "state.json");
    writeFileSync(statePath, "{ half");
    expect(readActive(statePath, new FakeRunner())).toBeNull();
  });
});
