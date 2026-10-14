import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureLiveHelper } from "../live/helper.ts";
import { buildMicSegmentArgs, SEGMENT_SECONDS } from "../live/segments.ts";
import { realRunner, type ProcessRunner } from "../runner.ts";
import { whisperModelPath } from "../transcription/core.ts";
import type { RecorderPlugin } from "./types.ts";

const CLI_PATH = join(import.meta.dir, "..", "cli.ts");

export interface LiveDeps {
  runner: ProcessRunner;
  env: Record<string, string | undefined>;
  ensureHelper: () => string;
  workerCommand: (base: string, speakers: string) => string[];
}

const realDeps = (): LiveDeps => ({
  runner: realRunner,
  env: process.env,
  ensureHelper: () => ensureLiveHelper(realRunner),
  workerCommand: (base, speakers) => [process.execPath, CLI_PATH, "live-worker", base, speakers],
});

// Two-sided realtime transcript: segmenters write wavs, the worker transcribes them into <base>.live.txt.
export function createLivePlugin(deps: LiveDeps = realDeps()): RecorderPlugin {
  const { runner, env, ensureHelper, workerCommand } = deps;
  return {
    name: "live",
    enabled: (options) => options.liveCaptions === true,

    async start(ctx) {
      if (!runner.which("whisper-cli")) throw new Error("whisper-cli not found, install with: brew install whisper-cpp");
      const model = whisperModelPath(env);
      if (!existsSync(model)) throw new Error(`whisper model not found: ${model} (set LOCALSCRIBE_WHISPER_MODEL)`);

      const segmentDir = `${ctx.base}.live`;
      const liveFile = `${ctx.base}.live.txt`;
      mkdirSync(segmentDir, { recursive: true });
      if (!existsSync(liveFile)) writeFileSync(liveFile, "");

      const speakers: string[] = [];
      if (ctx.micDevice !== undefined) {
        speakers.push("me");
        ctx.addSidecar(runner.spawnDetached(["ffmpeg", ...buildMicSegmentArgs({ micDevice: ctx.micDevice, dir: segmentDir })], `${ctx.base}.live.mic.log`), "ffmpeg");
      }
      if (ctx.options.systemAudio !== false) {
        speakers.push("them");
        const helper = ensureHelper();
        ctx.addSidecar(runner.spawnDetached([helper, segmentDir, String(SEGMENT_SECONDS)], `${ctx.base}.live.system.log`), "livesys");
      }
      ctx.addSidecar(runner.spawnDetached(workerCommand(ctx.base, speakers.join(",")), `${ctx.base}.live.worker.log`), "bun", { drain: true });
      ctx.log(`live: transcribing to ${liveFile}; open the assistant with: localscribe live`);
      return { liveFile, segmentDir };
    },

    // The recorder has already stopped the worker, so the leftover segments are no longer needed.
    async stop(ctx) {
      const segmentDir = (ctx.pluginState as { segmentDir?: string } | null)?.segmentDir;
      if (!segmentDir) return;
      rmSync(segmentDir, { recursive: true, force: true });
    },
  };
}

export const live = createLivePlugin();
