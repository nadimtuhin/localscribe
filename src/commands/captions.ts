import { existsSync, readFileSync } from "node:fs";
import { activeRecording } from "../recorder.ts";
import type { RecordingState } from "../state.ts";
import type { Command } from "./shared.ts";

const POLL_MS = 500;

export interface CaptionsDeps {
  active: () => RecordingState | null;
  sleep: (ms: number) => Promise<void>;
  print: (text: string) => void;
  printError: (text: string) => void;
}

const realDeps: CaptionsDeps = {
  active: activeRecording,
  sleep: Bun.sleep,
  print: process.stdout.write.bind(process.stdout),
  printError: console.error,
};

// Tails `<base>.live.txt` of the active recording until the recording stops.
export function createCaptionsCommand(deps: CaptionsDeps = realDeps): Command {
  return async () => {
    const state = deps.active();
    if (!state) {
      deps.printError("not recording");
      return 1;
    }
    if (!state.pluginOptions?.liveCaptions) {
      deps.printError("this recording has no live captions (start it with --live)");
      return 1;
    }
    const liveFile = `${state.file.replace(/\.mp4$/, "")}.live.txt`;
    let offset = 0;
    const drain = () => {
      if (!existsSync(liveFile)) return;
      const bytes = readFileSync(liveFile);
      if (bytes.length > offset) deps.print(bytes.subarray(offset).toString("utf8"));
      offset = bytes.length;
    };
    drain();
    while (deps.active()) {
      await deps.sleep(POLL_MS);
      drain();
    }
    return 0;
  };
}

export const captionsCommand = createCaptionsCommand();
