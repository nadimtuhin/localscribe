import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { RecordingState } from "../state.ts";
import { createStatusCommand } from "./status.ts";

let out: string[];
beforeEach(() => {
  out = [];
  spyOn(console, "log").mockImplementation((...args) => void out.push(args.join(" ")));
});
afterEach(() => (console.log as unknown as { mockRestore(): void }).mockRestore());

const recording: RecordingState = {
  pid: 1, file: "/r/demo.mp4", videoFile: "/r/demo.mp4", videoHasMic: true, startedAt: "2026-10-14T22:00:00.000Z",
};
const run = (active: RecordingState | null, now = Date.parse("2026-10-14T22:01:05.000Z"), json = false) =>
  createStatusCommand(() => active, () => now)({ positionals: [], values: { json } });

describe("status command", () => {
  test("says not recording and fails when nothing is recording", async () => {
    expect(await run(null)).toBe(1);
    expect(out).toEqual(["not recording"]);
  });

  test("names the file and how long it has been recording, and succeeds", async () => {
    expect(await run(recording)).toBe(0);
    expect(out).toEqual(["recording /r/demo.mp4 (1m05s)"]);
  });

  test("--json reports the file, start time and elapsed milliseconds while recording", async () => {
    expect(await run(recording, undefined, true)).toBe(0);
    expect(JSON.parse(out[0]!)).toEqual({ recording: true, file: "/r/demo.mp4", startedAt: "2026-10-14T22:00:00.000Z", elapsedMs: 65000 });
  });

  test("--json reports recording false and still fails when idle", async () => {
    expect(await run(null, undefined, true)).toBe(1);
    expect(JSON.parse(out[0]!)).toEqual({ recording: false });
  });
});
