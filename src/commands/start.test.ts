import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RecordingState } from "../state.ts";
import type { StartOptions } from "../recorder.ts";
import type { ProcessRunner } from "../runner.ts";
import type { CliArgs } from "./shared.ts";
import { createStartCommand } from "./start.ts";

const LIST = JSON.stringify({
  displays: [{ id: 1, name: "Built-in", width: 1512, height: 982, scale: 2 }],
  windows: [{ id: 4242, app: "Safari", title: "GitHub" }],
});
const runner = { run: () => ({ exitCode: 0, stdout: LIST, stderr: "" }) } as unknown as ProcessRunner;

let dir: string;
let model: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "localscribe-start-"));
  model = join(dir, "model.bin");
  writeFileSync(model, "");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup(options: { isTty?: boolean; liveExit?: number; stopExit?: number; env?: Record<string, string | undefined> } = {}) {
  const events: string[] = [];
  const started: StartOptions[] = [];
  const logged: string[] = [];
  const helperFiles: string[] = [];
  const command = createStartCommand({
    ensureToolPath: () => void events.push("path"),
    env: options.env ?? { LOCALSCRIBE_WHISPER_MODEL: model },
    runner,
    ensureHelper: (_runner, files) => (helperFiles.push(files.binary), "/bin/localscribe-capture"),
    start: async (opts = {}) => {
      events.push("start");
      started.push(opts);
      return { file: "/r/demo.mp4" } as RecordingState;
    },
    live: async () => (events.push("live"), options.liveExit ?? 0),
    stop: async () => (events.push("stop"), options.stopExit ?? 0),
    isTty: options.isTty ?? true,
    log: (text) => void logged.push(text),
  });
  const run = (values: CliArgs["values"]) => command({ positionals: [], values });
  return { events, started, logged, helperFiles, run };
}

describe("start command", () => {
  test("hands the recorder its numeric and boolean flags, parsed", async () => {
    const { started, run } = setup();
    await run({ out: "/r/a.mp4", screen: "1", fps: "15", mic: "2" });
    expect(started).toEqual([
      {
        out: "/r/a.mp4", screen: 1, fps: 15, mic: 2, audioOnly: false, systemAudio: true, selection: undefined, engine: undefined,
        plugins: { transcribe: false, liveCaptions: false, notes: false, systemAudio: true, draw: false, lang: "en" },
      },
    ]);
  });

  test("--no-mic skips the microphone and --no-system-audio skips system audio", async () => {
    const { started, run } = setup();
    await run({ "no-mic": true, "no-system-audio": true });
    expect(started[0]).toMatchObject({ mic: false, systemAudio: false });
  });

  test("puts tools on PATH before starting, prints where it records, and succeeds", async () => {
    const { events, logged, run } = setup();
    expect(await run({})).toBe(0);
    expect(events).toEqual(["path", "start"]);
    expect(logged).toEqual(["recording -> /r/demo.mp4\nstop with: localscribe stop"]);
  });

  test("an unknown engine is rejected before anything starts", async () => {
    const { events, run } = setup();
    await expect(run({ engine: "gstreamer" })).rejects.toThrow('--engine expects sck or ffmpeg, got "gstreamer"');
    expect(events).not.toContain("start");
  });

  test("a missing whisper model is rejected before anything starts", async () => {
    const { events, run } = setup({ env: { LOCALSCRIBE_WHISPER_MODEL: join(dir, "absent.bin") } });
    await expect(run({ transcribe: true })).rejects.toThrow("whisper model not found");
    expect(events).not.toContain("start");
  });

  test("a capture flag builds the helper and resolves the window to record", async () => {
    const { started, helperFiles, run } = setup();
    await run({ window: "Safari" });
    expect(helperFiles.map((file) => file.split("/").pop())).toEqual(["localscribe-capture"]);
    expect(started[0]!.selection).toEqual({ kind: "window", windowId: 4242, app: "Safari", title: "GitHub" });
  });

  test("without capture flags the helper is never built", async () => {
    const { helperFiles, run } = setup();
    await run({});
    expect(helperFiles).toEqual([]);
  });

  test("--audio-only flag passes audioOnly: true to the recorder", async () => {
    const { started, run } = setup();
    await run({ "audio-only": true });
    expect(started[0]!.audioOnly).toBe(true);
  });

  test("--audio-only rejects conflicting video flags", async () => {
    const videoFlags = [
      { window: "Safari" },
      { area: "0,0,100,100" },
      { display: "1" },
      { screen: "0" },
      { fps: "30" },
      { draw: true },
      { engine: "sck" },
    ] as const;

    for (const flags of videoFlags) {
      const { run } = setup();
      await expect(run({ "audio-only": true, ...flags })).rejects.toThrow(
        "--audio-only cannot be used with video options (--window, --area, --display, --screen, --fps, --draw, --engine)",
      );
    }
  });

  test("--audio-only rejects when both mic and system audio are disabled", async () => {
    const { run } = setup();
    await expect(run({ "audio-only": true, "no-mic": true, "no-system-audio": true })).rejects.toThrow(
      "cannot record audio-only with both --no-mic and --no-system-audio",
    );
  });
});

describe("start --live", () => {
  test("in a terminal it opens the live view, then stops the recording when the view closes", async () => {
    const { events, logged, run } = setup();
    expect(await run({ live: true })).toBe(0);
    expect(events).toEqual(["path", "start", "live", "stop"]);
    expect(logged).toEqual([]);
  });

  test("a failing live view fails the command, but the recording is still stopped", async () => {
    const { events, run } = setup({ liveExit: 1 });
    expect(await run({ live: true })).toBe(1);
    expect(events.at(-1)).toBe("stop");
  });

  test("a failing stop fails the command", async () => {
    const { run } = setup({ stopExit: 1 });
    expect(await run({ live: true })).toBe(1);
  });

  test("--detach leaves the recording running and points at `localscribe live`", async () => {
    const { events, logged, run } = setup();
    expect(await run({ live: true, detach: true })).toBe(0);
    expect(events).toEqual(["path", "start"]);
    expect(logged[0]).toContain("run `localscribe live` in another pane");
  });

  test("without a terminal it also leaves the recording running", async () => {
    const { events, run } = setup({ isTty: false });
    await run({ live: true });
    expect(events).toEqual(["path", "start"]);
  });
});
