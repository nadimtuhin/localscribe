import { describe, expect, test } from "bun:test";
import { parseSegmentName, readySegments, segmentSpan } from "./segments.ts";

describe("parseSegmentName", () => {
  test("reads speaker and sequence", () => {
    expect(parseSegmentName("me_00003.wav")).toEqual({ who: "me", seq: 3 });
    expect(parseSegmentName("them_00012.wav")).toEqual({ who: "them", seq: 12 });
  });
  test("ignores partial and foreign files", () => {
    expect(parseSegmentName("them_00001.wav.part")).toBeNull();
    expect(parseSegmentName("notes.txt")).toBeNull();
  });
});

describe("readySegments", () => {
  test("a segment is ready only once a later one of the same speaker exists", () => {
    const names = ["me_00001.wav", "me_00002.wav", "them_00001.wav"];
    expect(readySegments(names, new Set(), false)).toEqual(["me_00001.wav"]);
  });
  test("never returns a segment twice", () => {
    const names = ["me_00001.wav", "me_00002.wav"];
    expect(readySegments(names, new Set(["me_00001.wav"]), false)).toEqual([]);
  });
  test("flush releases the still-open last segments", () => {
    const names = ["me_00002.wav", "them_00001.wav", "me_00001.wav"];
    expect(readySegments(names, new Set(), true)).toEqual(["me_00001.wav", "them_00001.wav", "me_00002.wav"]);
  });
  test("is ordered by sequence, then speaker", () => {
    const names = ["them_00002.wav", "me_00002.wav", "them_00001.wav", "me_00001.wav", "me_00003.wav", "them_00003.wav"];
    expect(readySegments(names, new Set(), false)).toEqual(["me_00001.wav", "them_00001.wav", "me_00002.wav", "them_00002.wav"]);
  });
});

describe("segmentSpan", () => {
  test("end is the file mtime, start is end minus the duration implied by 16k mono s16 bytes", () => {
    const bytes = 44 + 6 * 32_000;
    expect(segmentSpan({ mtimeMs: 1_000_000 + 20_000, bytes }, 1_000_000)).toEqual({ startMs: 14_000, endMs: 20_000 });
  });
  test("never starts before the recording", () => {
    expect(segmentSpan({ mtimeMs: 1_002_000, bytes: 44 + 6 * 32_000 }, 1_000_000).startMs).toBe(0);
  });
});
