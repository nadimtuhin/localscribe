import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RecordingState } from "../state.ts";
import { createLiveWorkerCommand, type LiveWorkerDeps } from "./live-worker.ts";

const STARTED_AT = "2026-10-14T22:05:29.000Z";
const STARTED_MS = Date.parse(STARTED_AT);
const SECOND_SAMPLES = 16_000;

const wav = (sample: number) => {
  const bytes = new Uint8Array(44 + SECOND_SAMPLES * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < SECOND_SAMPLES; i++) view.setInt16(44 + i * 2, i % 2 ? -sample : sample, true);
  return bytes;
};

let dir: string;
let base: string;
let segments: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "localscribe-live-worker-"));
  base = join(dir, "rec");
  segments = `${base}.live`;
  mkdirSync(segments);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function segment(name: string, sample: number, closedAtSeconds: number) {
  const path = join(segments, name);
  writeFileSync(path, wav(sample));
  utimesSync(path, (STARTED_MS + closedAtSeconds * 1000) / 1000, (STARTED_MS + closedAtSeconds * 1000) / 1000);
}

function fakeWhisper(script: string) {
  const path = join(dir, "whisper-cli");
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return path;
}

const recording: RecordingState = { pid: 1, file: "", startedAt: STARTED_AT, pluginOptions: { transcribe: true, liveCaptions: true, lang: "en" } };

function setup(options: { active?: RecordingState | null; whisper?: string; stopAfterSleeps?: number; onSleep?: (signals: Map<string, () => void>) => void } = {}) {
  const handlers = new Map<string, () => void>();
  const logged: string[] = [];
  let sleeps = 0;
  const deps: LiveWorkerDeps = {
    active: () => (options.active === undefined ? recording : options.active),
    readActive: () => (sleeps < (options.stopAfterSleeps ?? 0) ? recording : null),
    env: { LOCALSCRIBE_WHISPER_MODEL: "/models/test.bin" },
    whisperCommand: options.whisper ?? fakeWhisper("echo hello from whisper"),
    signals: { on: (signal, handler) => void handlers.set(signal, handler) },
    now: () => STARTED_MS + 100_000,
    sleep: async () => { sleeps++; options.onSleep?.(handlers); },
    log: (line) => void logged.push(line),
  };
  return { handlers, logged, sleeps: () => sleeps, run: (...positionals: string[]) => createLiveWorkerCommand(deps)({ positionals, values: {} }) };
}

const transcript = () => readFileSync(`${base}.live.txt`, "utf8");

describe("live-worker command", () => {
  test("fails without a recording base", async () => {
    expect(await setup().run()).toBe(1);
  });

  test("fails when no recording is active", async () => {
    expect(await setup({ active: null }).run(base)).toBe(1);
  });

  test("transcribes a loud segment into the live transcript with its time and speaker, then deletes it", async () => {
    segment("them_00001.wav", 3000, 83);
    expect(await setup().run(base, "me,them")).toBe(0);
    expect(transcript()).toBe("[01:22] them: hello from whisper\n");
    expect(existsSync(join(segments, "them_00001.wav"))).toBe(false);
  });

  test("hands whisper the model, the segment and the recording language", async () => {
    segment("them_00001.wav", 3000, 83);
    const argsFile = join(dir, "args.txt");
    await setup({ whisper: fakeWhisper(`echo "$@" > ${argsFile}; echo ok`) }).run(base);
    expect(readFileSync(argsFile, "utf8").trim()).toBe(`-m /models/test.bin -f ${join(segments, "them_00001.wav")} -l en -nt -np`);
  });

  test("a silent segment is dropped without asking whisper", async () => {
    segment("them_00001.wav", 5, 83);
    const marker = join(dir, "called");
    await setup({ whisper: fakeWhisper(`touch ${marker}; echo should not appear`) }).run(base);
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(join(segments, "them_00001.wav"))).toBe(false);
    expect(existsSync(`${base}.live.txt`)).toBe(false);
  });

  test("a failing whisper skips that segment and still removes it", async () => {
    segment("them_00001.wav", 3000, 83);
    await setup({ whisper: fakeWhisper("echo partial; exit 3") }).run(base);
    expect(existsSync(`${base}.live.txt`) ? transcript() : "").toBe("");
    expect(existsSync(join(segments, "them_00001.wav"))).toBe(false);
  });

  test("only the listed speakers are kept in time order", async () => {
    segment("me_00001.wav", 3000, 70);
    segment("me_00002.wav", 3000, 90);
    await setup({ whisper: fakeWhisper(`case "$*" in *00002*) echo second;; *) echo first;; esac`) }).run(base, "me,bogus");
    expect(transcript()).toBe("[01:09] me: first\n[01:29] me: second\n");
  });

  test("keeps polling while the recording runs and stops after it ends", async () => {
    const worker = setup({ stopAfterSleeps: 2 });
    expect(await worker.run(base)).toBe(0);
    expect(worker.sleeps()).toBe(2);
  });

  test("SIGTERM ends the loop even though the recording is still running", async () => {
    const worker = setup({ stopAfterSleeps: 100, onSleep: (handlers) => handlers.get("SIGTERM")!() });
    expect(await worker.run(base)).toBe(0);
    expect(worker.sleeps()).toBe(1);
  });

  test("SIGINT ends the loop too", async () => {
    const worker = setup({ stopAfterSleeps: 100, onSleep: (handlers) => handlers.get("SIGINT")!() });
    await worker.run(base);
    expect(worker.sleeps()).toBe(1);
  });

  test("a vanished segment folder is logged instead of crashing the worker", async () => {
    rmSync(segments, { recursive: true });
    const worker = setup();
    expect(await worker.run(base)).toBe(0);
    expect(worker.logged[0]).toContain("live-worker:");
  });
});
