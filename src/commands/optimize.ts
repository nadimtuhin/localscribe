import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { clearQueue, enqueueJob, parseResolution, readQueue, writeQueue } from "../optimize.ts";
import { optimizeLogPath, optimizeQueuePath } from "../paths.ts";
import { list, type RecordingFile } from "../recorder.ts";
import { realRunner, type ProcessRunner } from "../runner.ts";
import { formatSize, optionalNumber, type Command } from "./shared.ts";

const CLI_PATH = join(import.meta.dir, "..", "cli.ts");

export interface OptimizeDeps {
  list: () => RecordingFile[];
  runner: ProcessRunner;
  queuePath: string;
  logPath: string;
  workerCommand: () => string[];
  exists: (path: string) => boolean;
  statBytes: (path: string) => number;
  log: (text: string) => void;
  sleep: (ms: number) => Promise<void>;
}

export const realStatBytes = (path: string): number => statSync(path).size;
export const realExists = (path: string): boolean => existsSync(path);
export const optimizeWorkerCommand = (): string[] => [process.execPath, CLI_PATH, "optimize-worker"];
export const realSleep = (ms: number): Promise<void> => Bun.sleep(ms);

const realDeps: OptimizeDeps = {
  list,
  runner: realRunner,
  queuePath: optimizeQueuePath(),
  logPath: optimizeLogPath(),
  workerCommand: optimizeWorkerCommand,
  exists: realExists,
  statBytes: realStatBytes,
  log: console.log,
  sleep: realSleep,
};

export function createOptimizeCommand(deps: OptimizeDeps = realDeps): Command {
  return async ({ positionals, values }) => {
    if (values.clear) {
      clearQueue(deps.queuePath);
      deps.log("cleared completed and failed optimization jobs");
      return 0;
    }

    if (values.status) {
      const data = readQueue(deps.queuePath);
      const isWorkerActive = Boolean(data.workerPid && deps.runner.isRunning(data.workerPid, "bun"));
      if (values.json) {
        deps.log(JSON.stringify({ workerActive: isWorkerActive, workerPid: data.workerPid ?? null, jobs: data.jobs }, null, 2));
        return 0;
      }
      deps.log(`worker: ${isWorkerActive ? `active (pid ${data.workerPid})` : "idle"}`);
      if (data.jobs.length === 0) {
        deps.log("no jobs in queue");
        return 0;
      }
      deps.log("jobs:");
      for (const job of data.jobs) {
        const resLabel = job.resolution ? ` (${job.resolution})` : "";
        let extra = "";
        if (job.status === "completed" && job.inputBytes && job.outputBytes) {
          const pct = Math.round((1 - job.outputBytes / job.inputBytes) * 100);
          extra = ` (${formatSize(job.inputBytes)} -> ${formatSize(job.outputBytes)}, ${pct}% saved)`;
        } else if (job.status === "failed" && job.error) {
          extra = ` (error: ${job.error})`;
        }
        deps.log(`  [${job.status}] ${basename(job.input)}${resLabel} -> ${basename(job.output)}${extra}`);
      }
      return 0;
    }

    const files = deps.list();
    const target = positionals[0] ?? files[0]?.path;
    if (!target || !deps.exists(target)) {
      deps.log(target ? `file not found: ${target}` : "no recordings found");
      return 1;
    }

    const resInput = values.resolution ?? values.res;
    if (resInput) {
      parseResolution(resInput);
    }

    const base = target.replace(/\.mp4$/, "");
    const output = values.out ? resolve(values.out) : `${base}.opt.mp4`;

    let inputBytes: number | undefined;
    try {
      inputBytes = deps.statBytes(target);
    } catch {
      // ignore
    }

    const crf = optionalNumber(values.crf);

    const job = enqueueJob(deps.queuePath, {
      input: target,
      output,
      resolution: resInput,
      crf,
      inputBytes,
    });

    const data = readQueue(deps.queuePath);
    let workerPid = data.workerPid;
    if (!workerPid || !deps.runner.isRunning(workerPid, "bun")) {
      workerPid = deps.runner.spawnDetached(deps.workerCommand(), deps.logPath);
      data.workerPid = workerPid;
      writeQueue(deps.queuePath, data);
    }

    if (values.wait) {
      deps.log(`optimizing ${target}${resInput ? ` (${resInput})` : ""} -> ${output}...`);
      let done = false;
      let exitCode = 0;
      while (!done) {
        await deps.sleep(50);
        const latest = readQueue(deps.queuePath);
        const current = latest.jobs.find((j) => j.id === job.id);
        if (!current || current.status === "failed") {
          deps.log(`optimization failed: ${current?.error ?? "unknown error"}`);
          done = true;
          exitCode = 1;
        } else if (current.status === "completed") {
          let savedInfo = "";
          if (current.inputBytes && current.outputBytes) {
            const pct = Math.round((1 - current.outputBytes / current.inputBytes) * 100);
            savedInfo = ` (${formatSize(current.inputBytes)} -> ${formatSize(current.outputBytes)}, ${pct}% saved)`;
          }
          deps.log(`optimized ${output}${savedInfo}`);
          done = true;
          exitCode = 0;
        }
      }
      return exitCode;
    }

    deps.log(`enqueued ${target}${resInput ? ` (${resInput})` : ""} for optimization -> ${output}`);
    deps.log(`queue job ${job.id} (worker pid ${workerPid})`);
    return 0;
  };
}

export const optimizeCommand = createOptimizeCommand();
