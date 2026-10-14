import { describe, expect, test } from "bun:test";
import { applyKey, renderScreen, type ScreenState } from "./render.ts";

// eslint-disable-next-line no-control-regex
const plain = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const size = { cols: 40, rows: 16 };
const base: ScreenState = { captions: [], suggestions: [], status: "", input: "" };
const rows = (state: ScreenState, s = size) => plain(renderScreen(state, s)).split("\n");

describe("renderScreen", () => {
  test("fills exactly the terminal height with the input line last", () => {
    const lines = rows({ ...base, input: "hello" });
    expect(lines).toHaveLength(size.rows);
    expect(lines.at(-1)).toBe("> hello");
  });

  test("shows the newest captions that fit, oldest dropped", () => {
    const captions = Array.from({ length: 30 }, (_, i) => `[00:${String(i).padStart(2, "0")}] me: line ${i}`);
    const text = rows({ ...base, captions }).join("\n");
    expect(text).toContain("line 29");
    expect(text).not.toContain("line 0\n");
    expect(text).not.toContain("line 1\n");
  });

  test("shows suggestions under their own heading", () => {
    const lines = rows({ ...base, suggestions: ["Ask about budget", "Follow up on timeline"] });
    const heading = lines.findIndex((l) => l.includes("Suggestions"));
    expect(heading).toBeGreaterThan(rows(base).findIndex((l) => l.includes("Captions")));
    expect(lines.slice(heading).join("\n")).toContain("Ask about budget");
  });

  test("long lines are cut to the terminal width", () => {
    const lines = rows({ ...base, captions: ["x".repeat(200)] });
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(size.cols);
  });

  test("status is rendered dim, and only when set", () => {
    expect(renderScreen({ ...base, status: "hermes timed out" }, size)).toContain("\x1b[2mhermes timed out\x1b[22m");
    expect(renderScreen(base, size)).not.toContain("\x1b[2m\x1b[22m");
  });

  test("a long input keeps its tail visible", () => {
    const last = rows({ ...base, input: "a".repeat(100) + "END" }).at(-1)!;
    expect(last.endsWith("END")).toBe(true);
    expect(last.length).toBeLessThanOrEqual(size.cols);
  });
});

describe("applyKey", () => {
  test("typing appends, backspace removes", () => {
    expect(applyKey("ab", "c")).toEqual({ input: "abc" });
    expect(applyKey("abc", "\x7f")).toEqual({ input: "ab" });
    expect(applyKey("", "\x7f")).toEqual({ input: "" });
  });
  test("enter submits and clears", () => {
    expect(applyKey("note", "\r")).toEqual({ input: "", submit: "note" });
  });
  test("ctrl-c and ctrl-d quit", () => {
    expect(applyKey("x", "\x03")).toEqual({ input: "x", quit: true });
    expect(applyKey("", "\x04")).toEqual({ input: "", quit: true });
  });
  test("escape sequences (arrows) are ignored, pasted text is kept", () => {
    expect(applyKey("a", "\x1b[A")).toEqual({ input: "a" });
    expect(applyKey("a", "bc")).toEqual({ input: "abc" });
  });
});
