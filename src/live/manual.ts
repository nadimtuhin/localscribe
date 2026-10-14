import { formatTimestamp } from "../transcription/core.ts";

export interface ManualNotesDeps { startedAtMs: number; now: () => number; append: (text: string) => void }

export function createManualNotes({ startedAtMs, now, append }: ManualNotesDeps) {
  return {
    add(raw: string): string | null {
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text) return null;
      const line = `[${formatTimestamp(now() - startedAtMs)}] note: ${text}\n`;
      append(line);
      return line;
    },
  };
}
