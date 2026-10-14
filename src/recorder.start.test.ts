import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start } from "./recorder.ts";
import type { RecorderPlugin } from "./plugins/types.ts";
import type { ProcessRunner } from "./runner.ts";

const DEVICES = `[AVFoundation indev @ 0x1] AVFoundation video devices:
[AVFoundation indev @ 0x1] [0] Capture screen 0
[AVFoundation indev @ 0x1] AVFoundation audio devices:
[AVFoundation indev @ 0x1] [0] Built-in Mic
[AVFoundation indev @ 0x1] [2] USB Mic`;

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "localscribe-start-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fakeRunner(options: { dieOnStartup?: boolean } = {}) {
  const alive = new Set<number>();
  const killed: string[] = [];
  let next = 500;
  const runner = {
    which: () => "/usr/bin/ffmpeg",
    run: () => ({ exitCode: 0, stdout: "", stderr: DEVICES }),
    spawnDetached: (_command: string[], logFile: string) => {
      const pid = next++;
      if (options.dieOnStartup) writeFileSync(logFile, "Permission denied: screen recording\n");
      else alive.add(pid);
      return pid;
    },
    isAlive: (pid: number) => alive.has(pid),
    isRunning: (pid: number) => alive.has(pid),
    kill: (pid: number, signal: string) => void (killed.push(`${signal}:${pid}`), alive.delete(pid)),
    sleep: async () => {},
  } as unknown as ProcessRunner;
  return { killed, runner };
}

const options = () => ({ out: join(dir, "demo.mp4"), systemAudio: false, plugins: { transcribe: true } });
const deps = (runner: ProcessRunner, plugins: RecorderPlugin[] = []) => ({ runner, plugins, statePath: join(dir, "state.json") });

describe("start refuses before spawning anything", () => {
  test("an unknown microphone lists the available ones", async () => {
    const { runner } = fakeRunner();
    await expect(start({ ...options(), mic: 7 }, deps(runner))).rejects.toThrow("microphone 7 not found. Available: 0=Built-in Mic, 2=USB Mic");
  });

  test("a screen index that does not exist says how many were found", async () => {
    const { runner } = fakeRunner();
    await expect(start({ ...options(), screen: 3 }, deps(runner))).rejects.toThrow("screen 3 not found (found 1)");
  });

  test("a selection with the ffmpeg engine is rejected", async () => {
    const { runner } = fakeRunner();
    const selection = { kind: "display" as const, displayId: 1 };
    await expect(start({ ...options(), selection, engine: "ffmpeg" }, deps(runner))).rejects.toThrow("need --engine sck");
  });

  test("an existing output file is never overwritten", async () => {
    const { runner } = fakeRunner();
    writeFileSync(join(dir, "demo.mp4"), "precious");
    await expect(start(options(), deps(runner))).rejects.toThrow(`refusing to overwrite existing file: ${join(dir, "demo.mp4")}`);
  });

  test("a second start while recording is rejected", async () => {
    const { runner } = fakeRunner();
    await start(options(), deps(runner));
    await expect(start({ ...options(), out: join(dir, "other.mp4") }, deps(runner))).rejects.toThrow(`already recording: ${join(dir, "demo.mp4")}`);
  });
});

describe("start startup check", () => {
  test("a process that dies on startup fails with its log and leaves no state behind", async () => {
    const { runner } = fakeRunner({ dieOnStartup: true });
    await expect(start({ ...options(), mic: false }, deps(runner))).rejects.toThrow(/ffmpeg exited on startup[\s\S]*Permission denied: screen recording/);
    expect(existsSync(join(dir, "state.json"))).toBe(false);
  });
});

describe("plugin messages", () => {
  test("a message from a start hook is printed to the terminal", async () => {
    const { runner } = fakeRunner();
    const plugin: RecorderPlugin = { name: "talker", enabled: () => true, start: async (ctx) => (ctx.log("talker: ready"), null) };
    const printed = spyOn(console, "log").mockImplementation(() => {});
    try {
      await start(options(), deps(runner, [plugin]));
      expect(printed).toHaveBeenCalledWith("talker: ready");
    } finally {
      printed.mockRestore();
    }
  });
});
