import { statSync } from "node:fs";
import { generateAndReport, realHermesRun, type HermesRun } from "../notes/generate.ts";
import type { Command } from "./shared.ts";

const baseOf = (path: string) => path.replace(/\.(mp4|transcript\.md|notes\.md)$/, "");

export const createNotesCommand = (run: HermesRun, log: (line: string) => void): Command => async ({ positionals }) => {
  const path = positionals[0];
  if (!path) {
    log("usage: localscribe notes <file.mp4|transcript.md>");
    return 1;
  }
  const base = baseOf(path);
  let startedAt = new Date().toISOString();
  try { startedAt = statSync(`${base}.transcript.md`).mtime.toISOString(); } catch { /* missing transcript is reported by generateNotes */ }
  await generateAndReport(base, { file: `${base}.mp4`, startedAt }, log, run);
  return 0;
};

export const notesCommand = createNotesCommand(realHermesRun, console.log);
