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

export function devanagariToBengali(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const cp = text.charCodeAt(i);
    if (ch === "व") {
      out += "ব";
    } else if (cp === 0x0964 || cp === 0x0965) {
      out += ch;
    } else if (cp >= 0x0901 && cp <= 0x096f) {
      const bcp = cp + 0x80;
      out += bcp >= 0x0981 && bcp <= 0x09fa ? String.fromCharCode(bcp) : ch;
    } else {
      out += ch;
    }
  }
  return out;
}

export function segmentsToMarkdown(segments: WhisperSegment[], lang?: string): string {
  const isBangla = lang?.split(",").includes("bn");
  return segments
    .map((segment) => {
      const trimmed = segment.text.trim();
      const text = isBangla ? devanagariToBengali(trimmed) : trimmed;
      return { at: segment.offsets.from, text };
    })
    .filter(({ text }) => !isNonSpeech(text))
    .map(({ at, text }) => `[${formatTimestamp(at)}] ${text}\n`)
    .join("");
}

export const buildExtractAudioArgs = (input: string, wav: string) => ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", wav];

export function whisperCliLanguage(lang: string): string {
  const codes = lang.split(",");
  if (codes.includes("bn")) return "bn";
  if (codes.length === 1) return codes[0]!;
  return "auto";
}

export const DEFAULT_PROMPT_FOR_LANG: Record<string, string> = {
  bn: "বাংলা ভাষা।",
  "en,bn": "বাংলা এবং English মিশ্রিত আলোচনা ও মিটিং।",
  "bn,en": "বাংলা এবং English মিশ্রিত আলোচনা ও মিটিং।",
};

export const buildWhisperArgs = ({
  model,
  wav,
  prefix,
  lang,
  prompt,
}: {
  model: string;
  wav: string;
  prefix: string;
  lang: string;
  prompt?: string;
}) => {
  const codes = lang.split(",");
  const hasBn = codes.includes("bn");
  const cliLang = whisperCliLanguage(lang);
  const p = prompt ?? DEFAULT_PROMPT_FOR_LANG[lang] ?? (hasBn ? DEFAULT_PROMPT_FOR_LANG["en,bn"] : undefined);
  const args = ["-m", model, "-f", wav, "-l", cliLang, "-oj", "-of", prefix];
  if (p) args.push("--prompt", p);
  if (hasBn) args.push("--suppress-nst");
  return args;
};

const MODELS_DIR = join(homedir(), ".hermes/models/whisper");
const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

export class WhisperModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhisperModelError";
  }
}

// English has its own smaller, faster model; every other language (and auto-detect) needs a multilingual one.
// small writes Bangla in Latin or Devanagari letters, so Bangla gets large-v3-turbo.
export const whisperModelPath = (env: Record<string, string | undefined>, lang: string = DEFAULT_LANGUAGE) => {
  if (env.LOCALSCRIBE_WHISPER_MODEL) return env.LOCALSCRIBE_WHISPER_MODEL;
  const codes = lang.split(",");
  if (codes.includes("bn")) return join(MODELS_DIR, "ggml-large-v3-turbo-q5_0.bin");
  if (codes.length === 1 && codes[0] === "en") return join(MODELS_DIR, "ggml-base.en.bin");
  return join(MODELS_DIR, "ggml-small.bin");
};

export function requireWhisperModel(env: Record<string, string | undefined>, lang: string, exists: (path: string) => boolean = existsSync): string {
  const model = whisperModelPath(env, lang);
  if (exists(model)) return model;
  const fix = env.LOCALSCRIBE_WHISPER_MODEL !== undefined ? " (set LOCALSCRIBE_WHISPER_MODEL)" : `. Download it with: curl -L -o ${model} ${MODEL_URL}/${basename(model)}`;
  throw new WhisperModelError(`whisper model not found: ${model}${fix}`);
}
