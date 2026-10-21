import { describe, expect, test } from "bun:test";
import { buildSegmentWhisperArgs, runLiveWorker, type WorkerDeps } from "./worker.ts";

const START = 1_000_000;
const SEGMENT_BYTES = 44 + 6 * 32_000;
const wavOf = (sample: number) => {
  const bytes = new Uint8Array(44 + 8);
  for (let i = 0; i < 4; i++) new DataView(bytes.buffer).setInt16(44 + i * 2, i % 2 ? -sample : sample, true);
  return bytes;
};
const LOUD = wavOf(3000);
const QUIET = wavOf(50);

// A scripted directory: each tick the test adds files, then the worker loop runs once per sleep.
function harness(opts: { speakers?: ("me" | "them")[]; texts: Record<string, string>; ticks: { add?: Record<string, number>; at: number; active: boolean }[] }) {
  const files = new Map<string, number>(); // name -> mtime
  const appended: string[] = [];
  const transcribed: string[] = [];
  const removed: string[] = [];
  let tick = 0;
  let now = START;
  const deps: WorkerDeps = {
    speakers: opts.speakers ?? ["me", "them"],
    startedAtMs: START,
    holdMs: 15_000,
    listDir: () => [...files.keys()],
    stat: (name) => ({ mtimeMs: files.get(name)!, bytes: SEGMENT_BYTES }),
    readBytes: () => LOUD,
    transcribe: async (name) => {
      transcribed.push(name);
      return opts.texts[name] ?? "";
    },
    remove: (name) => void removed.push(name),
    append: (text) => void appended.push(text),
    log: () => {},
    now: () => now,
    recordingActive: () => opts.ticks[Math.min(tick, opts.ticks.length - 1)]!.active,
    sleep: async () => {
      tick += 1;
      const step = opts.ticks[Math.min(tick, opts.ticks.length - 1)]!;
      now = START + step.at;
      for (const [name, mtime] of Object.entries(step.add ?? {})) files.set(name, START + mtime);
    },
  };
  const first = opts.ticks[0]!;
  for (const [name, mtime] of Object.entries(first.add ?? {})) files.set(name, START + mtime);
  now = START + first.at;
  return { deps, appended, transcribed, removed };
}

describe("buildSegmentWhisperArgs", () => {
  test("plain text on stdout: no timestamps, no progress prints", () => {
    expect(buildSegmentWhisperArgs({ model: "/m.bin", wav: "/d/me_00001.wav", lang: "en" })).toEqual(["-m", "/m.bin", "-f", "/d/me_00001.wav", "-l", "en", "-nt", "-np"]);
    expect(buildSegmentWhisperArgs({ model: "/m.bin", wav: "/d/me_00001.wav", lang: "bn" })).toEqual([
      "-m",
      "/m.bin",
      "-f",
      "/d/me_00001.wav",
      "-l",
      "bn",
      "-nt",
      "-np",
      "--prompt",
      "বাংলা ভাষা।",
      "--suppress-nst",
    ]);
  });
});

