import { list, type RecordingFile } from "../recorder.ts";
import { formatSize, type Command } from "./shared.ts";

export interface ListDeps {
  list: () => RecordingFile[];
  log: (text: string) => void;
}

const realDeps: ListDeps = { list, log: console.log };

export function createListCommand(deps: ListDeps = realDeps): Command {
  return async () => {
    const files = deps.list();
    if (files.length === 0) deps.log("no recordings yet");
    for (const f of files) deps.log(`${f.modified.toLocaleString()}  ${formatSize(f.bytes).padStart(9)}  ${f.name}`);
    return 0;
  };
}

export const listCommand = createListCommand();
