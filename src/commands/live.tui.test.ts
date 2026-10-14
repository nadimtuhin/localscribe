import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HermesResult } from "../notes/generate.ts";
import type { RecordingState } from "../state.ts";
import { createTui } from "./live.ts";

const STARTED_AT = "2026-10-14T22:05:29.000Z";
const ENTER_SCREEN = "\x1b[?1049h\x1b[2J";
const LEAVE_SCREEN = "\x1b[?1049l";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "localscribe-tui-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const base = () => join(dir, "rec");
const recording = (contextFiles: string[] = []): RecordingState => ({
  pid: 1, file: `${base()}.mp4`, videoFile: `${base()}.mp4`, videoHasMic: true, startedAt: STARTED_AT,
  pluginOptions: { transcribe: true, liveCaptions: true, role: "meeting", contextFiles },
});

function fakeTerminal() {
  const listeners = new Set<(chunk: Buffer) => void>();
  const log = { rawModes: [] as boolean[], resumed: 0, paused: 0, written: [] as string[] };
  return {
    log,
    listeners,
    type: (text: string) => { for (const listener of [...listeners]) listener(Buffer.from(text)); },
    stdin: {
      setRawMode: (raw: boolean) => void log.rawModes.push(raw),
      resume: () => void log.resumed++,
      pause: () => void log.paused++,
      on: (_event: "data", listener: (chunk: Buffer) => void) => void listeners.add(listener),
      off: (_event: "data", listener: (chunk: Buffer) => void) => void listeners.delete(listener),
    },
    stdout: { write: (text: string) => void log.written.push(text), columns: 200, rows: 24 },
  };
}

interface Options {
  activeReads: number; // how many loop iterations the recording stays active
  onSleep?: (iteration: number, terminal: ReturnType<typeof fakeTerminal>) => Promise<void> | void;
  contextFiles?: string[];
  hermes?: Partial<HermesResult>;
}

function harness({ activeReads, onSleep, contextFiles, hermes }: Options) {
  const terminal = fakeTerminal();
  const hermesArgs: string[][] = [];
  let reads = 0;
  let sleeps = 0;
  const runTui = createTui({
    stdin: terminal.stdin,
    stdout: terminal.stdout,
    sleep: async () => { const iteration = sleeps++; await onSleep?.(iteration, terminal); },
    readActive: () => (reads++ < activeReads ? recording(contextFiles) : null),
    now: () => Date.parse(STARTED_AT) + 83_000,
    run: async (args) => {
      hermesArgs.push(args);
      return { exitCode: 0, stdout: "", stderr: "", timedOut: false, ...hermes };
    },
  });
  return { terminal, hermesArgs, sleeps: () => sleeps, run: () => runTui(recording(contextFiles)) };
}

const lastFrame = (written: string[]) => written.findLast((chunk) => chunk.startsWith("\x1b[H"))!;

describe("live view loop", () => {
  test("draws the live captions found in the transcript file", async () => {
    writeFileSync(`${base()}.live.txt`, "[00:01] me: hello there\n[00:02] them: general kenobi\n");
    const { terminal, run } = harness({ activeReads: 2 });
    await run();
    const screen = lastFrame(terminal.log.written);
    expect(screen).toContain("[00:01] me: hello there");
    expect(screen).toContain("[00:02] them: general kenobi");
  });

  test("shows the new captions of a file that has not been created yet once it appears", async () => {
    const { terminal, run } = harness({
      activeReads: 3,
      onSleep: (iteration) => { if (iteration === 0) writeFileSync(`${base()}.live.txt`, "[00:05] them: late arrival\n"); },
    });
    await run();
    expect(lastFrame(terminal.log.written)).toContain("[00:05] them: late arrival");
  });

  test("takes over the terminal on entry and gives it back on exit", async () => {
    const { terminal, run } = harness({ activeReads: 1 });
    await run();
    const { written, rawModes, resumed, paused } = terminal.log;
    expect(written[0]).toBe(ENTER_SCREEN);
    expect(written.at(-1)).toBe(LEAVE_SCREEN);
    expect(rawModes).toEqual([true, false]);
    expect([resumed, paused]).toEqual([1, 1]);
    expect(terminal.listeners.size).toBe(0);
  });

  test("ends on its own when the recording stops", async () => {
    const { sleeps, run } = harness({ activeReads: 3 });
    await run();
    expect(sleeps()).toBe(3);
  });

  test("Ctrl-C leaves the view while the recording keeps going", async () => {
    const { terminal, sleeps, run } = harness({ activeReads: 100, onSleep: (_i, term) => term.type("\x03") });
    await run();
    expect(sleeps()).toBe(1);
    expect(terminal.log.written.at(-1)).toBe(LEAVE_SCREEN);
  });

  test("a typed note is saved next to the recording and shown with its time", async () => {
    const { terminal, run } = harness({
      activeReads: 2,
      onSleep: (iteration, term) => { if (iteration === 0) term.type("buy milk\r"); },
    });
    await run();
    expect(readFileSync(`${base()}.manual.md`, "utf8")).toBe("[01:23] note: buy milk\n");
    expect(lastFrame(terminal.log.written)).toContain("[01:23] note: buy milk");
  });

  test("an arrow key is not typed into the input line", async () => {
    const { terminal, run } = harness({
      activeReads: 1,
      onSleep: (_i, term) => { term.type("ab"); term.type("\x1b[A"); },
    });
    await run();
    const screen = lastFrame(terminal.log.written);
    expect(screen).toContain("> ab");
    expect(screen).not.toContain("[A");
  });

  test("lists how many context files go to Hermes", async () => {
    const context = join(dir, "resume.md");
    writeFileSync(context, "ten years of Rust");
    const { terminal, run } = harness({ activeReads: 1, contextFiles: [context] });
    await run();
    expect(terminal.log.written.join("")).toContain("+ 1 context file(s) go to Hermes");
  });

  test("a ?question goes to Hermes and the answer is shown under Suggestions", async () => {
    const { terminal, hermesArgs, run } = harness({
      activeReads: 5,
      hermes: { stdout: "A hostname lookup." },
      onSleep: async (iteration, term) => {
        if (iteration === 0) term.type("?what is dns\r");
        await Bun.sleep(10);
      },
    });
    await run();
    expect(hermesArgs).toHaveLength(1);
    expect(hermesArgs[0]!.at(-1)).toContain("what is dns");
    const screen = lastFrame(terminal.log.written);
    expect(screen).toContain("Q: what is dns");
    expect(screen).toContain("A: A hostname lookup.");
  });
});

describe("live view failures", () => {
  test("an unreadable transcript still restores the terminal and reports the error", async () => {
    mkdirSync(`${base()}.live.txt`);
    const { terminal, run } = harness({ activeReads: 1 });
    await expect(run()).rejects.toThrow();
    expect(terminal.log.written.at(-1)).toBe(LEAVE_SCREEN);
    expect(terminal.log.rawModes).toEqual([true, false]);
    expect(terminal.listeners.size).toBe(0);
  });

  test("a context file that cannot be read fails before the terminal is touched", async () => {
    const missing = join(dir, "gone.md");
    const { terminal, run } = harness({ activeReads: 1, contextFiles: [missing] });
    await expect(run()).rejects.toThrow(`cannot read context file ${missing}`);
    expect(terminal.log.written).toEqual([]);
    expect(terminal.log.rawModes).toEqual([]);
  });
});
