import { formatTimestamp, isNonSpeech } from "../transcription/core.ts";
import type { Speaker } from "./segments.ts";

export interface LiveLine { atMs: number; who: Speaker; text: string }

export const formatLiveLine = ({ atMs, who, text }: LiveLine) => `[${formatTimestamp(atMs)}] ${who}: ${text}\n`;

export function speechText(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  return isNonSpeech(text) ? null : text;
}

const ECHO_MEMORY_MS = 30_000;
const ECHO_WINDOW_MS = 8_000;
const ECHO_SIMILARITY = 0.6;

const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);

function jaccard(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

// The mic hears the other side through the speakers, so a "me" line that repeats a nearby "them" line is that echo.
const isEcho = (line: LiveLine, candidates: LiveLine[]) =>
  line.who === "me" &&
  candidates.some((other) => other.who === "them" && Math.abs(other.atMs - line.atMs) <= ECHO_WINDOW_MS && jaccard(other.text, line.text) >= ECHO_SIMILARITY);

// Speakers finish segments independently; this releases lines in time order, only once no
// active speaker can still produce an earlier one (or the hold cap passes, so silence never blocks).
export class LiveMerger {
  private pending: LiveLine[] = [];
  private progressMs: Partial<Record<Speaker, number>> = {};
  private lastText: Partial<Record<Speaker, string>> = {};
  private releasedThem: LiveLine[] = [];

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
      const repeated = this.lastText[line.who] === line.text;
      this.lastText[line.who] = line.text;
      if (repeated || isEcho(line, [...this.releasedThem, ...ordered])) continue;
      out.push(line);
      if (line.who === "them") this.releasedThem.push(line);
    }
    const newest = out.at(-1)?.atMs ?? 0;
    this.releasedThem = this.releasedThem.filter((line) => line.atMs >= newest - ECHO_MEMORY_MS);
    const released = ordered.findIndex((line) => !releasable(line));
    this.pending = released === -1 ? [] : ordered.slice(released);
    return out;
  }
}