describe("runLiveWorker", () => {
  test("transcribes each closed segment once and appends labeled lines in time order", async () => {
    const h = harness({
      texts: { "me_00001.wav": " Hi, tell me about yourself.", "them_00001.wav": " Sure, I am an engineer.", "me_00002.wav": "second", "them_00002.wav": "later" },
      ticks: [
        { at: 7_000, active: true, add: { "me_00001.wav": 6_000, "me_00002.wav": 7_000, "them_00001.wav": 5_000, "them_00002.wav": 7_000 } },
        { at: 8_000, active: true },
        { at: 9_000, active: false },
      ],
    });
    await runLiveWorker(h.deps);
    expect(h.appended.join("")).toBe(
      "[00:00] me: Hi, tell me about yourself.\n[00:00] them: Sure, I am an engineer.\n[00:01] them: later\n[00:01] me: second\n",
    );
    expect(h.transcribed.filter((n) => n === "me_00001.wav")).toHaveLength(1);
  });

  test("an out-of-order finish still lands in chronological order", async () => {
    const h = harness({
      texts: { "me_00001.wav": "mine", "me_00002.wav": "mine2", "them_00001.wav": "theirs", "them_00002.wav": "x" },
      ticks: [
        { at: 20_000, active: true, add: { "me_00001.wav": 12_000, "me_00002.wav": 18_000 } },
        { at: 22_000, active: true, add: { "them_00001.wav": 8_000, "them_00002.wav": 21_000 } },
        { at: 23_000, active: false },
      ],
    });
    await runLiveWorker(h.deps);
    const times = h.appended.join("").split("\n").filter(Boolean).map((l) => l.slice(0, 7));
    expect(times).toEqual([...times].sort());
    expect(h.appended.join("")).toContain("them: theirs");
  });

  test("non-speech segments write nothing, and transcribed audio is deleted", async () => {
    const h = harness({
      speakers: ["me"],
      texts: { "me_00001.wav": " [BLANK_AUDIO]", "me_00002.wav": "ok" },
      ticks: [{ at: 14_000, active: true, add: { "me_00001.wav": 6_000, "me_00002.wav": 12_000 } }, { at: 15_000, active: false }],
    });
    await runLiveWorker(h.deps);
    expect(h.appended.join("")).toBe("[00:06] me: ok\n");
    expect(h.removed).toContain("me_00001.wav");
  });

  test("when the recording ends the still-open last segments are flushed", async () => {
    const h = harness({
      speakers: ["me"],
      texts: { "me_00001.wav": "last words" },
      ticks: [{ at: 7_000, active: true, add: { "me_00001.wav": 6_000 } }, { at: 8_000, active: false }],
    });
    await runLiveWorker(h.deps);
    expect(h.appended.join("")).toBe("[00:00] me: last words\n");
  });

  test("a transcription failure skips that segment and keeps going", async () => {
    const h = harness({
      speakers: ["me"],
      texts: { "me_00002.wav": "fine" },
      ticks: [{ at: 14_000, active: true, add: { "me_00001.wav": 6_000, "me_00002.wav": 12_000 } }, { at: 15_000, active: false }],
    });
    const real = h.deps.transcribe;
    h.deps.transcribe = async (name) => {
      if (name === "me_00001.wav") throw new Error("whisper-cli failed");
      return real(name);
    };
    await runLiveWorker(h.deps);
    expect(h.appended.join("")).toBe("[00:06] me: fine\n");
  });

  test("a near-silent segment never reaches whisper but is still deleted", async () => {
    const h = harness({
      speakers: ["me"],
      texts: { "me_00001.wav": "Thank you.", "me_00002.wav": "real words" },
      ticks: [{ at: 14_000, active: true, add: { "me_00001.wav": 6_000, "me_00002.wav": 12_000 } }, { at: 15_000, active: false }],
    });
    h.deps.readBytes = (name) => (name === "me_00001.wav" ? QUIET : LOUD);
    await runLiveWorker(h.deps);
    expect(h.transcribed).toEqual(["me_00002.wav"]);
    expect(h.removed).toContain("me_00001.wav");
  });

  test("a failing tick is logged and the next tick carries on", async () => {
    const h = harness({
      speakers: ["me"],
      texts: { "me_00001.wav": "survived" },
      ticks: [{ at: 7_000, active: true, add: { "me_00001.wav": 6_000 } }, { at: 8_000, active: false }],
    });
    const realList = h.deps.listDir;
    let listCalls = 0;
    h.deps.listDir = () => {
      if (listCalls++ === 0) throw new Error("ENOENT");
      return realList();
    };
    const logged: string[] = [];
    h.deps.log = (line) => void logged.push(line);
    await runLiveWorker(h.deps);
    expect(logged.join("\n")).toContain("ENOENT");
    expect(h.appended.join("")).toBe("[00:00] me: survived\n");
  });

  test("a failure that is not an Error is logged as plain text", async () => {
    const h = harness({ speakers: ["me"], texts: {}, ticks: [{ at: 7_000, active: false }] });
    h.deps.listDir = () => { throw "disk gone"; };
    const logged: string[] = [];
    h.deps.log = (line) => void logged.push(line);
    await runLiveWorker(h.deps);
    expect(logged).toEqual(["live-worker: disk gone"]);
  });
});
