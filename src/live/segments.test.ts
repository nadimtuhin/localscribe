import { describe, expect, test } from "bun:test";
import { buildMicSegmentArgs, parseSegmentName, readySegments, rmsDbfs, SILENCE_DBFS, segmentSpan } from "./segments.ts";

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
  test("a mic segment is ready only once a later one exists; system segments are atomic so ready at once", () => {
    const names = ["me_00001.wav", "me_00002.wav", "them_00001.wav"];
    expect(readySegments(names, new Set(), false)).toEqual(["me_00001.wav", "them_00001.wav"]);
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
    expect(readySegments(names, new Set(), false)).toEqual(["me_00001.wav", "them_00001.wav", "me_00002.wav", "them_00002.wav", "them_00003.wav"]);
  });
});

describe("buildMicSegmentArgs", () => {
  test("avfoundation mic to 16k mono wav segments starting at 1", () => {
    expect(buildMicSegmentArgs({ micDevice: 2, dir: "/r/a.live" })).toEqual([
      "-nostdin", "-hide_banner", "-f", "avfoundation", "-i", ":2", "-ac", "1", "-ar", "16000",
      "-f", "segment", "-segment_time", "6", "-segment_format", "wav", "-segment_start_number", "1", "/r/a.live/me_%05d.wav",
    ]);
  });
});

const wav = (samples: number[]) => {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
  return bytes;
};

describe("rmsDbfs", () => {
  test("full-scale square wave is 0 dBFS, half scale about -6, digital silence is -Infinity", () => {
    expect(rmsDbfs(wav([32767, -32768, 32767, -32768]))).toBeCloseTo(0, 1);
    expect(rmsDbfs(wav([16384, -16384, 16384, -16384]))).toBeCloseTo(-6, 0);
    expect(rmsDbfs(wav([0, 0, 0, 0]))).toBe(-Infinity);
  });
  test("a file with no samples is silent", () => {
    expect(rmsDbfs(wav([]))).toBe(-Infinity);
  });
  test("room tone below the gate reads under SILENCE_DBFS, speech level above it", () => {
    expect(rmsDbfs(wav([100, -100, 100, -100]))).toBeLessThan(SILENCE_DBFS);
    expect(rmsDbfs(wav([2000, -2000, 2000, -2000]))).toBeGreaterThan(SILENCE_DBFS);
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
