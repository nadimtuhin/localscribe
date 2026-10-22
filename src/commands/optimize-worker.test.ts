import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { enqueueJob, readQueue, writeQueue } from "../optimize.ts";
import type { ProcessRunner, RunResult } from "../runner.ts";
import {
  createOptimizeWorkerCommand,
  defaultNotify,
  optimizeWorkerCommand,
  type OptimizeWorkerDeps,
} from "./optimize-worker.ts";
import type { CliArgs } from "./shared.ts";

const tmpDir = join(import.meta.dir, "..", "..", ".test-optimize-worker");
const queuePath = join(tmpDir, "queue.json");

let isRunningVal: boolean;
let signalHandlers: Record<string, () => void>;

beforeEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  isRunningVal = false;
  signalHandlers = {};
});

const fakeRunner: ProcessRunner = {
  which: () => "/bin/ffmpeg",
  run: (): RunResult => ({ exitCode: 0, stdout: "", stderr: "" }),
  spawnDetached: () => 1,
  isAlive: () => true,
  isRunning: () => isRunningVal,
  kill: () => {},
  sleep: async () => {},
};

const fakeSignals = {
  on: (signal: "SIGINT" | "SIGTERM", handler: () => void) => {
    signalHandlers[signal] = handler;
  },
};

const createDeps = (overrides: Partial<OptimizeWorkerDeps> = {}): OptimizeWorkerDeps => ({
  queuePath,
  runner: fakeRunner,
  statBytes: () => 1000,
  notify: () => {},
  signals: fakeSignals,
  log: () => {},
  ...overrides,
});

describe("optimize-worker command", () => {
  test("processes jobs and cleans up workerPid on completion", async () => {
    enqueueJob(queuePath, { input: "in.mp4", output: "out.mp4" });
    const cmd = createOptimizeWorkerCommand(createDeps());

    const code = await cmd({} as CliArgs);
    expect(code).toBe(0);

    const q = readQueue(queuePath);
    expect(q.jobs[0]!.status).toBe("completed");
    expect(q.workerPid).toBeUndefined();
  });

  test("exits early if another worker is already running", async () => {
    isRunningVal = true;
    writeQueue(queuePath, { workerPid: 8888, jobs: [] });

    let ran = false;
    const cmd = createOptimizeWorkerCommand(
      createDeps({
        runner: {
          ...fakeRunner,
          run: () => {
            ran = true;
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        },
      }),
    );

    const code = await cmd({} as CliArgs);
    expect(code).toBe(0);
    expect(ran).toBe(false);
  });

  test("registers signal handlers for graceful stop", async () => {
    const cmd = createOptimizeWorkerCommand(createDeps());
    await cmd({} as CliArgs);
    expect(typeof signalHandlers.SIGINT).toBe("function");
    expect(typeof signalHandlers.SIGTERM).toBe("function");
    signalHandlers.SIGINT();
    signalHandlers.SIGTERM();
  });

  test("defaultNotify helper handles notification safely", () => {
    expect(() => defaultNotify("/dummy/file.mp4")).not.toThrow();
  });

  test("default optimizeWorkerCommand is a function", () => {
    expect(typeof optimizeWorkerCommand).toBe("function");
  });
});
