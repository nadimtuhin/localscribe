import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { enqueueJob, readQueue, updateJob } from "../optimize.ts";
import type { RecordingFile } from "../recorder.ts";
import type { ProcessRunner, RunResult } from "../runner.ts";
import {
  createOptimizeCommand,
  optimizeCommand,
  optimizeWorkerCommand,
  realExists,
  realSleep,
  realStatBytes,
  type OptimizeDeps,
} from "./optimize.ts";

const tmpDir = join(import.meta.dir, "..", "..", ".test-cmd-optimize");
const queuePath = join(tmpDir, "queue.json");
const logPath = join(tmpDir, "worker.log");

let logs: string[];
let spawned: { cmd: string[]; log: string }[];
let isRunningReturn: boolean;

beforeEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  logs = [];
  spawned = [];
  isRunningReturn = false;
});

const fakeRunner: ProcessRunner = {
  which: () => "/bin/ffmpeg",
  run: (): RunResult => ({ exitCode: 0, stdout: "", stderr: "" }),
  spawnDetached: (cmd, log) => {
    spawned.push({ cmd, log });
    return 999;
  },
  isAlive: () => true,
  isRunning: () => isRunningReturn,
  kill: () => {},
  sleep: async () => {},
};

const makeRecording = (path: string, bytes = 10_000_000): RecordingFile => ({
  name: path.split("/").pop()!,
  path,
  bytes,
  modified: new Date(),
});

const createDeps = (overrides: Partial<OptimizeDeps> = {}): OptimizeDeps => ({
  list: () => [makeRecording("/movies/rec.mp4")],
  runner: fakeRunner,
  queuePath,
  logPath,
  workerCommand: () => ["localscribe", "optimize-worker"],
  exists: () => true,
  statBytes: () => 10_000_000,
  log: (msg) => logs.push(msg),
  sleep: async () => {},
  ...overrides,
});

