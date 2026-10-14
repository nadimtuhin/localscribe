import { describe, expect, test } from "bun:test";
import type { ProcessRunner } from "../runner.ts";
import { createDevicesCommand } from "./devices.ts";

const LIST = JSON.stringify({
  displays: [{ id: 1, name: "Built-in", width: 1512, height: 982, scale: 2 }],
  windows: [{ id: 4242, app: "Safari", title: "GitHub" }],
});
const MICS = "[x] AVFoundation audio devices:\n[x] [0] Mic";

const runner = {
  run: (command: string[]) =>
    command.includes("--list") ? { exitCode: 0, stdout: LIST, stderr: "" } : { exitCode: 0, stdout: "", stderr: MICS },
} as unknown as ProcessRunner;

function setup(values: { json?: boolean }) {
  const events: string[] = [];
  const logged: string[] = [];
  const command = createDevicesCommand({
    ensureToolPath: () => void events.push("path"),
    ensureHelper: (_runner, files) => (events.push(`helper:${files.binary.split("/").pop()}`), "/bin/localscribe-capture"),
    runner,
    log: (text) => void logged.push(text),
  });
  return { events, logged, run: () => command({ positionals: [], values }) };
}

describe("devices command", () => {
  test("puts Homebrew on PATH, then builds the capture helper, before listing", async () => {
    const { events, run } = setup({});
    expect(await run()).toBe(0);
    expect(events).toEqual(["path", "helper:localscribe-capture"]);
  });

  test("prints a readable listing of windows by default", async () => {
    const { logged, run } = setup({});
    await run();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("Safari - GitHub");
  });

  test("--json prints the whole report as one JSON object", async () => {
    const { logged, run } = setup({ json: true });
    await run();
    expect(JSON.parse(logged[0]!).microphones).toEqual([{ device: 0, name: "Mic" }]);
  });
});
