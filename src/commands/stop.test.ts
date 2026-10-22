import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { StopResult } from "../recorder.ts";
import type { NotifyDeps } from "../notify.ts";
import { createStopCommand, type StopDeps } from "./stop.ts";

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

const deps = (stopResult: StopResult, notified: string[] = []): StopDeps => ({
  stop: async () => stopResult,
  notify: (file: string, _deps: NotifyDeps) => void notified.push(file),
  runner: {} as StopDeps["runner"],
  log: (text) => void out.push(text),
  warn: (text) => void warn.push(text),
  error: (text) => void err.push(text),
});

describe("stop command", () => {
  test("reports the saved file with its duration and size, and succeeds", async () => {
    expect(await createStopCommand(deps(result()))({ positionals: [], values: {} })).toBe(0);
    expect(out).toEqual(["saved /r/demo.mp4 (2m05s, 3.0 MB)"]);
    expect(warn).toEqual([]);
  });

  test("warns that the file may be truncated when a recorder had to be killed", async () => {
    expect(await createStopCommand(deps(result({ forced: true })))({ positionals: [], values: {} })).toBe(0);
    expect(warn).toEqual(["warning: a recorder process did not exit in time and was killed; file may be truncated"]);
  });

  test("a failed mix fails the command and lists the raw parts that were kept", async () => {
    const failed = deps(result({ mixError: "mux broke", keptParts: ["/r/demo.video.mp4", "/r/demo.system.m4a"] }));
    const code = await createStopCommand(failed)({ positionals: [], values: {} });
    expect(code).toBe(1);
    expect(err).toEqual(["mixing audio failed; raw parts kept:\n  /r/demo.video.mp4\n  /r/demo.system.m4a\nmux broke"]);
    expect(out).toEqual([]);
  });

  test("--notify posts a notification for the finished file", async () => {
    const notified: string[] = [];
    expect(await createStopCommand(deps(result(), notified))({ positionals: [], values: { notify: true } })).toBe(0);
    expect(notified).toEqual(["/r/demo.mp4"]);
  });

  test("without --notify nothing is posted", async () => {
    const notified: string[] = [];
    await createStopCommand(deps(result(), notified))({ positionals: [], values: {} });
    expect(notified).toEqual([]);
  });

  test("a recorder error from stop propagates to the caller", async () => {
    const command = createStopCommand({ ...deps(result()), stop: async () => { throw new Error("not recording"); } });
    await expect(command({ positionals: [], values: {} })).rejects.toThrow("not recording");
  });
});
