import { notifySaved } from "../notify.ts";
import { processQueue, readQueue, writeQueue } from "../optimize.ts";
import { optimizeQueuePath } from "../paths.ts";
import { ensureHelper } from "../recorder.ts";
import { realRunner, type ProcessRunner } from "../runner.ts";
import { realStatBytes } from "./optimize.ts";
import type { Command } from "./shared.ts";

export interface OptimizeWorkerDeps {
  queuePath: string;
  runner: ProcessRunner;
  statBytes: (path: string) => number;
  notify: (file: string) => void;
  signals: { on(signal: "SIGINT" | "SIGTERM", handler: () => void): unknown };
  log: (line: string) => void;
}

export const defaultNotify = (file: string): void => {
  notifySaved(file, { runner: realRunner, ensureHelper, log: console.log });
};

const realWorkerDeps: OptimizeWorkerDeps = {
  queuePath: optimizeQueuePath(),
  runner: realRunner,
  statBytes: realStatBytes,
  notify: defaultNotify,
  signals: process,
  log: console.log,
};

export function createOptimizeWorkerCommand(deps: OptimizeWorkerDeps = realWorkerDeps): Command {
  return async () => {
    const initial = readQueue(deps.queuePath);
    if (initial.workerPid && initial.workerPid !== process.pid && deps.runner.isRunning(initial.workerPid, "bun")) {
      return 0;
    }

    initial.workerPid = process.pid;
    writeQueue(deps.queuePath, initial);

    let interrupted = false;
    deps.signals.on("SIGINT", () => {
      interrupted = true;
    });
    deps.signals.on("SIGTERM", () => {
      interrupted = true;
    });

    try {
      await processQueue({
        queuePath: deps.queuePath,
        runner: deps.runner,
        statBytes: deps.statBytes,
        log: deps.log,
        notify: deps.notify,
        shouldStop: () => interrupted,
      });
    } finally {
      const current = readQueue(deps.queuePath);
      if (current.workerPid === process.pid) {
        delete current.workerPid;
        writeQueue(deps.queuePath, current);
      }
    }

    return 0;
  };
}

export const optimizeWorkerCommand = createOptimizeWorkerCommand();
