import { describe, expect, test } from "bun:test";
import type { RecordingFile } from "../recorder.ts";
import { formatSize } from "./shared.ts";
import { createListCommand } from "./list.ts";

function run(files: RecordingFile[]) {
  const logged: string[] = [];
  const command = createListCommand({ list: () => files, log: (text) => void logged.push(text) });
  return { logged, exit: () => command({ positionals: [], values: {} }) };
}

describe("list command", () => {
  test("says so when there are no recordings", async () => {
    const { logged, exit } = run([]);
    expect(await exit()).toBe(0);
    expect(logged).toEqual(["no recordings yet"]);
  });

  test("prints one line per recording with its date, size and name", async () => {
    const modified = new Date(2026, 9, 14, 22, 5, 29);
    const { logged, exit } = run([{ name: "demo.mp4", path: "/r/demo.mp4", bytes: 5_242_880, modified }]);
    await exit();
    expect(logged).toEqual([`${modified.toLocaleString()}  ${formatSize(5_242_880).padStart(9)}  demo.mp4`]);
    expect(logged[0]).toEndWith("  demo.mp4");
  });
});
