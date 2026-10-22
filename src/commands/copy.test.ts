import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { copyCommand, createCopyCommand, copyToClipboard, readText } from "./copy.ts";

let log: string[];
beforeEach(() => { log = []; });

const files = (path: string) => ({ name: path, path, bytes: 1024, modified: new Date() });

describe("copy command", () => {
  test("copies the notes file for the newest recording", async () => {
    const list = [files("/r/demo.mp4")];
    const read = (p: string) => p.endsWith(".notes.md") ? "notes content" : "tx content";
    const copied: string[] = [];
    const code = await createCopyCommand(
      { list: () => list, exists: (p) => p.endsWith(".notes.md"), read, log: (t) => void log.push(t) },
      (text) => { copied.push(text); return true; },
    )({ positionals: [], values: {} });
    expect(code).toBe(0);
    expect(copied).toEqual(["notes content"]);
    expect(log).toEqual(["copied to clipboard: /r/demo.notes.md"]);
  });

  test("copies explicit positional target", async () => {
    const read = (p: string) => p.endsWith(".notes.md") ? "notes content" : "tx content";
    const copied: string[] = [];
    const code = await createCopyCommand(
      { list: () => [], exists: (p) => p.endsWith(".notes.md"), read, log: (t) => void log.push(t) },
      (text) => { copied.push(text); return true; },
    )({ positionals: ["/custom/rec.mp4"], values: {} });
    expect(code).toBe(0);
    expect(copied).toEqual(["notes content"]);
    expect(log).toEqual(["copied to clipboard: /custom/rec.notes.md"]);
  });

  test("--transcribe prefers the transcript file when present", async () => {
    const list = [files("/r/demo.mp4")];
    const read = (p: string) => p.endsWith(".transcript.md") ? "tx content" : "notes content";
    const copied: string[] = [];
    await createCopyCommand(
      { list: () => list, exists: (p) => p.endsWith(".transcript.md"), read, log: () => {} },
      (text) => { copied.push(text); return true; },
    )({ positionals: [], values: { transcribe: true } });
    expect(copied).toEqual(["tx content"]);
  });

  test("falls back to the transcript when notes is missing", async () => {
    const list = [files("/r/demo.mp4")];
    const read = (p: string) => p.endsWith(".transcript.md") ? "tx content" : "notes content";
    const copied: string[] = [];
    await createCopyCommand(
      { list: () => list, exists: (p) => p.endsWith(".transcript.md"), read, log: () => {} },
      (text) => { copied.push(text); return true; },
    )({ positionals: [], values: {} });
    expect(copied).toEqual(["tx content"]);
  });

  test("fails when neither notes nor transcript exist", async () => {
    const list = [files("/r/demo.mp4")];
    const code = await createCopyCommand(
      { list: () => list, exists: () => false, read: () => "", log: (t) => void log.push(t) },
      () => false,
    )({ positionals: [], values: {} });
    expect(code).toBe(1);
    expect(log).toEqual(["no notes or transcript found for /r/demo.mp4"]);
  });

  test("fails when no recordings exist", async () => {
    const code = await createCopyCommand(
      { list: () => [], exists: () => false, read: () => "", log: (t) => void log.push(t) },
      () => false,
    )({ positionals: [], values: {} });
    expect(code).toBe(1);
    expect(log).toEqual(["no recordings found"]);
  });

  test("copyToClipboard returns true on success", () => {
    expect(copyToClipboard("hello")).toBe(true);
  });

  test("copyToClipboard handles non-zero exit code and errors", () => {
    expect(copyToClipboard("fail", () => ({ exitCode: 1 } as unknown as ReturnType<typeof Bun.spawnSync>))).toBe(false);
    expect(copyToClipboard("throw", () => { throw new Error("pipe failed"); })).toBe(false);
  });

  test("readText reads real file from disk", () => {
    expect(readText("package.json")).toContain("localscribe");
  });

  test("default copyCommand runs against real dependencies", async () => {
    const tmp = join(tmpdir(), `test-copy-${Date.now()}.notes.md`);
    writeFileSync(tmp, "hello real");
    try {
      const code = await copyCommand({ positionals: [tmp], values: {} });
      expect(code).toBe(0);
    } finally {
      try { unlinkSync(tmp); } catch {}
    }
  });
});
