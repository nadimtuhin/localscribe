import { describe, expect, test } from "bun:test";
import { parseArgs } from "node:util";
import { cliOptions } from "../commands/shared.ts";
import { pluginOptionsFromFlags, plugins, requireModelForStart, runStartHooks, runStopHooks } from "./index.ts";
import type { PluginOptions, RecorderPlugin } from "./types.ts";

function recordingPlugin(name: string, calls: string[], overrides: Partial<RecorderPlugin> = {}): RecorderPlugin {
  return {
    name,
    enabled: () => true,
    start: async () => {
      calls.push(`${name}:start`);
      return { startedBy: name };
    },
    stop: async (ctx) => {
      calls.push(`${name}:stop:${JSON.stringify(ctx.pluginState)}`);
    },
    ...overrides,
  };
}

const baseContext = (lines: string[] = []) => ({ base: "/r/demo", options: {} as PluginOptions, log: (line: string) => lines.push(line), addSidecar: () => {} });

describe("runStartHooks", () => {
  test("returns each enabled plugin's start result keyed by name", async () => {
    const calls: string[] = [];
    const states = await runStartHooks([recordingPlugin("a", calls), recordingPlugin("b", calls)], baseContext());
    expect(states).toEqual({ a: { startedBy: "a" }, b: { startedBy: "b" } });
    expect(calls).toEqual(["a:start", "b:start"]);
  });

  test("skips disabled plugins", async () => {
    const calls: string[] = [];
    const states = await runStartHooks([recordingPlugin("off", calls, { enabled: () => false })], baseContext());
    expect(states).toEqual({});
    expect(calls).toEqual([]);
  });

  test("logs a failing start hook and keeps going", async () => {
    const calls: string[] = [];
    const lines: string[] = [];
    const broken = recordingPlugin("broken", calls, { start: async () => { throw new Error("boom"); } });
    const states = await runStartHooks([broken, recordingPlugin("ok", calls)], baseContext(lines));
    expect(lines).toEqual(["broken: boom"]);
    expect(states).toEqual({ ok: { startedBy: "ok" } });
  });
});

describe("runStopHooks", () => {
  test("runs in registry order with each plugin's saved state", async () => {
    const calls: string[] = [];
    await runStopHooks([recordingPlugin("a", calls), recordingPlugin("b", calls)], {
      ...baseContext(),
      file: "/r/demo.mp4", startedAt: "2026-10-14T10:00:00.000Z", durationMs: 1000,
      pluginStates: { a: 1, b: 2 },
    });
    expect(calls).toEqual(["a:stop:1", "b:stop:2"]);
  });

  test("a failing stop hook does not stop later plugins", async () => {
    const calls: string[] = [];
    const lines: string[] = [];
    const broken = recordingPlugin("broken", calls, { stop: async () => { throw new Error("no whisper"); } });
    await runStopHooks([broken, recordingPlugin("ok", calls)], { ...baseContext(lines), file: "/r/demo.mp4", startedAt: "2026-10-14T10:00:00.000Z", durationMs: 1000, pluginStates: {} });
    expect(lines).toEqual(["broken: no whisper"]);
    expect(calls).toEqual(["ok:stop:undefined"]);
  });
});

describe("pluginOptionsFromFlags", () => {
  test("nothing enabled by default", () => {
    expect(pluginOptionsFromFlags({})).toEqual({ transcribe: false, liveCaptions: false, notes: false, systemAudio: true, draw: false, lang: "en" });
    expect(pluginOptionsFromFlags({ "no-system-audio": true }).systemAudio).toBe(false);
  });
  test("--live and --notes both need a transcript", () => {
    expect(pluginOptionsFromFlags({ live: true }).transcribe).toBe(true);
    expect(pluginOptionsFromFlags({ notes: true }).transcribe).toBe(true);
  });
  test("--live implies notes", () => {
    expect(pluginOptionsFromFlags({ live: true }).notes).toBe(true);
  });
});

describe("registry", () => {
  test("live starts first, and transcription runs before notes", () => {
    expect(plugins.map((p) => p.name)).toEqual(["live", "transcription", "notes", "annotation"]);
  });

  test("each plugin is enabled by its own flag", () => {
    const [live, transcription, notes] = plugins as [RecorderPlugin, RecorderPlugin, RecorderPlugin];
    expect(live.enabled({ transcribe: true })).toBe(false);
    expect(live.enabled({ liveCaptions: true })).toBe(true);
    expect(transcription.enabled({})).toBe(false);
    expect(transcription.enabled({ transcribe: true })).toBe(true);
    expect(transcription.enabled({ liveCaptions: true })).toBe(true);
    expect(notes.enabled({ transcribe: true })).toBe(false);
    expect(notes.enabled({ notes: true })).toBe(true);
  });
});

describe("pluginOptionsFromFlags --lang", () => {
  test("stores the whisper code for a name or code, case-insensitive", () => {
    expect(pluginOptionsFromFlags({ lang: "Hindi" }).lang).toBe("hi");
    expect(pluginOptionsFromFlags({ lang: "BN", live: true }).lang).toBe("bn");
    expect(pluginOptionsFromFlags({ lang: "auto" }).lang).toBe("auto");
  });

  test("an unknown language fails before recording starts", () => {
    expect(() => pluginOptionsFromFlags({ lang: "klingon" })).toThrow(/--lang expects .*got "klingon"/);
  });

  test("--lang is a string flag", () => {
    const { values } = parseArgs({ args: ["start", "--lang", "hindi"], options: cliOptions, allowPositionals: true });
    expect(values.lang).toBe("hindi");
  });
});

describe("requireModelForStart", () => {
  const options = (lang: string, transcribe = true) => ({ transcribe, lang });

  test("a missing multilingual model stops start with the download command", () => {
    expect(() => requireModelForStart(options("hi"), {}, () => false)).toThrow(/^whisper model not found: .*ggml-small\.bin\. Download it with: curl -L -o .*ggml-small\.bin https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/main\/ggml-small\.bin$/);
  });

  test("nothing to check when no transcription is wanted, or the model is there", () => {
    expect(() => requireModelForStart(options("hi", false), {}, () => false)).not.toThrow();
    expect(() => requireModelForStart(options("hi"), {}, () => true)).not.toThrow();
  });
});
