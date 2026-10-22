import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { list, type RecordingFile } from "../recorder.ts";
import { formatSize, type Command } from "./shared.ts";

export interface LastDeps {
  list: () => RecordingFile[];
  exists: (path: string) => boolean;
  read: (path: string) => string;
  log: (text: string) => void;
}

export const readText = (path: string): string => readFileSync(path, "utf8");

const realDeps: LastDeps = { list, exists: existsSync, read: readText, log: console.log };

// The notes file leads with a header block; the model's own "## Summary" is the part worth reading.
function summaryOf(notes: string): string {
  const start = notes.indexOf("## Summary");
  if (start === -1) return "";
  const rest = notes.slice(start + "## Summary".length);
  const end = rest.search(/\n## /);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

export function createLastCommand(deps: LastDeps = realDeps): Command {
  return async ({ values }) => {
    const newest = deps.list()[0];
    if (!newest) {
      deps.log("no recordings yet");
      return 1;
    }
    const base = newest.path.replace(/\.mp4$/, "");
    const notesPath = `${base}.notes.md`;
    const txPath = `${base}.transcript.md`;
    const hasNotes = deps.exists(notesPath);
    const hasTx = deps.exists(txPath);

    if (values.json) {
      deps.log(JSON.stringify({
        file: newest.path,
        name: basename(newest.path),
        bytes: newest.bytes,
        modified: newest.modified.toISOString(),
        notes: hasNotes ? notesPath : null,
        transcript: hasTx ? txPath : null,
      }));
      return 0;
    }

    deps.log(`${basename(newest.path)}  ${formatSize(newest.bytes)}  ${newest.modified.toLocaleString()}`);
    deps.log(`video: ${newest.path}`);
    if (hasNotes) deps.log(`notes: ${notesPath}`);
    if (hasTx) deps.log(`transcript: ${txPath}`);
    if (hasNotes) {
      const summary = summaryOf(deps.read(notesPath));
      if (summary) deps.log(`\n${summary}`);
    }
    return 0;
  };
}

export const lastCommand = createLastCommand();
