import { describe, expect, test } from "bun:test";
import { buildDevicesReport, formatDevicesText, listDevices } from "./devices.ts";
import type { ProcessRunner } from "../runner.ts";

const HELPER_JSON = JSON.stringify({
  displays: [{ id: 1, name: "Built-in", width: 1512, height: 982, scale: 2 }],
  windows: [{ id: 4242, app: "Safari", title: "GitHub" }],
});
const FFMPEG_STDERR = `[AVFoundation indev @ 0x1] AVFoundation video devices:
[AVFoundation indev @ 0x1] [0] Capture screen 0
[AVFoundation indev @ 0x1] AVFoundation audio devices:
[AVFoundation indev @ 0x1] [0] MacBook Pro Microphone`;

describe("buildDevicesReport", () => {
  test("merges helper sources with ffmpeg microphones in the documented shape", () => {
    expect(buildDevicesReport(HELPER_JSON, FFMPEG_STDERR)).toEqual({
      displays: [{ id: 1, name: "Built-in", width: 1512, height: 982, scale: 2 }],
      windows: [{ id: 4242, app: "Safari", title: "GitHub" }],
      microphones: [{ device: 0, name: "MacBook Pro Microphone" }],
    });
  });

  test("rejects helper output that is not the expected JSON", () => {
    expect(() => buildDevicesReport("oops", FFMPEG_STDERR)).toThrow("capture helper");
    expect(() => buildDevicesReport("{}", FFMPEG_STDERR)).toThrow("capture helper");
  });
});

describe("formatDevicesText", () => {
  test("lists each section with ids", () => {
    const text = formatDevicesText(buildDevicesReport(HELPER_JSON, FFMPEG_STDERR));
    expect(text).toContain("Displays");
    expect(text).toContain("1  Built-in  1512x982 @2x");
    expect(text).toContain("4242  Safari - GitHub");
    expect(text).toContain("0  MacBook Pro Microphone");
  });
});

describe("listDevices", () => {
  test("asks the helper for --list --json and ffmpeg for audio devices", () => {
    const calls: string[][] = [];
    const runner = {
      run: (command: string[]) => {
        calls.push(command);
        return command[0] === "/h/capture"
          ? { exitCode: 0, stdout: HELPER_JSON, stderr: "" }
          : { exitCode: 0, stdout: "", stderr: FFMPEG_STDERR };
      },
    } as unknown as ProcessRunner;
    const report = listDevices(runner, "/h/capture");
    expect(calls[0]).toEqual(["/h/capture", "--list", "--json"]);
    expect(report.microphones).toHaveLength(1);
  });

  test("surfaces helper stderr when it fails", () => {
    const runner = { run: () => ({ exitCode: 1, stdout: "", stderr: "no permission" }) } as unknown as ProcessRunner;
    expect(() => listDevices(runner, "/h/capture")).toThrow("no permission");
  });
});
