import { activeRecording } from "../recorder.ts";
import type { RecordingState } from "../state.ts";
import { formatDuration, type Command } from "./shared.ts";

export function createStatusCommand(active: () => RecordingState | null = activeRecording, now: () => number = Date.now): Command {
  return async () => {
    const state = active();
    if (!state) {
      console.log("not recording");
      return 1;
    }
    console.log(`recording ${state.file} (${formatDuration(now() - Date.parse(state.startedAt))})`);
    return 0;
  };
}

export const statusCommand = createStatusCommand();
