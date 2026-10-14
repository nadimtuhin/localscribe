import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessRunner, RunResult } from "../runner.ts";
import { runStartHooks, runStopHooks } from "./index.ts";
import { createTranscription } from "./transcription.ts";
import type { PluginOptions, StartedContext, StoppedContext } from "./types.ts";

const fixtureText = readFileSync(new URL("../../test/fixtures/whisper.json", import.meta.url), "utf8");

let dir: string;
let model: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "localscribe-transcription-"));
  model = join(dir, "model.bin");
  writeFileSync(model, "");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

interface FakeOptions { binaries?: string[]; ffmpeg?: Partial<RunResult>; whisper?: Partial<RunResult> | "writes-fixture" }

function fakeRunner(options: FakeOptions = {}) {
  const binaries = options.binaries ?? ["ffmpeg", "whisper-cli", "whisper-stream"];
  const ran: string[][] = [];
  const spawned: { command: string[]; logFile: string }[] = [];
  const runner: ProcessRunner = {
    which: (command) => (binaries.includes(command) ? `/bin/${command}` : null),
    run: (command) => {
      ran.push(command);
      if (command[0] === "ffmpeg") {
        const result = { exitCode: 0, stdout: "", stderr: "", ...options.ffmpeg };
        if (result.exitCode === 0) writeFileSync(command[command.length - 1]!, "wav");
        return result;
      }
      if (options.whisper && options.whisper !== "writes-fixture") return { exitCode: 0, stdout: "", stderr: "", ...options.whisper };
      writeFileSync(`${command[command.indexOf("-of") + 1]}.json`, fixtureText);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    spawnDetached: (command, logFile) => {
      spawned.push({ command, logFile });
      return 4242;
    },
    isAlive: () => true,
    isRunning: () => true,
    kill: () => {},
    sleep: async () => {},
  };
  return { runner, ran, spawned };
}

const startedContext = (base: string, options: PluginOptions, sidecars: [number, string][] = [], lines: string[] = []): StartedContext => ({
  base,
  options,
  log: (line) => lines.push(line),
  addSidecar: (pid, exe) => void sidecars.push([pid, exe]),
});

const stoppedContext = (base: string, lines: string[]): StoppedContext => ({
  base,
  options: { transcribe: true },
  log: (line) => lines.push(line),
  file: `${base}.mp4`,
  startedAt: "2026-10-14T22:05:29.000Z",
  durationMs: 5000,
  pluginState: null,
});

describe("start", () => {
  test("live captions belong to the live plugin: transcription starts nothing, even for --live", async () => {
    const { runner, spawned } = fakeRunner();
    const sidecars: [number, string][] = [];
    const plugin = createTranscription({ runner, env: { LOCALSCRIBE_WHISPER_MODEL: model } });
    const states = await runStartHooks([plugin], startedContext(join(dir, "rec"), { transcribe: true, liveCaptions: true }, sidecars));
    expect(states).toEqual({ transcription: null });
    expect(spawned).toEqual([]);
    expect(sidecars).toEqual([]);
  });
});

describe("stop", () => {
  test("writes <base>.transcript.md from whisper-cli json and cleans temp files", async () => {
    const { runner, ran } = fakeRunner();
    const base = join(dir, "rec");
    const lines: string[] = [];
    const before = readdirSync(tmpdir()).filter((name) => name.startsWith("localscribe-tx-"));
    const plugin = createTranscription({ runner, env: { LOCALSCRIBE_WHISPER_MODEL: model } });
    await runStopHooks([plugin], { ...stoppedContext(base, lines), pluginStates: {} });
    expect(readFileSync(`${base}.transcript.md`, "utf8")).toBe("[00:00] Hello World this is a test.\n");
    expect(lines.join("\n")).toContain(`${base}.transcript.md`);
    expect(ran.map((command) => command[0])).toEqual(["ffmpeg", "whisper-cli"]);
    expect(ran[0]).toContain(`${base}.mp4`);
    expect(readdirSync(tmpdir()).filter((name) => name.startsWith("localscribe-tx-"))).toEqual(before);
  });

  test("a recording without an audio stream logs a clear 'no audio' message", async () => {
    const { runner, ran } = fakeRunner({ ffmpeg: { exitCode: 1, stderr: "Output file #0 does not contain any stream" } });
    const lines: string[] = [];
    const plugin = createTranscription({ runner, env: { LOCALSCRIBE_WHISPER_MODEL: model } });
    await runStopHooks([plugin], { ...stoppedContext(join(dir, "rec"), lines), pluginStates: {} });
    expect(lines).toEqual(["transcription: no audio in recording, skipping transcript"]);
    expect(ran.map((command) => command[0])).toEqual(["ffmpeg"]);
    expect(existsSync(join(dir, "rec.transcript.md"))).toBe(false);
  });

  test("other ffmpeg failures surface stderr", async () => {
    const { runner } = fakeRunner({ ffmpeg: { exitCode: 1, stderr: "boom: bad input" } });
    const lines: string[] = [];
    const plugin = createTranscription({ runner, env: { LOCALSCRIBE_WHISPER_MODEL: model } });
    await runStopHooks([plugin], { ...stoppedContext(join(dir, "rec"), lines), pluginStates: {} });
    expect(lines.join("\n")).toContain("transcription: could not extract audio: boom: bad input");
  });

  test("missing whisper-cli logs an install hint and keeps the mp4", async () => {
    const { runner, ran } = fakeRunner({ binaries: ["ffmpeg"] });
    const base = join(dir, "rec");
    writeFileSync(`${base}.mp4`, "video");
    const lines: string[] = [];
    const plugin = createTranscription({ runner, env: { LOCALSCRIBE_WHISPER_MODEL: model } });
    await runStopHooks([plugin], { ...stoppedContext(base, lines), pluginStates: {} });
    expect(lines.join("\n")).toMatch(/^transcription: whisper-cli not found.*brew install whisper-cpp/);
    expect(ran).toEqual([]);
    expect(readFileSync(`${base}.mp4`, "utf8")).toBe("video");
  });

  test("missing model logs the path and runs nothing", async () => {
    const { runner, ran } = fakeRunner();
    const missing = join(dir, "nope.bin");
    const lines: string[] = [];
    const plugin = createTranscription({ runner, env: { LOCALSCRIBE_WHISPER_MODEL: missing } });
    await runStopHooks([plugin], { ...stoppedContext(join(dir, "rec"), lines), pluginStates: {} });
    expect(lines.join("\n")).toContain(`transcription: whisper model not found: ${missing}`);
    expect(ran).toEqual([]);
  });

  test("whisper-cli failure surfaces stderr", async () => {
    const { runner } = fakeRunner({ whisper: { exitCode: 2, stderr: "bad model" } });
    const lines: string[] = [];
    const plugin = createTranscription({ runner, env: { LOCALSCRIBE_WHISPER_MODEL: model } });
    await runStopHooks([plugin], { ...stoppedContext(join(dir, "rec"), lines), pluginStates: {} });
    expect(lines.join("\n")).toContain("transcription: whisper-cli failed: bad model");
  });
});
