import { appendFileSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSegmentWhisperArgs, runLiveWorker } from "../live/worker.ts";
import type { Speaker } from "../live/segments.ts";
import { activeRecording, readActive } from "../recorder.ts";
import { whisperModelPath } from "../transcription/core.ts";
import type { Command } from "./shared.ts";

const HOLD_MS = 15_000;

// Hidden sidecar entry point: `localscribe live-worker <base>`, spawned by the live plugin.
export const liveWorkerCommand: Command = async ({ positionals }) => {
  const base = positionals[0];
  const speakers = (positionals[1] ?? "me,them").split(",").filter((s): s is Speaker => s === "me" || s === "them");
  const recording = activeRecording();
  if (!base || !recording) return 1;

  const dir = `${base}.live`;
  const model = whisperModelPath(process.env);
  let interrupted = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void (interrupted = true));

  await runLiveWorker({
    speakers,
    startedAtMs: Date.parse(recording.startedAt),
    holdMs: HOLD_MS,
    listDir: () => readdirSync(dir),
    stat: (name) => {
      const info = statSync(join(dir, name));
      return { mtimeMs: info.mtimeMs, bytes: info.size };
    },
    readBytes: (name) => readFileSync(join(dir, name)),
    transcribe: async (name) => {
      const child = Bun.spawn(["whisper-cli", ...buildSegmentWhisperArgs({ model, wav: join(dir, name) })], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
      const [text, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
      if (exitCode !== 0) throw new Error(`whisper-cli exit ${exitCode}`);
      return text;
    },
    remove: (name) => rmSync(join(dir, name), { force: true }),
    append: (text) => appendFileSync(`${base}.live.txt`, text),
    log: (line) => void console.error(line),
    now: Date.now,
    recordingActive: () => !interrupted && readActive() !== null,
    sleep: (ms) => Bun.sleep(ms),
  });
  return 0;
};
