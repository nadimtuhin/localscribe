import { beforeEach, describe, expect, test } from "bun:test";
import { createLastCommand, lastCommand, readText, type LastDeps } from "./last.ts";

let log: string[];
beforeEach(() => {
  log = [];
});

const files = (path: string, date = new Date("2026-10-21T12:00:00.000Z")) => ({
  name: path.split("/").pop()!,
  path,
  bytes: 10 * 1024 * 1024,
  modified: date,
});

const createDeps = (overrides: Partial<LastDeps> = {}): LastDeps => ({
  list: () => [files("/r/demo.mp4")],
  exists: () => true,
  read: () => "## Summary\nKey points discussed.\n## Next",
  log: (text) => log.push(text),
  ...overrides,
});

describe("last command", () => {
  test("fails when no recordings yet", async () => {
    const code = await createLastCommand(createDeps({ list: () => [] }))({ positionals: [], values: {} });
    expect(code).toBe(1);
    expect(log).toEqual(["no recordings yet"]);
  });

  test("prints human readable details and summary when notes and transcript exist", async () => {
    const code = await createLastCommand(createDeps())({ positionals: [], values: {} });
    expect(code).toBe(0);
    expect(log.some((l) => l.includes("demo.mp4") && l.includes("10.0 MB"))).toBe(true);
    expect(log).toContain("video: /r/demo.mp4");
    expect(log).toContain("notes: /r/demo.notes.md");
    expect(log).toContain("transcript: /r/demo.transcript.md");
    expect(log).toContain("\nKey points discussed.");
  });

  test("summary extracts to end of file when no next section header", async () => {
    const code = await createLastCommand(createDeps({
      read: () => "## Summary\nAll the way to EOF.",
    }))({ positionals: [], values: {} });
    expect(code).toBe(0);
    expect(log).toContain("\nAll the way to EOF.");
  });

  test("skips summary output when notes file has no Summary section", async () => {
    const code = await createLastCommand(createDeps({
      read: () => "Just some raw notes without summary section.",
    }))({ positionals: [], values: {} });
    expect(code).toBe(0);
    expect(log).toContain("notes: /r/demo.notes.md");
    expect(log.some((l) => l.startsWith("\n"))).toBe(false);
  });

  test("omits notes and transcript lines when neither exists", async () => {
    const code = await createLastCommand(createDeps({
      exists: () => false,
    }))({ positionals: [], values: {} });
    expect(code).toBe(0);
    expect(log).toContain("video: /r/demo.mp4");
    expect(log.some((l) => l.startsWith("notes:"))).toBe(false);
    expect(log.some((l) => l.startsWith("transcript:"))).toBe(false);
  });

  test("--json outputs JSON object with metadata and paths", async () => {
    const date = new Date("2026-10-21T12:00:00.000Z");
    const code = await createLastCommand(createDeps({
      list: () => [files("/r/demo.mp4", date)],
      exists: (p) => p.endsWith(".notes.md"),
    }))({ positionals: [], values: { json: true } });
    expect(code).toBe(0);
    expect(log.length).toBe(1);
    const parsed = JSON.parse(log[0]);
    expect(parsed).toEqual({
      file: "/r/demo.mp4",
      name: "demo.mp4",
      bytes: 10 * 1024 * 1024,
      modified: date.toISOString(),
      notes: "/r/demo.notes.md",
      transcript: null,
    });
  });

  test("readText reads real file from disk", () => {
    expect(readText("package.json")).toContain("localscribe");
  });

  test("default lastCommand uses real dependencies", () => {
    expect(typeof lastCommand).toBe("function");
  });
});
