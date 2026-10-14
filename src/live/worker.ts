import { formatLiveLine, LiveMerger, speechText } from "./lines.ts";
import { parseSegmentName, readySegments, segmentSpan, type Speaker } from "./segments.ts";

export interface WorkerDeps {
  speakers: Speaker[];
  startedAtMs: number;
  holdMs: number;
  listDir(): string[];
  stat(name: string): { mtimeMs: number; bytes: number };
  transcribe(name: string): Promise<string>; // raw whisper text for one segment
  remove(name: string): void;
  append(text: string): void;
  now(): number;
  recordingActive(): boolean;
  sleep(ms: number): Promise<void>;
}

const POLL_MS = 1000;

export const buildSegmentWhisperArgs = ({ model, wav }: { model: string; wav: string }) => ["-m", model, "-f", wav, "-nt", "-np"];

// Transcribes each closed segment exactly once and appends `[mm:ss] who: text` lines in time order.
export async function runLiveWorker(deps: WorkerDeps): Promise<void> {
  const merger = new LiveMerger(deps.speakers, deps.holdMs);
  const done = new Set<string>();
  const emit = (lines: ReturnType<LiveMerger["flush"]>) => {
    if (lines.length) deps.append(lines.map(formatLiveLine).join(""));
  };

  const drain = async (flush: boolean) => {
    for (const name of readySegments(deps.listDir(), done, flush)) {
      done.add(name);
      const { who } = parseSegmentName(name)!;
      const { startMs, endMs } = segmentSpan(deps.stat(name), deps.startedAtMs);
      try {
        const text = speechText(await deps.transcribe(name));
        if (text) merger.push({ atMs: startMs, who, text });
      } catch {
        // One bad segment must not stop the live view; the final transcript is rebuilt on stop.
      }
      merger.progress(who, endMs);
      deps.remove(name);
    }
  };

  for (;;) {
    const active = deps.recordingActive();
    await drain(!active);
    if (!active) return emit(merger.flush());
    emit(merger.release(deps.now() - deps.startedAtMs));
    await deps.sleep(POLL_MS);
  }
}
