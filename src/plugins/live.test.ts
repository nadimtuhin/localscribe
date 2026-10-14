import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessRunner } from "../runner.ts";
import { runStartHooks } from "./index.ts";
import { createLivePlugin } from "./live.ts";
import type { PluginOptions, StartedContext } from "./types.ts";

let dir: string;
let model: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "localscribe-live-plugin-"));
  model = join(dir, "model.bin");
  writeFileSync(model, "");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup(binaries = ["ffmpeg", "whisper-cli"]) {
  const spawned: { command: string[]; logFile: string }[] = [];
  const runner = {
    which: (command: string) => (binaries.includes(command) ? `/bin/${command}` : null),
    spawnDetached: (command: string[], logFile: string) => {
      spawned.push({ command, logFile });
      return 100 + spawned.length;
    },
  } as unknown as ProcessRunner;
  const plugin = createLivePlugin({
    runner,
    env: { LOCALSCRIBE_WHISPER_MODEL: model },
    ensureHelper: () => "/bin/livesys",
    workerCommand: (base, speakers) => ["bun", "/app/cli.ts", "live-worker", base, speakers],
  });
  return { plugin, spawned };
}

const context = (options: PluginOptions, micDevice: number | undefined, sidecars: [number, string][] = [], lines: string[] = []): StartedContext => ({
  base: join(dir, "rec"),
  options,
  micDevice,
  log: (line) => lines.push(line),
  addSidecar: (pid, exe) => void sidecars.push([pid, exe]),
});

describe("live plugin", () => {
  test("enabled by --live only", () => {
    const { plugin } = setup();
    expect(plugin.enabled({ liveCaptions: true })).toBe(true);
    expect(plugin.enabled({ transcribe: true, notes: true })).toBe(false);
  });

  test("spawns mic segmenter, system segmenter and worker, registering every one as a sidecar", async () => {
    const { plugin, spawned } = setup();
    const sidecars: [number, string][] = [];
    const state = await plugin.start!({ ...context({ liveCaptions: true }, 2, sidecars), recorderPid: 4321 });
    const segmentDir = join(dir, "rec.live");

    expect(spawned.map((s) => s.command[0])).toEqual(["ffmpeg", "/bin/livesys", "bun"]);
    expect(spawned[0]!.command).toContain(":2");
    expect(spawned[0]!.command.at(-1)).toBe(join(segmentDir, "me_%05d.wav"));
    expect(spawned[1]!.command).toEqual(["/bin/livesys", segmentDir, "6", "--parent-pid", "4321"]);
    expect(spawned[2]!.command).toEqual(["bun", "/app/cli.ts", "live-worker", join(dir, "rec"), "me,them"]);
    expect(sidecars).toEqual([[101, "ffmpeg"], [102, "livesys"], [103, "bun"]]);
    expect(state).toEqual({ liveFile: join(dir, "rec.live.txt"), segmentDir });
  });

  test("creates the segment dir and an empty live file so tails can start immediately", async () => {
    const { plugin } = setup();
    await plugin.start!(context({ liveCaptions: true }, 0));
    expect(existsSync(join(dir, "rec.live"))).toBe(true);
    expect(existsSync(join(dir, "rec.live.txt"))).toBe(true);
  });

  test("--no-mic skips the mic segmenter, --no-system-audio skips the system one", async () => {
    const noMic = setup();
    await noMic.plugin.start!(context({ liveCaptions: true }, undefined));
    expect(noMic.spawned.map((s) => s.command[0])).toEqual(["/bin/livesys", "bun"]);
    expect(noMic.spawned[1]!.command.at(-1)).toBe("them");

    const noSystem = setup();
    await noSystem.plugin.start!(context({ liveCaptions: true, systemAudio: false }, 0));
    expect(noSystem.spawned.map((s) => s.command[0])).toEqual(["ffmpeg", "bun"]);
    expect(noSystem.spawned[1]!.command.at(-1)).toBe("me");
  });

  test("the worker is a draining sidecar so it outlives the segmenters", async () => {
    const { plugin } = setup();
    const registered: { exe: string; drain?: boolean }[] = [];
    await plugin.start!({ ...context({ liveCaptions: true }, 2), addSidecar: (_pid, exe, options) => void registered.push({ exe, drain: options?.drain }) });
    expect(registered).toEqual([{ exe: "ffmpeg" }, { exe: "livesys" }, { exe: "bun", drain: true }]);
  });

  test("stop removes the segment dir but keeps the live transcript", async () => {
    const { plugin } = setup();
    const state = await plugin.start!(context({ liveCaptions: true }, 0));
    writeFileSync(join(dir, "rec.live", "me_00001.wav"), "x");
    await plugin.stop!({ base: join(dir, "rec"), options: { liveCaptions: true }, log: () => {}, file: join(dir, "rec.mp4"), startedAt: "", durationMs: 0, pluginState: state });
    expect(existsSync(join(dir, "rec.live"))).toBe(false);
    expect(existsSync(join(dir, "rec.live.txt"))).toBe(true);
  });

  test("missing whisper-cli or model is a logged plugin error and spawns nothing", async () => {
    const lacking = setup(["ffmpeg"]);
    const lines: string[] = [];
    await runStartHooks([lacking.plugin], context({ liveCaptions: true }, 0, [], lines));
    expect(lines.join("\n")).toMatch(/^live: whisper-cli not found.*brew install whisper-cpp/);
    expect(lacking.spawned).toEqual([]);

    rmSync(model);
    const noModel = setup();
    const modelLines: string[] = [];
    await runStartHooks([noModel.plugin], context({ liveCaptions: true }, 0, [], modelLines));
    expect(modelLines.join("\n")).toContain(`live: whisper model not found: ${model}`);
    expect(noModel.spawned).toEqual([]);
  });
});
