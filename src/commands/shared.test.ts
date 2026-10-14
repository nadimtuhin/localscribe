import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { formatDuration, formatSize, notImplemented, optionalNumber } from "./shared.ts";

describe("formatters", () => {
  test("duration is minutes and zero-padded seconds, rounded to the second", () => {
    expect(formatDuration(0)).toBe("0m00s");
    expect(formatDuration(125_400)).toBe("2m05s");
    expect(formatDuration(59_600)).toBe("1m00s");
  });

  test("size is megabytes with one decimal", () => {
    expect(formatSize(1_572_864)).toBe("1.5 MB");
  });

  test("optionalNumber parses a flag value and leaves an absent one undefined", () => {
    expect(optionalNumber("30")).toBe(30);
    expect(optionalNumber(undefined)).toBeUndefined();
  });
});

describe("notImplemented", () => {
  let err: string[];
  beforeEach(() => {
    err = [];
    spyOn(console, "error").mockImplementation((...args) => void err.push(args.join(" ")));
  });
  afterEach(() => (console.error as unknown as { mockRestore(): void }).mockRestore());

  test("prints which command is missing and fails", async () => {
    expect(await notImplemented("export")({ positionals: [], values: {} })).toBe(1);
    expect(err).toEqual(["export: not implemented"]);
  });
});
