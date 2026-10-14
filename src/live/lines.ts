import { formatTimestamp, isNonSpeech } from "../transcription/core.ts";
import type { Speaker } from "./segments.ts";

export interface LiveLine { atMs: number; who: Speaker; text: string }

export const formatLiveLine = ({ atMs, who, text }: LiveLine) => `[${formatTimestamp(atMs)}] ${who}: ${text}\n`;

export function speechText(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  return isNonSpeech(text) ? null : text;
}

// Speakers finish segments independently; this releases lines in time order, only once no
// active speaker can still produce an earlier one (or the hold cap passes, so silence never blocks).
export class LiveMerger {
  private pending: LiveLine[] = [];
  private progressMs: Partial<Record<Speaker, number>> = {};
  private lastText: Partial<Record<Speaker, string>> = {};

  constructor(private speakers: Speaker[], private holdMs: number) {}

  push(line: LiveLine) {
    this.pending.push(line);
  }

  progress(who: Speaker, ms: number) {
    this.progressMs[who] = Math.max(this.progressMs[who] ?? 0, ms);
  }

  release(nowMs: number): LiveLine[] {
    const watermark = Math.min(...this.speakers.map((who) => this.progressMs[who] ?? 0));
    return this.take((line) => line.atMs <= watermark || line.atMs <= nowMs - this.holdMs);
  }

  flush(): LiveLine[] {
    return this.take(() => true);
  }

  private take(releasable: (line: LiveLine) => boolean): LiveLine[] {
    const ordered = [...this.pending].sort((a, b) => a.atMs - b.atMs);
    const out: LiveLine[] = [];
    // Stop at the first held line so a later line never jumps ahead of it.
    for (const line of ordered) {
      if (!releasable(line)) break;
      if (this.lastText[line.who] !== line.text) out.push(line);
      this.lastText[line.who] = line.text;
    }
    const released = ordered.findIndex((line) => !releasable(line));
    this.pending = released === -1 ? [] : ordered.slice(released);
    return out;
  }
}
