import { describe, expect, test } from "bun:test";
import { createManualNotes } from "./manual.ts";

const setup = (startedAtMs = 1_000_000) => {
  const clock = { now: startedAtMs };
  const written: string[] = [];
  const notes = createManualNotes({ startedAtMs, now: () => clock.now, append: (text) => void written.push(text) });
  return { clock, written, notes };
};

describe("createManualNotes", () => {
  test("stamps the note with the recording clock", () => {
    const { clock, written, notes } = setup();
    clock.now += 83_000;
    expect(notes.add("ask about pricing")).toBe("[01:23] note: ask about pricing\n");
    expect(written).toEqual(["[01:23] note: ask about pricing\n"]);
  });

  test("trims, flattens newlines, ignores blank input", () => {
    const { written, notes } = setup();
    expect(notes.add("   ")).toBeNull();
    notes.add("  two\nlines ");
    expect(written).toEqual(["[00:00] note: two lines\n"]);
  });

  test("the clock is wall time since start, so a note is stamped when it is typed", () => {
    const { clock, written, notes } = setup();
    clock.now += 5_000;
    notes.add("a");
    clock.now += 61_000;
    notes.add("b");
    expect(written).toEqual(["[00:05] note: a\n", "[01:06] note: b\n"]);
  });
});
