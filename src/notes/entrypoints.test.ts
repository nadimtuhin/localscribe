import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNotesCommand } from "../commands/notes.ts";
import { createNotesPlugin } from "../plugins/notes.ts";
import { runStopHooks } from "../plugins/index.ts";
import type { HermesRun } from "./generate.ts";

const fixture = join(import.meta.dir, "../../test/fixtures/sample.transcript.md");
const reply = "## Summary\nA sync.";
const ok: HermesRun = async () => ({ exitCode: 0, stdout: reply, stderr: "", timedOut: false });
const boom: HermesRun = async () => { throw new Error("hermes not found"); };

let dir: string;
let base: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "notes-entry-"));
  base = join(dir, "rec");
  copyFileSync(fixture, `${base}.transcript.md`);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const stopContext = (lines: string[], options = { notes: true }) => ({
  base, options, log: (line: string) => lines.push(line), file: `${base}.mp4`,
  startedAt: "2026-10-14T22:05:29.000Z", durationMs: 135_000, pluginStates: {},
});

describe("notes plugin", () => {
  test("is enabled only by --notes", () => {
    const plugin = createNotesPlugin(ok);
    expect(plugin.enabled({ notes: true })).toBe(true);
    expect(plugin.enabled({ transcribe: true })).toBe(false);
  });

  test("stop writes notes with date and duration from the recording", async () => {
    const lines: string[] = [];
    await runStopHooks([createNotesPlugin(ok)], stopContext(lines));
    expect(readFileSync(`${base}.notes.md`, "utf8")).toBe(`# Notes: rec.mp4\n\n- Date: 2026-10-14\n- Duration: 2m15s\n\n${reply}\n`);
    expect(lines[0]).toContain("sending the transcript to Hermes");
  });

  test("a hermes failure is logged and does not throw out of stop", async () => {
    const lines: string[] = [];
    await runStopHooks([createNotesPlugin(boom)], stopContext(lines));
    expect(lines).toContain("notes: hermes not found");
    expect(existsSync(`${base}.notes.md`)).toBe(false);
  });

  test("does nothing when notes are not requested", async () => {
    const lines: string[] = [];
    await runStopHooks([createNotesPlugin(boom)], stopContext(lines, { notes: false }));
    expect(lines).toEqual([]);
  });
});

describe("notes command", () => {
  const run = (arg: string[], hermes: HermesRun, lines: string[]) =>
    createNotesCommand(hermes, (line) => lines.push(line))({ positionals: arg, values: {} as never });

  test.each([[".mp4"], [".transcript.md"], [""]])("accepts a path ending %p", async (suffix) => {
    const lines: string[] = [];
    expect(await run([`${base}${suffix}`], ok, lines)).toBe(0);
    expect(readFileSync(`${base}.notes.md`, "utf8")).toContain(reply);
  });

  test("without a transcript it says so and exits 0", async () => {
    const lines: string[] = [];
    expect(await run([join(dir, "other.mp4")], ok, lines)).toBe(0);
    expect(lines.at(-1)).toContain("run with --transcribe first");
  });

  test("hermes failure exits 0 with the reason", async () => {
    const lines: string[] = [];
    expect(await run([`${base}.mp4`], boom, lines)).toBe(0);
    expect(lines.at(-1)).toBe("notes: hermes not found");
  });

  test("requires a path argument", async () => {
    const lines: string[] = [];
    expect(await run([], ok, lines)).toBe(1);
    expect(lines.at(-1)).toContain("usage: localscribe notes");
  });
});
