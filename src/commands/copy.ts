import { existsSync, readFileSync } from "node:fs";
import { list, type RecordingFile } from "../recorder.ts";
import type { Command } from "./shared.ts";

export interface CopyDeps {
  list: () => RecordingFile[];
  log: (text: string) => void;
  exists: (path: string) => boolean;
  read: (path: string) => string;
}

export const readText = (path: string): string => readFileSync(path, "utf8");

const realDeps: CopyDeps = {
  list,
  log: console.log,
  exists: existsSync,
  read: readText,
};

export function copyToClipboard(text: string, spawn: typeof Bun.spawnSync = Bun.spawnSync): boolean {
  try {
    const proc = spawn(["pbcopy"], { stdin: Buffer.from(text) });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export function createCopyCommand(
  deps: CopyDeps = realDeps,
  copyFn: (text: string) => boolean = copyToClipboard,
): Command {
  return async ({ positionals, values }) => {
    const files = deps.list();
    const target = positionals[0] ?? files[0]?.path;
    if (!target) {
      deps.log("no recordings found");
      return 1;
    }
    const base = target.replace(/\.(mp4|m4a|transcript\.md|notes\.md)$/, "");
    const notesPath = `${base}.notes.md`;
    const txPath = `${base}.transcript.md`;
    const preferTx = values.transcribe === true;
    const chosen = preferTx
      ? (deps.exists(txPath) ? txPath : null)
      : (deps.exists(notesPath) ? notesPath : (deps.exists(txPath) ? txPath : null));

    if (!chosen) {
      deps.log(`no notes or transcript found for ${target}`);
      return 1;
    }
    const content = deps.read(chosen);
    copyFn(content);
    deps.log(`copied to clipboard: ${chosen}`);
    return 0;
  };
}

export const copyCommand = createCopyCommand();
