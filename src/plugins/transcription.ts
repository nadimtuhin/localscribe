import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realRunner, type ProcessRunner } from "../runner.ts";
import { buildExtractAudioArgs, buildWhisperArgs, requireWhisperModel, segmentsToMarkdown } from "../transcription/core.ts";
import { DEFAULT_LANGUAGE } from "../transcription/language.ts";
import type { RecorderPlugin } from "./types.ts";

const INSTALL_HINT = "install with: brew install whisper-cpp";
const NO_AUDIO = /does not contain any stream|matches no streams|no audio/i;

export interface TranscriptionDeps { runner: ProcessRunner; env: Record<string, string | undefined> }

export function createTranscription({ runner, env }: TranscriptionDeps = { runner: realRunner, env: process.env }): RecorderPlugin {
  const requireTool = (name: string) => {
    if (!runner.which(name)) throw new Error(`${name} not found, ${INSTALL_HINT}`);
  };

  return {
    name: "transcription",
    enabled: (options) => options.transcribe === true || options.liveCaptions === true,

    async stop(ctx) {
      requireTool("whisper-cli");
      const lang = ctx.options.lang ?? DEFAULT_LANGUAGE;
      const model = requireWhisperModel(env, lang);
      const workDir = mkdtempSync(join(tmpdir(), "localscribe-tx-"));
      try {
        const wav = join(workDir, "audio.wav");
        const prefix = join(workDir, "whisper");
        const extract = runner.run(["ffmpeg", ...buildExtractAudioArgs(ctx.file, wav)]);
        if (extract.exitCode !== 0) {
          if (NO_AUDIO.test(extract.stderr)) return ctx.log("transcription: no audio in recording, skipping transcript");
          throw new Error(`could not extract audio: ${extract.stderr.trim()}`);
        }
        ctx.log("transcription: transcribing...");
        const whisper = runner.run(["whisper-cli", ...buildWhisperArgs({ model, wav, prefix, lang })]);
        if (whisper.exitCode !== 0) throw new Error(`whisper-cli failed: ${whisper.stderr.trim()}`);
        const { transcription } = JSON.parse(readFileSync(`${prefix}.json`, "utf8"));
        const transcript = `${ctx.base}.transcript.md`;
        writeFileSync(transcript, segmentsToMarkdown(transcription));
        ctx.log(`transcript: ${transcript}`);
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    },
  };
}

export const transcription = createTranscription();
