import { activeRecording } from "../recorder.ts";
import { formatDuration, type Command } from "./shared.ts";

export const statusCommand: Command = async () => {
  const state = activeRecording();
  if (!state) {
    console.log("not recording");
    return 1;
  }
  console.log(`recording ${state.file} (${formatDuration(Date.now() - Date.parse(state.startedAt))})`);
  return 0;
};
