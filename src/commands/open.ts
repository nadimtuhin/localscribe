import { existsSync } from "node:fs";
import { list, type RecordingFile } from "../recorder.ts";
import { realRunner, type ProcessRunner } from "../runner.ts";
import type { Command } from "./shared.ts";

export interface OpenDeps {
  list: () => RecordingFile[];
  runner: ProcessRunner;
  log: (text: string) => void;
  exists: (path: string) => boolean;
}

const realDeps: OpenDeps = { list, runner: realRunner, log: console.log, exists: existsSync };

export function createOpenCommand(deps: OpenDeps = realDeps): Command {
  return async ({ positionals, values }) => {
    const files = deps.list();
    const target = positionals[0] ?? files[0]?.path;
    if (!target || !deps.exists(target)) {
      deps.log("no recordings found");
      return 1;
    }
    const base = target.replace(/\.(mp4|m4a)$/, "");
    let fileToOpen = target;
    if (values.notes) {
      const notesPath = `${base}.notes.md`;
      fileToOpen = deps.exists(notesPath) ? notesPath : target;
    } else if (values.transcribe) {
      const txPath = `${base}.transcript.md`;
      fileToOpen = deps.exists(txPath) ? txPath : target;
    }
    const args = ["open"];
    if (values.reveal) args.push("-R");
    args.push(fileToOpen);
    deps.runner.run(args);
    deps.log(`opened ${fileToOpen}`);
    return 0;
  };
}

export const openCommand = createOpenCommand();
