import { list } from "../recorder.ts";
import { formatSize, type Command } from "./shared.ts";

export const listCommand: Command = async () => {
  const files = list();
  if (files.length === 0) console.log("no recordings yet");
  for (const f of files) console.log(`${f.modified.toLocaleString()}  ${formatSize(f.bytes).padStart(9)}  ${f.name}`);
  return 0;
};
