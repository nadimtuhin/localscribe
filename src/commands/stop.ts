import { stop } from "../recorder.ts";
import { formatDuration, formatSize, type Command } from "./shared.ts";

export const stopCommand: Command = async () => {
  const result = await stop();
  if (result.forced) console.warn("warning: a recorder process did not exit in time and was killed; file may be truncated");
  if (result.mixError) {
    console.error(`mixing audio failed; raw parts kept:\n  ${result.keptParts.join("\n  ")}\n${result.mixError}`);
    return 1;
  }
  console.log(`saved ${result.file} (${formatDuration(result.durationMs)}, ${formatSize(result.bytes)})`);
  return 0;
};
