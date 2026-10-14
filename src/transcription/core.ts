export interface WhisperSegment { offsets: { from: number; to: number }; text: string }

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}

// Whisper emits markers like [BLANK_AUDIO] or (music) for non-speech; they are not transcript.
export const isNonSpeech = (text: string) => text === "" || /^[[(].*[\])]$/.test(text);

export function segmentsToMarkdown(segments: WhisperSegment[]): string {
  return segments
    .map((segment) => ({ at: segment.offsets.from, text: segment.text.trim() }))
    .filter(({ text }) => !isNonSpeech(text))
    .map(({ at, text }) => `[${formatTimestamp(at)}] ${text}\n`)
    .join("");
}

export const buildExtractAudioArgs = (input: string, wav: string) => ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", wav];

export const buildWhisperArgs = ({ model, wav, prefix }: { model: string; wav: string; prefix: string }) => ["-m", model, "-f", wav, "-oj", "-of", prefix];

// -c -1 is the SDL default input. whisper-stream appends each caption line to -f (verified on a real run).
export const buildStreamArgs = ({ model, file }: { model: string; file: string }) => ["-m", model, "-c", "-1", "--step", "3000", "--length", "10000", "-f", file];
