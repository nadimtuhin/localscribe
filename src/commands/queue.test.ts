import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { enqueueJob } from "../optimize.ts";
import type { ProcessRunner, RunResult } from "../runner.ts";
import type { OptimizeDeps } from "./optimize.ts";
import { createQueueCommand, queueCommand } from "./queue.ts";

const tmpDir = join(import.meta.dir, "..", "..", ".test-cmd-queue");
const queuePath = join(tmpDir, "queue.json");
const logPath = join(tmpDir, "worker.log");

let logs: string[];

beforeEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  logs = [];
});

const fakeRunner: ProcessRunner = {
  which: () => "/bin/ffmpeg",
  run: (): RunResult => ({ exitCode: 0, stdout: "", stderr: "" }),
  spawnDetached: () => 1,
  isAlive: () => true,
  isRunning: () => false,
  kill: () => {},
  sleep: async () => {},
};

const createDeps = (overrides: Partial<OptimizeDeps> = {}): OptimizeDeps => ({
  list: () => [],
  runner: fakeRunner,
  queuePath,
  logPath,
  workerCommand: () => ["localscribe", "optimize-worker"],
  exists: () => true,
  statBytes: () => 0,
  log: (msg) => logs.push(msg),
  sleep: async () => {},
  ...overrides,
});

describe("queue command", () => {
  test("shows queue status by default", async () => {
    const cmd = createQueueCommand(createDeps());
    const code = await cmd({ positionals: [], values: {} });
    expect(code).toBe(0);
    expect(logs).toEqual(["worker: idle", "no jobs in queue"]);
  });

  test("clears queue with --clear", async () => {
    enqueueJob(queuePath, { input: "1.mp4", output: "1.opt.mp4" });
    const cmd = createQueueCommand(createDeps());
    const code = await cmd({ positionals: [], values: { clear: true } });
    expect(code).toBe(0);
    expect(logs).toEqual(["cleared completed and failed optimization jobs"]);
  });

  test("default queueCommand is a function", () => {
    expect(typeof queueCommand).toBe("function");
  });
});
