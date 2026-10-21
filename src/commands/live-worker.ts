import { appendFileSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSegmentWhisperArgs, runLiveWorker } from "../live/worker.ts";
import type { Speaker } from "../live/segments.ts";
import { activeRecording, readActive } from "../recorder.ts";
import type { RecordingState } from "../state.ts";
import { whisperModelPath } from "../transcription/core.ts";
import { DEFAULT_LANGUAGE } from "../transcription/language.ts";
import type { Command } from "./shared.ts";

const HOLD_MS = 15_000;

export interface LiveWorkerDeps {
  active: () => RecordingState | null;
  readActive: () => RecordingState | null;
  env: Record<string, string | undefined>;
  whisperCommand: string;
  signals: { on(signal: "SIGINT" | "SIGTERM", handler: () => void): unknown };
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
}

const realDeps: LiveWorkerDeps = {
  active: activeRecording,
  readActive,
  env: process.env,
  whisperCommand: "whisper-cli",
  signals: process,
  now: Date.now,
  sleep: Bun.sleep,
  log: console.error,
};

// Hidden sidecar entry point: `localscribe live-worker <base>`, spawned by the live plugin.
export function createLiveWorkerCommand(deps: LiveWorkerDeps = realDeps): Command {
  return async ({ positionals }) => {
    const base = positionals[0];
    const speakers = (positionals[1] ?? "me,them").split(",").filter((s): s is Speaker => s === "me" || s === "them");
    const recording = deps.active();
    if (!base || !recording) return 1;

    const dir = `${base}.live`;
    const lang = recording.pluginOptions?.lang ?? DEFAULT_LANGUAGE;
    const model = whisperModelPath(deps.env, lang);
    let interrupted = false;
    for (const signal of ["SIGINT", "SIGTERM"] as const) deps.signals.on(signal, () => void (interrupted = true));

    await runLiveWorker({
      speakers,
      lang,
      startedAtMs: Date.parse(recording.startedAt),
      holdMs: HOLD_MS,
      listDir: () => readdirSync(dir),
      stat: (name) => {
        const info = statSync(join(dir, name));
        return { mtimeMs: info.mtimeMs, bytes: info.size };
      },
      readBytes: (name) => readFileSync(join(dir, name)),
      transcribe: async (name) => {
        const child = Bun.spawn([deps.whisperCommand, ...buildSegmentWhisperArgs({ model, wav: join(dir, name), lang })], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
        const [text, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
        if (exitCode !== 0) throw new Error(`whisper-cli exit ${exitCode}`);
        return text;
      },
      remove: (name) => rmSync(join(dir, name), { force: true }),
      append: (text) => appendFileSync(`${base}.live.txt`, text),
      log: deps.log,
      now: deps.now,
      recordingActive: () => !interrupted && deps.readActive() !== null,
      sleep: deps.sleep,
    });
    return 0;
  };
}

export const liveWorkerCommand = createLiveWorkerCommand();
