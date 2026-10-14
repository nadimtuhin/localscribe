import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateNotes, type HermesRun } from "./generate.ts";

const fixture = join(import.meta.dir, "../../test/fixtures/sample.transcript.md");
const meta = (dir: string) => ({ file: join(dir, "rec.mp4"), startedAt: "2026-10-14T22:05:29.000Z", durationMs: 135_000, timeZone: "UTC" });
const reply = "## Summary\nA sync.\n## Key points\n- x\n## Decisions\n- y\n## Action items\n- [ ] z\n## Suggestions\n- w";
const ok = (stdout = reply): HermesRun => async () => ({ exitCode: 0, stdout, stderr: "", timedOut: false });

let dir: string;
let base: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "notes-test-"));
  base = join(dir, "rec");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const withTranscript = () => copyFileSync(fixture, `${base}.transcript.md`);

describe("generateNotes", () => {
  test("writes <base>.notes.md with header and hermes reply", async () => {
    withTranscript();
    const result = await generateNotes(base, meta(dir), ok());
    expect(result).toEqual({ written: true, message: `notes: wrote ${base}.notes.md` });
    expect(readFileSync(`${base}.notes.md`, "utf8")).toBe(`# Notes: rec.mp4\n\n- Started: 2026-10-14 22:05\n- Duration: 2m15s\n\n${reply}\n`);
  });

  test("passes the fixture transcript to hermes inside a delimited block, with safety flags and a fresh cwd", async () => {
    withTranscript();
    let seen: { args: string[]; cwd: string; timeoutMs: number } | undefined;
    await generateNotes(base, meta(dir), async (args, cwd, timeoutMs) => {
      seen = { args, cwd, timeoutMs };
      return { exitCode: 0, stdout: reply, stderr: "", timedOut: false };
    });
    expect(seen!.args).toContain("--ignore-rules");
    expect(seen!.args.slice(seen!.args.indexOf("-t"), seen!.args.indexOf("-t") + 2)).toEqual(["-t", "todo"]);
    expect(seen!.args.at(-1)).toMatch(/<transcript-\w+>\n\[00:00\] Okay, let.s get started./);
    expect(seen!.timeoutMs).toBe(120_000);
    expect(seen!.cwd).not.toBe(dir);
    expect(seen!.cwd).not.toBe(process.cwd());
  });

  test("feeds <base>.manual.md to hermes when it exists", async () => {
    withTranscript();
    writeFileSync(`${base}.manual.md`, "[00:30] note: ask about budget\n");
    let prompt = "";
    await generateNotes(base, meta(dir), async (args) => {
      prompt = args.at(-1)!;
      return { exitCode: 0, stdout: reply, stderr: "", timedOut: false };
    });
    expect(prompt).toMatch(/<manual_notes-\w+>\n\[00:30\] note: ask about budget/);
  });

  test("tells hermes the user's role when the recording has one", async () => {
    withTranscript();
    let prompt = "";
    await generateNotes(base, { ...meta(dir), role: "interviewer" }, async (args) => {
      prompt = args.at(-1)!;
      return { exitCode: 0, stdout: reply, stderr: "", timedOut: false };
    });
    expect(prompt).toContain("The user's role in this conversation: interviewer");
  });

  test("prefers the speaker-labelled <base>.live.txt over the mixed-audio transcript", async () => {
    withTranscript();
    writeFileSync(`${base}.live.txt`, "[00:01] me: what is the budget\n[00:04] them: ten thousand\n");
    let prompt = "";
    await generateNotes(base, meta(dir), async (args) => {
      prompt = args.at(-1)!;
      return { exitCode: 0, stdout: reply, stderr: "", timedOut: false };
    });
    expect(prompt).toContain("[00:01] me: what is the budget");
    expect(prompt).not.toContain("Okay, let's get started.");
  });

  test("falls back to the transcript when <base>.live.txt is empty", async () => {
    withTranscript();
    writeFileSync(`${base}.live.txt`, "");
    let prompt = "";
    await generateNotes(base, meta(dir), async (args) => {
      prompt = args.at(-1)!;
      return { exitCode: 0, stdout: reply, stderr: "", timedOut: false };
    });
    expect(prompt).toContain("Okay, let's get started.");
  });

  test("removes the temp cwd afterwards, even when hermes fails", async () => {
    withTranscript();
    let cwd = "";
    const run: HermesRun = async (_args, c) => {
      cwd = c;
      writeFileSync(join(c, "scratch.txt"), "x");
      throw new Error("kaboom");
    };
    const result = await generateNotes(base, meta(dir), run);
    expect(result).toEqual({ written: false, message: "notes: kaboom" });
    expect(existsSync(cwd)).toBe(false);
  });

  test("missing transcript says to run with --transcribe first and never calls hermes", async () => {
    let called = false;
    const result = await generateNotes(base, meta(dir), async () => { called = true; return { exitCode: 0, stdout: "x", stderr: "", timedOut: false }; });
    expect(result).toEqual({ written: false, message: "notes: no transcript, skipped (run with --transcribe first)" });
    expect(called).toBe(false);
  });

  test("empty transcript is treated as missing", async () => {
    writeFileSync(`${base}.transcript.md`, "  \n");
    const result = await generateNotes(base, meta(dir), ok());
    expect(result.written).toBe(false);
    expect(result.message).toContain("no transcript");
  });

  test("never overwrites an existing notes file", async () => {
    withTranscript();
    writeFileSync(`${base}.notes.md`, "mine");
    const result = await generateNotes(base, meta(dir), ok());
    expect(result).toEqual({ written: false, message: `notes: ${base}.notes.md already exists, not overwriting` });
    expect(readFileSync(`${base}.notes.md`, "utf8")).toBe("mine");
  });

  test("timeout is reported and writes nothing", async () => {
    withTranscript();
    const result = await generateNotes(base, meta(dir), async () => ({ exitCode: 1, stdout: "", stderr: "", timedOut: true }));
    expect(result).toEqual({ written: false, message: "notes: hermes timed out after 120s" });
    expect(existsSync(`${base}.notes.md`)).toBe(false);
  });

  test("non-zero exit reports the first stderr line", async () => {
    withTranscript();
    const result = await generateNotes(base, meta(dir), async () => ({ exitCode: 2, stdout: "", stderr: "no api key\nmore", timedOut: false }));
    expect(result).toEqual({ written: false, message: "notes: hermes failed (exit 2): no api key" });
  });

  test("empty hermes reply writes nothing", async () => {
    withTranscript();
    const result = await generateNotes(base, meta(dir), ok("  \n"));
    expect(result).toEqual({ written: false, message: "notes: hermes returned nothing" });
    expect(existsSync(`${base}.notes.md`)).toBe(false);
  });
});
