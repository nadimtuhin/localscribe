import { describe, expect, test } from "bun:test";
import { formatLiveLine, LiveMerger, speechText } from "./lines.ts";

describe("formatLiveLine", () => {
  test("[mm:ss] who: text", () => {
    expect(formatLiveLine({ atMs: 83_000, who: "them", text: "hello there" })).toBe("[01:23] them: hello there\n");
  });
});

describe("speechText", () => {
  test("trims and collapses whitespace", () => {
    expect(speechText("  Hello \n  world. ")).toBe("Hello world.");
  });
  test("drops non-speech markers and empties", () => {
    expect(speechText(" [BLANK_AUDIO]")).toBeNull();
    expect(speechText("(music)")).toBeNull();
    expect(speechText("   ")).toBeNull();
  });
});

describe("LiveMerger", () => {
  const line = (atMs: number, who: "me" | "them", text: string) => ({ atMs, who, text });

  test("holds a line until every speaker has progressed past it, then releases in time order", () => {
    const merger = new LiveMerger(["me", "them"], 15_000);
    merger.push(line(10_000, "me", "second"));
    merger.progress("me", 16_000);
    expect(merger.release(16_000)).toEqual([]); // them has not reported yet
    merger.push(line(4_000, "them", "first"));
    merger.progress("them", 12_000);
    expect(merger.release(16_000).map((l) => l.text)).toEqual(["first", "second"]);
  });

  test("a silent speaker cannot block past the hold cap", () => {
    const merger = new LiveMerger(["me", "them"], 15_000);
    merger.push(line(2_000, "me", "hi"));
    merger.progress("me", 8_000);
    expect(merger.release(10_000)).toEqual([]);
    expect(merger.release(17_000).map((l) => l.text)).toEqual(["hi"]);
  });

  test("only active speakers gate release", () => {
    const merger = new LiveMerger(["them"], 15_000);
    merger.push(line(2_000, "them", "solo"));
    merger.progress("them", 8_000);
    expect(merger.release(8_000).map((l) => l.text)).toEqual(["solo"]);
  });

  test("drops an identical consecutive line from the same speaker", () => {
    const merger = new LiveMerger(["me"], 15_000);
    merger.push(line(1_000, "me", "Thank you."));
    merger.push(line(7_000, "me", "Thank you."));
    merger.push(line(13_000, "me", "Next."));
    merger.progress("me", 20_000);
    expect(merger.release(20_000).map((l) => l.text)).toEqual(["Thank you.", "Next."]);
  });

  test("the same text from the other speaker is kept", () => {
    const merger = new LiveMerger(["me", "them"], 15_000);
    merger.push(line(1_000, "me", "Yes."));
    merger.push(line(2_000, "them", "Yes."));
    merger.progress("me", 9_000);
    merger.progress("them", 9_000);
    expect(merger.release(9_000)).toHaveLength(2);
  });

  test("flush releases everything in order", () => {
    const merger = new LiveMerger(["me", "them"], 15_000);
    merger.push(line(5_000, "them", "b"));
    merger.push(line(1_000, "me", "a"));
    expect(merger.flush().map((l) => l.text)).toEqual(["a", "b"]);
  });
});
