import { statSync } from "node:fs";
import { parseLanguage } from "../transcription/language.ts";
import { generateAndReport, realHermesRun, type HermesRun } from "../notes/generate.ts";
import type { Command } from "./shared.ts";

const baseOf = (path: string) => path.replace(/\.(mp4|m4a|transcript\.md|notes\.md)$/, "");

export const createNotesCommand = (run: HermesRun, log: (line: string) => void): Command => async ({ positionals, values }) => {
  const path = positionals[0];
  if (!path) {
    log("usage: localscribe notes <file.mp4|transcript.md>");
    return 1;
  }
  const lang = values.lang === undefined ? undefined : parseLanguage(values.lang);
  const base = baseOf(path);
  let startedAt = new Date().toISOString();
  try { startedAt = statSync(`${base}.transcript.md`).mtime.toISOString(); } catch { /* missing transcript is reported by generateNotes */ }
  await generateAndReport(base, { file: `${base}.mp4`, startedAt, lang, name: values.name }, log, run);
  return 0;
};

export const notesCommand = createNotesCommand(realHermesRun, console.log);
