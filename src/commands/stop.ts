import { ensureHelper, stop } from "../recorder.ts";
import { realRunner, type ProcessRunner } from "../runner.ts";
import { notifySaved } from "../notify.ts";
import { formatDuration, formatSize, type Command } from "./shared.ts";

export interface StopDeps {
  stop: typeof stop;
  notify: typeof notifySaved;
  runner: ProcessRunner;
  log: (text: string) => void;
  warn: (text: string) => void;
  error: (text: string) => void;
}

const realDeps: StopDeps = { stop, notify: notifySaved, runner: realRunner, log: console.log, warn: console.warn, error: console.error };

export function createStopCommand(deps: StopDeps = realDeps): Command {
  return async ({ values }) => {
    const result = await deps.stop();
    if (result.forced) deps.warn("warning: a recorder process did not exit in time and was killed; file may be truncated");
    if (result.mixError) {
      deps.error(`mixing audio failed; raw parts kept:\n  ${result.keptParts.join("\n  ")}\n${result.mixError}`);
      return 1;
    }
    deps.log(`saved ${result.file} (${formatDuration(result.durationMs)}, ${formatSize(result.bytes)})`);
    if (values.notify) deps.notify(result.file, { runner: deps.runner, ensureHelper, log: deps.log });
    return 0;
  };
}

export const stopCommand = createStopCommand();
