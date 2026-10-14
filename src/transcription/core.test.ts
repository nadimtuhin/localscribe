import { describe, expect, test } from "bun:test";
import { buildExtractAudioArgs,buildWhisperArgs, formatTimestamp, segmentsToMarkdown } from "./core.ts";

const fixture = await Bun.file(new URL("../../test/fixtures/whisper.json", import.meta.url)).json();

describe("formatTimestamp", () => {
  test("renders milliseconds as mm:ss", () => {
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(83000)).toBe("01:23");
    expect(formatTimestamp(83999)).toBe("01:23");
  });
  test("minutes keep counting past an hour", () => {
    expect(formatTimestamp(3_723_000)).toBe("62:03");
  });
});

describe("segmentsToMarkdown", () => {
  test("real whisper-cli output becomes a trimmed [mm:ss] line", () => {
    expect(segmentsToMarkdown(fixture.transcription)).toBe("[00:00] Hello World this is a test.\n");
  });
  test("uses offsets.from and trims the leading space", () => {
    expect(segmentsToMarkdown([{ offsets: { from: 83000, to: 85000 }, text: " Hello there." }])).toBe("[01:23] Hello there.\n");
  });
  test("drops non-speech markers and empty segments", () => {
    const segments = [
      { offsets: { from: 0, to: 1000 }, text: " [BLANK_AUDIO]" },
      { offsets: { from: 1000, to: 2000 }, text: "  " },
      { offsets: { from: 2000, to: 3000 }, text: " Hi." },
    ];
    expect(segmentsToMarkdown(segments)).toBe("[00:02] Hi.\n");
  });
  test("no speech yields an empty transcript", () => {
    expect(segmentsToMarkdown([])).toBe("");
  });
});

describe("argument builders", () => {
  test("extract: mono 16 kHz wav without video", () => {
    expect(buildExtractAudioArgs("/r/a.mp4", "/t/a.wav")).toEqual(["-y", "-i", "/r/a.mp4", "-vn", "-ac", "1", "-ar", "16000", "/t/a.wav"]);
  });
  test("whisper-cli: json output to <prefix>.json", () => {
    expect(buildWhisperArgs({ model: "/m.bin", wav: "/t/a.wav", prefix: "/t/out" })).toEqual(["-m", "/m.bin", "-f", "/t/a.wav", "-oj", "-of", "/t/out"]);
  });
});
