import { beforeEach, describe, expect, test } from "bun:test";
import { createOpenCommand, openCommand, type OpenDeps } from "./open.ts";
import type { ProcessRunner } from "../runner.ts";

let log: string[];
let ranCommands: string[][];

const fakeRunner = {
  run: (command: string[]) => {
    ranCommands.push(command);
    return { exitCode: 0, stdout: "", stderr: "" };
  },
} as unknown as ProcessRunner;

beforeEach(() => {
  log = [];
  ranCommands = [];
});

const files = (path: string) => ({ name: path, path, bytes: 1024, modified: new Date() });

const createDeps = (overrides: Partial<OpenDeps> = {}): OpenDeps => ({
  list: () => [files("/r/demo.mp4")],
  runner: fakeRunner,
  log: (text) => log.push(text),
  exists: () => true,
  ...overrides,
});

describe("open command", () => {
  test("opens newest recording mp4 by default", async () => {
    const code = await createOpenCommand(createDeps())({ positionals: [], values: {} });
    expect(code).toBe(0);
    expect(ranCommands).toEqual([["open", "/r/demo.mp4"]]);
    expect(log).toEqual(["opened /r/demo.mp4"]);
  });

  test("--reveal flag passes -R to open", async () => {
    const code = await createOpenCommand(createDeps())({ positionals: [], values: { reveal: true } });
    expect(code).toBe(0);
    expect(ranCommands).toEqual([["open", "-R", "/r/demo.mp4"]]);
    expect(log).toEqual(["opened /r/demo.mp4"]);
  });

  test("--notes opens the notes file when present", async () => {
    const code = await createOpenCommand(createDeps({
      exists: (p) => p.endsWith(".notes.md") || p.endsWith(".mp4"),
    }))({ positionals: [], values: { notes: true } });
    expect(code).toBe(0);
    expect(ranCommands).toEqual([["open", "/r/demo.notes.md"]]);
    expect(log).toEqual(["opened /r/demo.notes.md"]);
  });

  test("--notes falls back to target if notes file does not exist", async () => {
    const code = await createOpenCommand(createDeps({
      exists: (p) => p.endsWith(".mp4"),
    }))({ positionals: [], values: { notes: true } });
    expect(code).toBe(0);
    expect(ranCommands).toEqual([["open", "/r/demo.mp4"]]);
    expect(log).toEqual(["opened /r/demo.mp4"]);
  });

  test("--transcribe opens the transcript file when present", async () => {
    const code = await createOpenCommand(createDeps({
      exists: (p) => p.endsWith(".transcript.md") || p.endsWith(".mp4"),
    }))({ positionals: [], values: { transcribe: true } });
    expect(code).toBe(0);
    expect(ranCommands).toEqual([["open", "/r/demo.transcript.md"]]);
    expect(log).toEqual(["opened /r/demo.transcript.md"]);
  });

  test("--transcribe falls back to target if transcript file does not exist", async () => {
    const code = await createOpenCommand(createDeps({
      exists: (p) => p.endsWith(".mp4"),
    }))({ positionals: [], values: { transcribe: true } });
    expect(code).toBe(0);
    expect(ranCommands).toEqual([["open", "/r/demo.mp4"]]);
    expect(log).toEqual(["opened /r/demo.mp4"]);
  });

  test("opens explicit positional target", async () => {
    const code = await createOpenCommand(createDeps())({ positionals: ["/custom/my-rec.mp4"], values: {} });
    expect(code).toBe(0);
    expect(ranCommands).toEqual([["open", "/custom/my-rec.mp4"]]);
    expect(log).toEqual(["opened /custom/my-rec.mp4"]);
  });

  test("fails when no recordings exist and no positional given", async () => {
    const code = await createOpenCommand(createDeps({
      list: () => [],
      exists: () => false,
    }))({ positionals: [], values: {} });
    expect(code).toBe(1);
    expect(log).toEqual(["no recordings found"]);
    expect(ranCommands).toEqual([]);
  });

  test("fails when target does not exist on disk", async () => {
    const code = await createOpenCommand(createDeps({
      exists: () => false,
    }))({ positionals: ["/nonexistent.mp4"], values: {} });
    expect(code).toBe(1);
    expect(log).toEqual(["no recordings found"]);
    expect(ranCommands).toEqual([]);
  });

  test("default openCommand uses default real dependencies", async () => {
    expect(typeof openCommand).toBe("function");
  });
});
