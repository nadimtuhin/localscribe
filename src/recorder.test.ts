import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { start, stop } from "./recorder.ts";
import { clearState, readState } from "./state.ts";
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
