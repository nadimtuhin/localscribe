#!/usr/bin/env bun
import { runCli } from "./commands/index.ts";
import { SelectionError } from "./capture/selection.ts";
import { LiveOptionsError } from "./live/options.ts";
import { RecorderError } from "./recorder.ts";

runCli(Bun.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof RecorderError || error instanceof SelectionError || error instanceof LiveOptionsError ? error.message : error);
    process.exit(1);
  },
);
