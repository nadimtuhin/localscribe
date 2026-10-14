import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { DEFAULT_LANGUAGE } from "./language.ts";

export interface WhisperSegment { offsets: { from: number; to: number }; text: string }

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}

// What whisper invents on silence; a real one-word turn is not worth keeping next to the false ones.
const HALLUCINATIONS = new Set(["you", "thank you", "thanks", "bye"]);

// Whisper emits markers like [BLANK_AUDIO] or (music) for non-speech; they are not transcript.
export const isNonSpeech = (text: string) =>
  text === "" || /^[[(].*[\])]$/.test(text) || HALLUCINATIONS.has(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim());

export function segmentsToMarkdown(segments: WhisperSegment[]): string {
  return segments
    .map((segment) => ({ at: segment.offsets.from, text: segment.text.trim() }))
    .filter(({ text }) => !isNonSpeech(text))
    .map(({ at, text }) => `[${formatTimestamp(at)}] ${text}\n`)
    .join("");
}

export const buildExtractAudioArgs = (input: string, wav: string) => ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", wav];

export const buildWhisperArgs = ({ model, wav, prefix, lang }: { model: string; wav: string; prefix: string; lang: string }) => ["-m", model, "-f", wav, "-l", lang, "-oj", "-of", prefix];

const MODELS_DIR = join(homedir(), ".hermes/models/whisper");
const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

export class WhisperModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhisperModelError";
  }
}

// English has its own smaller, faster model; every other language (and auto-detect) needs the multilingual one.
export const whisperModelPath = (env: Record<string, string | undefined>, lang: string = DEFAULT_LANGUAGE) =>
  env.LOCALSCRIBE_WHISPER_MODEL ?? join(MODELS_DIR, lang === "en" ? "ggml-base.en.bin" : "ggml-small.bin");

export function requireWhisperModel(env: Record<string, string | undefined>, lang: string, exists: (path: string) => boolean = existsSync): string {
  const model = whisperModelPath(env, lang);
  if (exists(model)) return model;
  const fix = env.LOCALSCRIBE_WHISPER_MODEL !== undefined ? " (set LOCALSCRIBE_WHISPER_MODEL)" : `. Download it with: curl -L -o ${model} ${MODEL_URL}/${basename(model)}`;
  throw new WhisperModelError(`whisper model not found: ${model}${fix}`);
}