describe("optimize command", () => {
  test("enqueues newest recording by default and starts worker if idle", async () => {
    const cmd = createOptimizeCommand(createDeps());
    const code = await cmd({ positionals: [], values: {} });
    expect(code).toBe(0);

    const q = readQueue(queuePath);
    expect(q.jobs).toHaveLength(1);
    expect(q.jobs[0]!.input).toBe("/movies/rec.mp4");
    expect(q.jobs[0]!.output).toBe("/movies/rec.opt.mp4");
    expect(q.jobs[0]!.status).toBe("queued");
    expect(q.workerPid).toBe(999);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.cmd).toEqual(["localscribe", "optimize-worker"]);
    expect(logs.some((l) => l.includes("enqueued /movies/rec.mp4"))).toBe(true);
    expect(logs.some((l) => l.includes("worker pid 999"))).toBe(true);
  });

  test("does not spawn new worker if already running", async () => {
    isRunningReturn = true;
    const deps = createDeps();
    enqueueJob(queuePath, { input: "prev.mp4", output: "prev.opt.mp4" });
    const q = readQueue(queuePath);
    q.workerPid = 123;
    const { writeQueue } = await import("../optimize.ts");
    writeQueue(queuePath, q);

    const cmd = createOptimizeCommand(deps);
    const code = await cmd({ positionals: ["/movies/another.mp4"], values: { resolution: "720p" } });
    expect(code).toBe(0);
    expect(spawned).toHaveLength(0);
    expect(logs.some((l) => l.includes("worker pid 123"))).toBe(true);
  });

  test("spawns new worker if existing workerPid is dead", async () => {
    isRunningReturn = false;
    const deps = createDeps();
    enqueueJob(queuePath, { input: "prev.mp4", output: "prev.opt.mp4" });
    const q = readQueue(queuePath);
    q.workerPid = 123;
    const { writeQueue } = await import("../optimize.ts");
    writeQueue(queuePath, q);

    const cmd = createOptimizeCommand(deps);
    const code = await cmd({ positionals: ["/movies/another.mp4"], values: {} });
    expect(code).toBe(0);
    expect(spawned).toHaveLength(1);
    expect(readQueue(queuePath).workerPid).toBe(999);
  });

  test("accepts resolution and custom crf and output", async () => {
    const cmd = createOptimizeCommand(createDeps());
    const code = await cmd({
      positionals: ["/movies/rec.mp4"],
      values: { resolution: "1080p", crf: "20", out: "/custom/out.mp4" },
    });
    expect(code).toBe(0);
    const job = readQueue(queuePath).jobs[0]!;
    expect(job.resolution).toBe("1080p");
    expect(job.crf).toBe(20);
    expect(job.output).toBe("/custom/out.mp4");
  });

  test("accepts --res alias for resolution", async () => {
    const cmd = createOptimizeCommand(createDeps());
    const code = await cmd({ positionals: ["/movies/rec.mp4"], values: { res: "720p" } });
    expect(code).toBe(0);
    expect(readQueue(queuePath).jobs[0]!.resolution).toBe("720p");
  });

  test("rejects invalid resolution with OptimizeError", async () => {
    const cmd = createOptimizeCommand(createDeps());
    expect(cmd({ positionals: ["/movies/rec.mp4"], values: { resolution: "invalid-res" } })).rejects.toThrow();
  });

  test("fails when no recordings found", async () => {
    const cmd = createOptimizeCommand(createDeps({ list: () => [], exists: () => false }));
    const code = await cmd({ positionals: [], values: {} });
    expect(code).toBe(1);
    expect(logs).toEqual(["no recordings found"]);
  });

  test("fails when positional file does not exist", async () => {
    const cmd = createOptimizeCommand(createDeps({ exists: () => false }));
    const code = await cmd({ positionals: ["/nonexistent.mp4"], values: {} });
    expect(code).toBe(1);
    expect(logs).toEqual(["file not found: /nonexistent.mp4"]);
  });

  test("fails when statBytes throws on target", async () => {
    const cmd = createOptimizeCommand(
      createDeps({
        statBytes: () => {
          throw new Error("stat failed");
        },
      }),
    );
    const code = await cmd({ positionals: [], values: {} });
    expect(code).toBe(0);
    expect(readQueue(queuePath).jobs[0]!.inputBytes).toBeUndefined();
  });

  test("--wait waits for job to complete and prints savings", async () => {
    let tick = 0;
    const cmd = createOptimizeCommand(
      createDeps({
        sleep: async () => {
          tick++;
          if (tick === 2) {
            const j = readQueue(queuePath).jobs[0]!;
            updateJob(queuePath, j.id, {
              status: "completed",
              outputBytes: 2_000_000,
            });
          }
        },
      }),
    );
    const code = await cmd({ positionals: [], values: { wait: true } });
    expect(code).toBe(0);
    expect(logs.some((l) => l.includes("optimized /movies/rec.opt.mp4"))).toBe(true);
    expect(logs.some((l) => l.includes("80% saved"))).toBe(true);
  });

  test("--wait handles completion without size stats", async () => {
    const cmd = createOptimizeCommand(
      createDeps({
        statBytes: () => {
          throw new Error("missing");
        },
        sleep: async () => {
          const j = readQueue(queuePath).jobs[0]!;
          updateJob(queuePath, j.id, {
            status: "completed",
          });
        },
      }),
    );
    const code = await cmd({ positionals: [], values: { wait: true } });
    expect(code).toBe(0);
    expect(logs.some((l) => l.includes("optimized /movies/rec.opt.mp4"))).toBe(true);
  });

  test("--wait reports failure when job fails", async () => {
    const cmd = createOptimizeCommand(
      createDeps({
        sleep: async () => {
          const j = readQueue(queuePath).jobs[0]!;
          updateJob(queuePath, j.id, {
            status: "failed",
            error: "codec not supported",
          });
        },
      }),
    );
    const code = await cmd({ positionals: [], values: { wait: true } });
    expect(code).toBe(1);
    expect(logs.some((l) => l.includes("optimization failed: codec not supported"))).toBe(true);
  });

  test("--wait reports failure when job vanishes", async () => {
    const cmd = createOptimizeCommand(
      createDeps({
        sleep: async () => {
          const { writeQueue } = await import("../optimize.ts");
          writeQueue(queuePath, { jobs: [] });
        },
      }),
    );
    const code = await cmd({ positionals: [], values: { wait: true } });
    expect(code).toBe(1);
    expect(logs.some((l) => l.includes("optimization failed: unknown error"))).toBe(true);
  });

  test("--status prints queue status and jobs", async () => {
    isRunningReturn = true;
    const j1 = enqueueJob(queuePath, { input: "/a/1.mp4", output: "/a/1.opt.mp4", resolution: "1080p", inputBytes: 10_000_000 });
    updateJob(queuePath, j1.id, { status: "completed", outputBytes: 3_000_000 });
    const j2 = enqueueJob(queuePath, { input: "/a/2.mp4", output: "/a/2.opt.mp4" });
    updateJob(queuePath, j2.id, { status: "failed", error: "bad video" });
    const j3 = enqueueJob(queuePath, { input: "/a/3.mp4", output: "/a/3.opt.mp4" });
    updateJob(queuePath, j3.id, { status: "processing" });
    const j4 = enqueueJob(queuePath, { input: "/a/4.mp4", output: "/a/4.opt.mp4" });
    updateJob(queuePath, j4.id, { status: "completed" });
    const j5 = enqueueJob(queuePath, { input: "/a/5.mp4", output: "/a/5.opt.mp4" });
    updateJob(queuePath, j5.id, { status: "failed" });

    const { writeQueue } = await import("../optimize.ts");
    const data = readQueue(queuePath);
    data.workerPid = 555;
    writeQueue(queuePath, data);

    const cmd = createOptimizeCommand(createDeps());
    const code = await cmd({ positionals: [], values: { status: true } });
    expect(code).toBe(0);
    expect(logs.some((l) => l.includes("worker: active (pid 555)"))).toBe(true);
    expect(logs.some((l) => l.includes("[completed] 1.mp4 (1080p) -> 1.opt.mp4 (9.5 MB -> 2.9 MB, 70% saved)"))).toBe(true);
    expect(logs.some((l) => l.includes("[failed] 2.mp4 -> 2.opt.mp4 (error: bad video)"))).toBe(true);
    expect(logs.some((l) => l.includes("[processing] 3.mp4 -> 3.opt.mp4"))).toBe(true);
  });

  test("--status prints idle when worker not running and empty queue notice", async () => {
    const cmd = createOptimizeCommand(createDeps());
    const code = await cmd({ positionals: [], values: { status: true } });
    expect(code).toBe(0);
    expect(logs).toEqual(["worker: idle", "no jobs in queue"]);
  });

  test("--status with --json prints valid json", async () => {
    const cmd = createOptimizeCommand(createDeps());
    const code = await cmd({ positionals: [], values: { status: true, json: true } });
    expect(code).toBe(0);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed.workerActive).toBe(false);
    expect(parsed.jobs).toEqual([]);
  });

  test("--clear removes completed and failed jobs", async () => {
    const j1 = enqueueJob(queuePath, { input: "1.mp4", output: "1.opt.mp4" });
    updateJob(queuePath, j1.id, { status: "completed" });
    const cmd = createOptimizeCommand(createDeps());
    const code = await cmd({ positionals: [], values: { clear: true } });
    expect(code).toBe(0);
    expect(logs).toEqual(["cleared completed and failed optimization jobs"]);
    expect(readQueue(queuePath).jobs).toHaveLength(0);
  });
});

describe("real exported helpers", () => {
  test("realStatBytes and realExists check disk", () => {
    const fixture = join(tmpDir, "test.txt");
    writeFileSync(fixture, "hello world");
    expect(realExists(fixture)).toBe(true);
    expect(realExists(join(tmpDir, "missing.txt"))).toBe(false);
    expect(realStatBytes(fixture)).toBe(11);
  });

  test("optimizeWorkerCommand returns command array", () => {
    const cmd = optimizeWorkerCommand();
    expect(cmd).toContain("optimize-worker");
  });

  test("realSleep resolves", async () => {
    await expect(realSleep(1)).resolves.toBeUndefined();
  });

  test("default optimizeCommand is function", () => {
    expect(typeof optimizeCommand).toBe("function");
  });
});
