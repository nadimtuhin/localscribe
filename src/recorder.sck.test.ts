import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { activeRecording, start, stop } from "./recorder.ts";
import { readState } from "./state.ts";
import type { ProcessRunner } from "./runner.ts";
import type { Selection } from "./capture/selection.ts";

const DEVICES = `[AVFoundation indev @ 0x1] AVFoundation video devices:
[AVFoundation indev @ 0x1] [0] Capture screen 0
[AVFoundation indev @ 0x1] AVFoundation audio devices:
[AVFoundation indev @ 0x1] [0] Mic`;

const flagValue = (command: string[], flag: string) => command[command.indexOf(flag) + 1]!;

class FakeRunner implements ProcessRunner {
  alive = new Map<number, string>();
  signals: string[] = [];
  spawned: string[][] = [];
  ran: string[][] = [];
  failMux = false;
  private nextPid = 2000;
  which = () => "/fake/bin";
  run = (command: string[]) => {
    this.ran.push(command);
    if (command.includes("-list_devices")) return { exitCode: 0, stdout: "", stderr: DEVICES };
    if (command[0] === "ffmpeg" && this.failMux) return { exitCode: 1, stdout: "", stderr: "mux broke" };
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  spawnDetached = (command: string[], logFile: string) => {
    writeFileSync(logFile, "log text");
    this.spawned.push(command);
    const pid = this.nextPid++;
    const exe = basename(command[0]!);
    this.alive.set(pid, exe);
    if (exe === "localscribe-capture") {
      writeFileSync(flagValue(command, "--out"), "video");
      if (command.includes("--system-audio")) writeFileSync(flagValue(command, "--system-audio"), "sys");
    } else if (exe === "ffmpeg") {
      writeFileSync(command[command.length - 1]!, "mic");
    }
    return pid;
  };
  isAlive = (pid: number) => this.alive.has(pid);
  isRunning = (pid: number, exe: string) => this.alive.get(pid) === exe;
  kill = (pid: number, signal: NodeJS.Signals) => {
    this.signals.push(`${signal}:${pid}`);
    this.alive.delete(pid);
  };
  sleep = async () => {};
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "localscribe-sck-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const statePath = () => join(dir, "state.json");
const deps = (runner: FakeRunner) => ({ runner, plugins: [], statePath: statePath() });
const windowSelection: Selection = { kind: "window", windowId: 4242, app: "Safari", title: "GitHub" };

describe("start with the SCK engine", () => {
  test("a selection implies the capture helper, which records video and system audio", async () => {
    const runner = new FakeRunner();
    await start({ out: join(dir, "demo.mp4"), selection: windowSelection, mic: false }, deps(runner));
    const capture = runner.spawned.find((c) => basename(c[0]!) === "localscribe-capture")!;
    expect(capture.slice(1, 3)).toEqual(["--window", "4242"]);
    expect(flagValue(capture, "--out")).toBe(join(dir, "demo.video.mp4"));
    expect(flagValue(capture, "--system-audio")).toBe(join(dir, "demo.system.m4a"));
    expect(runner.spawned.some((c) => c[0] === "ffmpeg")).toBe(false);
  });

  test("the mic is a separate audio-only ffmpeg", async () => {
    const runner = new FakeRunner();
    await start({ out: join(dir, "demo.mp4"), selection: windowSelection, mic: 0 }, deps(runner));
    const mic = runner.spawned.find((c) => c[0] === "ffmpeg")!;
    expect(mic).toContain("none:0");
    expect(mic.at(-1)).toBe(join(dir, "demo.mic.m4a"));
  });

  test("state records the selection, engine and every process to stop", async () => {
    const runner = new FakeRunner();
    const state = await start({ out: join(dir, "demo.mp4"), selection: windowSelection, mic: 0 }, deps(runner));
    expect(state.engine).toBe("sck");
    expect(state.selection).toEqual(windowSelection);
    expect(state.exe).toBe("localscribe-capture");
    expect(state.mic).toEqual({ pid: 2001, file: join(dir, "demo.mic.m4a") });
    expect(readState(statePath())?.selection).toEqual(windowSelection);
  });

  test("engine sck without a selection captures the default display", async () => {
    const runner = new FakeRunner();
    await start({ out: join(dir, "demo.mp4"), engine: "sck", mic: false }, deps(runner));
    expect(runner.spawned[0]!.slice(1, 3)).toEqual(["--fps", "30"]);
  });

  test("a selection with the ffmpeg engine is rejected", async () => {
    const runner = new FakeRunner();
    await expect(start({ out: join(dir, "demo.mp4"), selection: windowSelection, engine: "ffmpeg" }, deps(runner))).rejects.toThrow("--engine sck");
  });

  test("helper dying on startup clears state and kills the mic recorder", async () => {
    const runner = new FakeRunner();
    const spawn = runner.spawnDetached;
    runner.spawnDetached = (command, log) => {
      const pid = spawn(command, log);
      if (basename(command[0]!) === "localscribe-capture") runner.alive.delete(pid);
      return pid;
    };
    await expect(start({ out: join(dir, "demo.mp4"), selection: windowSelection, mic: 0 }, deps(runner))).rejects.toThrow("capture helper exited");
    expect(readState(statePath())).toBeNull();
    expect(runner.signals).toContain("SIGKILL:2001");
  });
});

describe("stop with the SCK engine", () => {
  test("interrupts helper and mic, then mixes video + system + mic", async () => {
    const runner = new FakeRunner();
    await start({ out: join(dir, "demo.mp4"), selection: windowSelection, mic: 0 }, deps(runner));
    const result = await stop(deps(runner));
    expect(runner.signals).toEqual(expect.arrayContaining(["SIGINT:2000", "SIGINT:2001"]));
    const mux = runner.ran.at(-1)!;
    expect(mux.join(" ")).toContain(`-i ${join(dir, "demo.video.mp4")} -i ${join(dir, "demo.system.m4a")} -i ${join(dir, "demo.mic.m4a")}`);
    expect(result.mixError).toBeUndefined();
    expect(existsSync(join(dir, "demo.video.mp4"))).toBe(false);
    expect(existsSync(join(dir, "demo.mic.m4a"))).toBe(false);
  });

  test("keeps the raw parts when mixing fails", async () => {
    const runner = new FakeRunner();
    await start({ out: join(dir, "demo.mp4"), selection: windowSelection, mic: 0 }, deps(runner));
    runner.failMux = true;
    const result = await stop(deps(runner));
    expect(result.mixError).toBe("mux broke");
    expect(result.keptParts).toHaveLength(3);
  });

  test("with no audio parts the video becomes the final file", async () => {
    const runner = new FakeRunner();
    await start({ out: join(dir, "demo.mp4"), selection: windowSelection, mic: false, systemAudio: false }, deps(runner));
    await stop(deps(runner));
    expect(existsSync(join(dir, "demo.mp4"))).toBe(true);
    expect(runner.ran.some((c) => c[0] === "ffmpeg" && !c.includes("-list_devices"))).toBe(false);
  });

  test("silent system audio (empty part) is skipped, mic alone is copied in", async () => {
    const runner = new FakeRunner();
    await start({ out: join(dir, "demo.mp4"), selection: windowSelection, mic: 0 }, deps(runner));
    writeFileSync(join(dir, "demo.system.m4a"), "");
    await stop(deps(runner));
    const mux = runner.ran.at(-1)!.join(" ");
    expect(mux).toContain(join(dir, "demo.mic.m4a"));
    expect(mux).not.toContain("demo.system.m4a");
  });
});

describe("stale SCK recording", () => {
  test("when the helper is gone, the mic recorder is interrupted and state cleared", async () => {
    const runner = new FakeRunner();
    await start({ out: join(dir, "demo.mp4"), selection: windowSelection, mic: 0 }, deps(runner));
    runner.alive.delete(2000);
    expect(activeRecording(statePath(), runner)).toBeNull();
    expect(runner.signals).toContain("SIGINT:2001");
    expect(readState(statePath())).toBeNull();
  });
});
