#!/usr/bin/env bun
import { runCli } from "./commands/index.ts";
import { SelectionError } from "./capture/selection.ts";
import { LiveOptionsError } from "./live/options.ts";
import { RecorderError } from "./recorder.ts";
import { WhisperModelError } from "./transcription/core.ts";
import { LanguageError } from "./transcription/language.ts";
import { OptimizeError } from "./optimize.ts";

runCli(Bun.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof RecorderError || error instanceof SelectionError || error instanceof LiveOptionsError || error instanceof LanguageError || error instanceof WhisperModelError || error instanceof OptimizeError ? error.message : error);
    process.exit(1);
  },
);
