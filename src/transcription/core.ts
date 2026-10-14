import { homedir } from "node:os";
import { join } from "node:path";

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

export const buildWhisperArgs = ({ model, wav, prefix }: { model: string; wav: string; prefix: string }) => ["-m", model, "-f", wav, "-oj", "-of", prefix];

export const whisperModelPath = (env: Record<string, string | undefined>) =>
  env.LOCALSCRIBE_WHISPER_MODEL ?? join(homedir(), ".hermes/models/whisper/ggml-base.en.bin");
