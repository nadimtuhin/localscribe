import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import {
  buildExtractAudioArgs,
  buildWhisperArgs,
  devanagariToBengali,
  formatTimestamp,
  requireWhisperModel,
  segmentsToMarkdown,
  whisperCliLanguage,
  whisperModelPath,
} from "./core.ts";

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

describe("devanagariToBengali", () => {
  test("converts devanagari letters to bengali equivalents", () => {
    expect(devanagariToBengali("आ")).toBe("আ");
    expect(devanagariToBengali("क")).toBe("ক");
    expect(devanagariToBengali("व")).toBe("ব");
    expect(devanagariToBengali("।")).toBe("।");
    expect(devanagariToBengali("॥")).toBe("॥");
    expect(devanagariToBengali("Hello 123")).toBe("Hello 123");
    expect(devanagariToBengali("आজকে सবায")).toBe("আজকে সবায");
    expect(devanagariToBengali("\u0970")).toBe("\u0970");
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
  test("normalizes devanagari when language includes bn", () => {
    const segments = [{ offsets: { from: 0, to: 1000 }, text: " आজকে सবায" }];
    expect(segmentsToMarkdown(segments, "bn")).toBe("[00:00] আজকে সবায\n");
    expect(segmentsToMarkdown(segments, "en,bn")).toBe("[00:00] আজকে সবায\n");
  });
});

describe("whisperCliLanguage", () => {
  test("returns single code directly", () => {
    expect(whisperCliLanguage("en")).toBe("en");
    expect(whisperCliLanguage("hi")).toBe("hi");
  });
  test("returns bn when codes include bn", () => {
    expect(whisperCliLanguage("en,bn")).toBe("bn");
    expect(whisperCliLanguage("bn,en")).toBe("bn");
  });
  test("returns auto for other multi-language combos", () => {
    expect(whisperCliLanguage("en,hi")).toBe("auto");
  });
});

describe("argument builders", () => {
  test("extract: mono 16 kHz wav without video", () => {
    expect(buildExtractAudioArgs("/r/a.mp4", "/t/a.wav")).toEqual(["-y", "-i", "/r/a.mp4", "-vn", "-ac", "1", "-ar", "16000", "/t/a.wav"]);
  });
  test("whisper-cli: json output to <prefix>.json", () => {
    expect(buildWhisperArgs({ model: "/m.bin", wav: "/t/a.wav", prefix: "/t/out", lang: "hi" })).toEqual(["-m", "/m.bin", "-f", "/t/a.wav", "-l", "hi", "-oj", "-of", "/t/out"]);
  });
  test("whisper-cli: adds prompt and suppress-nst for bn or bilingual bn", () => {
    expect(buildWhisperArgs({ model: "/m.bin", wav: "/t/a.wav", prefix: "/t/out", lang: "bn" })).toEqual([
      "-m", "/m.bin", "-f", "/t/a.wav", "-l", "bn", "-oj", "-of", "/t/out",
      "--prompt", "বাংলা ভাষা।", "--suppress-nst",
    ]);
    expect(buildWhisperArgs({ model: "/m.bin", wav: "/t/a.wav", prefix: "/t/out", lang: "en,bn" })).toEqual([
      "-m", "/m.bin", "-f", "/t/a.wav", "-l", "bn", "-oj", "-of", "/t/out",
      "--prompt", "বাংলা এবং English মিশ্রিত আলোচনা ও মিটিং।", "--suppress-nst",
    ]);
    expect(buildWhisperArgs({ model: "/m.bin", wav: "/t/a.wav", prefix: "/t/out", lang: "en,bn", prompt: "custom" })).toEqual([
      "-m", "/m.bin", "-f", "/t/a.wav", "-l", "bn", "-oj", "-of", "/t/out",
      "--prompt", "custom", "--suppress-nst",
    ]);
  });
});

const models = `${homedir()}/.hermes/models/whisper`;

describe("whisperModelPath", () => {
  test("english uses the english-only base model", () => {
    expect(whisperModelPath({}, "en")).toBe(`${models}/ggml-base.en.bin`);
  });

  test("bangla uses large-v3-turbo, since small writes Bangla in the wrong script", () => {
    expect(whisperModelPath({}, "bn")).toBe(`${models}/ggml-large-v3-turbo-q5_0.bin`);
    expect(whisperModelPath({}, "en,bn")).toBe(`${models}/ggml-large-v3-turbo-q5_0.bin`);
  });

  test("any other language, and auto, use the multilingual small model", () => {
    for (const lang of ["hi", "auto"]) expect(whisperModelPath({}, lang)).toBe(`${models}/ggml-small.bin`);
  });

  test("LOCALSCRIBE_WHISPER_MODEL overrides the choice", () => {
    expect(whisperModelPath({ LOCALSCRIBE_WHISPER_MODEL: "/m/custom.bin" }, "hi")).toBe("/m/custom.bin");
  });
});

describe("requireWhisperModel", () => {
  test("returns the path when the model exists", () => {
    expect(requireWhisperModel({}, "hi", () => true)).toBe(`${models}/ggml-small.bin`);
  });

  test("a missing multilingual model fails with the exact download command", () => {
    expect(() => requireWhisperModel({}, "hi", () => false)).toThrow(
      `whisper model not found: ${models}/ggml-small.bin. Download it with: curl -L -o ${models}/ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin`,
    );
  });

  test("a missing overridden model points at the variable instead", () => {
    expect(() => requireWhisperModel({ LOCALSCRIBE_WHISPER_MODEL: "/m/x.bin" }, "en", () => false)).toThrow("whisper model not found: /m/x.bin (set LOCALSCRIBE_WHISPER_MODEL)");
  });
});
