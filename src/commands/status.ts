import { activeRecording } from "../recorder.ts";
import type { RecordingState } from "../state.ts";
import { formatDuration, type Command } from "./shared.ts";

export function createStatusCommand(active: () => RecordingState | null = activeRecording, now: () => number = Date.now): Command {
  return async ({ values }) => {
    const state = active();
    if (!state) {
      console.log(values.json ? JSON.stringify({ recording: false }) : "not recording");
      return 1;
    }
    const elapsedMs = now() - Date.parse(state.startedAt);
    console.log(
      values.json
        ? JSON.stringify({ recording: true, file: state.file, startedAt: state.startedAt, elapsedMs })
        : `recording ${state.file} (${formatDuration(elapsedMs)})`,
    );
    return 0;
  };
}

export const statusCommand = createStatusCommand();
