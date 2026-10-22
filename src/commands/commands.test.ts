import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { normalizeLanguageArgs, runCli } from "./index.ts";
import { createLiveCommand } from "./live.ts";
import type { CliArgs } from "./shared.ts";
import { runsLiveInForeground, startMessage } from "./start.ts";

let out: string[];
let err: string[];
beforeEach(() => {
  out = [];
  err = [];
  spyOn(console, "log").mockImplementation((...args) => void out.push(args.join(" ")));
  spyOn(console, "error").mockImplementation((...args) => void err.push(args.join(" ")));
});
afterEach(() => {
  (console.log as unknown as { mockRestore(): void }).mockRestore();
  (console.error as unknown as { mockRestore(): void }).mockRestore();
});

describe("normalizeLanguageArgs", () => {
  test("merges separate tokens after --lang", () => {
    expect(normalizeLanguageArgs(["start", "--lang", "en", "bn"])).toEqual(["start", "--lang", "en,bn"]);
    expect(normalizeLanguageArgs(["start", "--lang", "en,bn"])).toEqual(["start", "--lang", "en,bn"]);
    expect(normalizeLanguageArgs(["start", "--lang", "en", "--lang", "bn"])).toEqual(["start", "--lang", "en,bn"]);
    expect(normalizeLanguageArgs(["start", "--lang=en", "bn"])).toEqual(["start", "--lang", "en,bn"]);
    expect(normalizeLanguageArgs(["start", "--lang=en,bn"])).toEqual(["start", "--lang", "en,bn"]);
    expect(normalizeLanguageArgs(["start", "--no-mic", "-d"])).toEqual(["start", "--no-mic", "-d"]);
  });
});

describe("runCli", () => {
  test("no command prints help and fails; --help succeeds", async () => {
    expect(await runCli([])).toBe(1);
    expect(await runCli(["--help"])).toBe(0);
    expect(out.join("\n")).toContain("localscribe start");
  });

  test("--help after a command prints help instead of running it", async () => {
    expect(await runCli(["stop", "--help"])).toBe(0);
    expect(out.join("\n")).toContain("localscribe start");
    expect(err.join("\n")).not.toContain("not recording");
  });

  test("help documents the live command", async () => {
    await runCli(["--help"]);
    expect(out.join("\n")).toContain("localscribe live");
  });

  test("live without a recording fails with a clear message", async () => {
    const live = createLiveCommand({ active: () => null, isTty: true, printError: (text) => void err.push(text), runTui: async () => {} });
    expect(await live({} as CliArgs)).toBe(1);
    expect(err.join("\n")).toContain("not recording");
  });

  test("start --live stays in the foreground with the live view unless detached or not a terminal", () => {
    expect(runsLiveInForeground({ live: true }, true)).toBe(true);
    expect(runsLiveInForeground({ live: true, detach: true }, true)).toBe(false);
    expect(runsLiveInForeground({ live: true }, false)).toBe(false);
    expect(runsLiveInForeground({}, true)).toBe(false);
  });

  test("start prints the live hint only for --live", () => {
    expect(startMessage("/r/a.mp4", true)).toContain("run `localscribe live` in another pane");
    expect(startMessage("/r/a.mp4", false)).not.toContain("localscribe live");
  });

  test("list runs against the recordings dir without throwing", async () => {
    expect(await runCli(["list"])).toBe(0);
  });

  test("capture-source and engine flags parse and are documented in help", async () => {
    await runCli(["--help", "--window", "Safari", "--area", "0,0,800,600", "--display", "1", "--engine", "sck", "--json"]);
    const help = out.join("\n");
    for (const flag of ["--window", "--area", "--display", "--engine", "devices", "open", "copy", "last", "optimize", "queue"]) expect(help).toContain(flag);
  });
});

describe("help", () => {
  test("documents --lang for start and notes", async () => {
    await runCli([]);
    const help = out.join("\n");
    expect(help).toMatch(/start .*\n(.*\n)*.*\[--lang <language>\]/);
    expect(help).toMatch(/notes <mp4\|transcript\.md> \[--lang <language>\]/);
  });
});
