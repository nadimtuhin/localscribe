import { dirname, join } from "node:path";
import { ensureHelper } from "./recorder.ts";
import type { ProcessRunner } from "./runner.ts";
import { stateFilePath } from "./paths.ts";

const PROJECT_ROOT = join(import.meta.dir, "..");
export const NOTIFY = { source: join(PROJECT_ROOT, "native", "notify.swift"), binary: join(PROJECT_ROOT, "bin", "localscribe-notify") };

export interface NotifyDeps {
  runner: ProcessRunner;
  ensureHelper: typeof ensureHelper;
  log: (text: string) => void;
}

// The helper stays alive after posting so a click can still reach it: macOS delivers the
// click to the process that posted the banner, and a bare binary has no bundle to re-open.
export function notifySaved(file: string, deps: NotifyDeps): void {
  try {
    const helper = deps.ensureHelper(deps.runner, NOTIFY);
    const logFile = join(dirname(stateFilePath()), "notify.log");
    deps.runner.spawnDetached([helper, "Localscribe", file], logFile);
  } catch (error) {
    deps.log(`notification skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}
