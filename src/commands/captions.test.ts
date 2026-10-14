import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RecordingState } from "../state.ts";
import { createCaptionsCommand } from "./captions.ts";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "localscribe-captions-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const recording = (liveCaptions: boolean): RecordingState => ({
  pid: 1, file: join(dir, "rec.mp4"), videoFile: join(dir, "rec.mp4"), videoHasMic: true,
  startedAt: "2026-10-14T22:05:29.000Z", pluginOptions: { transcribe: liveCaptions, liveCaptions },
});
const args = { positionals: [], values: {} };

function harness(state: RecordingState | null, onSleep: (tick: number) => void) {
  const out: string[] = [];
  const err: string[] = [];
  let tick = 0;
  let active = state;
  const command = createCaptionsCommand({
    active: () => active,
    sleep: async () => {
      onSleep(tick++);
      if (tick > 3) active = null;
    },
    print: (text) => void out.push(text),
    printError: (text) => void err.push(text),
  });
  return { command, out, err };
}

describe("captions command", () => {
  test("not recording exits 1", async () => {
    const { command, err } = harness(null, () => {});
    expect(await command(args)).toBe(1);
    expect(err.join("")).toContain("not recording");
  });

  test("recording without --live explains how to enable captions", async () => {
    const { command, err } = harness(recording(false), () => {});
    expect(await command(args)).toBe(1);
    expect(err.join("")).toContain("--live");
  });

  test("prints existing and new lines, then exits 0 once the recording stops", async () => {
    const live = join(dir, "rec.live.txt");
    writeFileSync(live, " first line\n");
    const { command, out } = harness(recording(true), (tick) => {
      if (tick === 1) appendFileSync(live, " second line\n");
      if (tick === 2) appendFileSync(live, " last line\n");
    });
    expect(await command(args)).toBe(0);
    expect(out.join("")).toBe(" first line\n second line\n last line\n");
  });

  test("waits for the live file to appear", async () => {
    const live = join(dir, "rec.live.txt");
    const { command, out } = harness(recording(true), (tick) => {
      if (tick === 1) writeFileSync(live, " hello\n");
    });
    expect(await command(args)).toBe(0);
    expect(out.join("")).toBe(" hello\n");
  });
});
