import { formatLiveLine, LiveMerger, speechText } from "./lines.ts";
import { parseSegmentName, readySegments, rmsDbfs, segmentSpan, SILENCE_DBFS, type Speaker } from "./segments.ts";

export interface WorkerDeps {
  speakers: Speaker[];
  startedAtMs: number;
  holdMs: number;
  listDir(): string[];
  stat(name: string): { mtimeMs: number; bytes: number };
  readBytes(name: string): Uint8Array; // the segment wav, to gate silence before whisper
  transcribe(name: string): Promise<string>; // raw whisper text for one segment
  remove(name: string): void;
  append(text: string): void;
  log(line: string): void;
  now(): number;
  recordingActive(): boolean;
  sleep(ms: number): Promise<void>;
}

const POLL_MS = 1000;

export const buildSegmentWhisperArgs = ({ model, wav, lang }: { model: string; wav: string; lang: string }) => ["-m", model, "-f", wav, "-l", lang, "-nt", "-np"];

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
        const text = rmsDbfs(deps.readBytes(name)) < SILENCE_DBFS ? null : speechText(await deps.transcribe(name));
        if (text) merger.push({ atMs: startMs, who, text });
      } catch {
        // One bad segment must not stop the live view; the final transcript is rebuilt on stop.
      }
      merger.progress(who, endMs);
      deps.remove(name);
    }
  };

  // A bad tick (vanished dir, full disk) is logged; the next one retries, so one error never ends the live view.
  const attempt = async (step: () => Promise<void> | void) => {
    try {
      await step();
    } catch (error) {
      deps.log(`live-worker: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  let active: boolean;
  do {
    active = deps.recordingActive();
    const flushing = !active;
    await attempt(async () => {
      await drain(flushing);
      if (!flushing) emit(merger.release(deps.now() - deps.startedAtMs));
    });
    if (active) await deps.sleep(POLL_MS);
  } while (active);
  await attempt(() => emit(merger.flush()));
}
