import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { StopResult } from "../recorder.ts";
import { createStopCommand } from "./stop.ts";

let out: string[];
let err: string[];
let warn: string[];
beforeEach(() => {
  out = [];
  err = [];
  warn = [];
  spyOn(console, "log").mockImplementation((...args) => void out.push(args.join(" ")));
  spyOn(console, "error").mockImplementation((...args) => void err.push(args.join(" ")));
  spyOn(console, "warn").mockImplementation((...args) => void warn.push(args.join(" ")));
});
afterEach(() => {
  for (const method of [console.log, console.error, console.warn]) (method as unknown as { mockRestore(): void }).mockRestore();
});

const result = (overrides: Partial<StopResult> = {}): StopResult => ({
  file: "/r/demo.mp4", durationMs: 125_000, bytes: 3 * 1024 * 1024, forced: false, keptParts: [], ...overrides,
});
const run = (stopResult: StopResult) => createStopCommand(async () => stopResult)({ positionals: [], values: {} });

describe("stop command", () => {
  test("reports the saved file with its duration and size, and succeeds", async () => {
    expect(await run(result())).toBe(0);
    expect(out).toEqual(["saved /r/demo.mp4 (2m05s, 3.0 MB)"]);
    expect(warn).toEqual([]);
  });

  test("warns that the file may be truncated when a recorder had to be killed", async () => {
    expect(await run(result({ forced: true }))).toBe(0);
    expect(warn).toEqual(["warning: a recorder process did not exit in time and was killed; file may be truncated"]);
  });

  test("a failed mix fails the command and lists the raw parts that were kept", async () => {
    const code = await run(result({ mixError: "mux broke", keptParts: ["/r/demo.video.mp4", "/r/demo.system.m4a"] }));
    expect(code).toBe(1);
    expect(err).toEqual(["mixing audio failed; raw parts kept:\n  /r/demo.video.mp4\n  /r/demo.system.m4a\nmux broke"]);
    expect(out).toEqual([]);
  });

  test("a recorder error from stop propagates to the caller", async () => {
    const command = createStopCommand(async () => { throw new Error("not recording"); });
    await expect(command({ positionals: [], values: {} })).rejects.toThrow("not recording");
  });
});
