import { describe, expect, test } from "bun:test";
import type { RecordingState } from "../state.ts";
import { createLiveCommand } from "./live.ts";

const state = (liveCaptions: boolean): RecordingState => ({
  pid: 1, file: "/r/a.mp4", videoFile: "/r/a.mp4", videoHasMic: true,
  startedAt: "2026-10-14T22:05:29.000Z", pluginOptions: { transcribe: liveCaptions, liveCaptions },
});

const run = async (active: RecordingState | null, isTty = true) => {
  const errors: string[] = [];
  let ran = false;
  const code = await createLiveCommand({
    active: () => active,
    isTty,
    printError: (text) => void errors.push(text),
    runTui: async () => void (ran = true),
  })({ positionals: [], values: {} });
  return { code, errors, ran };
};

describe("live command", () => {
  test("not recording", async () => {
    expect(await run(null)).toEqual({ code: 1, errors: ["not recording"], ran: false });
  });

  test("recording without --live", async () => {
    const result = await run(state(false));
    expect(result.code).toBe(1);
    expect(result.errors.join()).toContain("--live");
    expect(result.ran).toBe(false);
  });

  test("needs a terminal", async () => {
    const result = await run(state(true), false);
    expect(result.code).toBe(1);
    expect(result.errors.join()).toContain("terminal");
  });

  test("runs the tui for a live recording and exits 0", async () => {
    expect(await run(state(true))).toEqual({ code: 0, errors: [], ran: true });
  });
});
