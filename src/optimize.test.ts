import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOptimizeArgs,
  buildScaleFilter,
  clearQueue,
  enqueueJob,
  getNextQueuedJob,
  OptimizeError,
  parseResolution,
  processQueue,
  readQueue,
  recoverStaleJobs,
  updateJob,
  writeQueue,
} from "./optimize.ts";
import type { ProcessRunner, RunResult } from "./runner.ts";

const tmpDir = join(import.meta.dir, "..", ".test-optimize");
const queuePath = join(tmpDir, "queue.json");

beforeEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
});

describe("parseResolution", () => {
  test("parses preset names", () => {
    expect(parseResolution("360p")).toEqual({ height: 360 });
    expect(parseResolution("480p")).toEqual({ height: 480 });
    expect(parseResolution("720p")).toEqual({ height: 720 });
    expect(parseResolution("1080p")).toEqual({ height: 1080 });
    expect(parseResolution("1440p")).toEqual({ height: 1440 });
    expect(parseResolution("2k")).toEqual({ height: 1440 });
    expect(parseResolution("4k")).toEqual({ height: 2160 });
    expect(parseResolution("2160p")).toEqual({ height: 2160 });
  });

  test("parses numeric height with optional p", () => {
    expect(parseResolution("1080")).toEqual({ height: 1080 });
    expect(parseResolution("720P")).toEqual({ height: 720 });
  });

  test("parses dimensions with x or colon separator", () => {
    expect(parseResolution("1920x1080")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("1280:720")).toEqual({ width: 1280, height: 720 });
  });

  test("throws OptimizeError on invalid resolution", () => {
    expect(() => parseResolution("invalid")).toThrow(OptimizeError);
    expect(() => parseResolution("0")).toThrow(OptimizeError);
    expect(() => parseResolution("0x1080")).toThrow(OptimizeError);
    expect(() => parseResolution("1920x0")).toThrow(OptimizeError);
  });
});

describe("buildScaleFilter", () => {
  test("returns undefined when no resolution given", () => {
    expect(buildScaleFilter()).toBeUndefined();
    expect(buildScaleFilter(undefined)).toBeUndefined();
  });

  test("builds height-proportional filter", () => {
    expect(buildScaleFilter("1080p")).toBe("scale=-2:1080");
    expect(buildScaleFilter("720p")).toBe("scale=-2:720");
  });

  test("builds aspect-ratio-preserving filter for width and height", () => {
    expect(buildScaleFilter("1920x1080")).toBe(
      "scale=1920:1080:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    );
  });
});

describe("buildOptimizeArgs", () => {
  test("builds default ffmpeg args with default crf", () => {
    const args = buildOptimizeArgs({ input: "/a/in.mp4", output: "/a/out.mp4" });
    expect(args).toContain("-i");
    expect(args).toContain("/a/in.mp4");
    expect(args).toContain("-crf");
    expect(args).toContain("24");
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-preset");
    expect(args).toContain("fast");
    expect(args).toContain("-movflags");
    expect(args).toContain("+faststart");
    expect(args.at(-1)).toBe("/a/out.mp4");
    expect(args).not.toContain("-vf");
  });

  test("includes scale filter and custom crf when provided", () => {
    const args = buildOptimizeArgs({ input: "/a/in.mp4", output: "/a/out.mp4", resolution: "720p", crf: 20 });
    expect(args).toContain("-vf");
    expect(args).toContain("scale=-2:720");
    expect(args[args.indexOf("-crf") + 1]).toBe("20");
  });
});

describe("queue persistence", () => {
  test("readQueue returns empty jobs when file missing or corrupt", () => {
    expect(readQueue(join(tmpDir, "missing.json"))).toEqual({ jobs: [] });
    const corruptPath = join(tmpDir, "corrupt.json");
    writeFileSync(corruptPath, "{ broken json");
    expect(readQueue(corruptPath)).toEqual({ jobs: [] });
  });

  test("writeQueue and readQueue round trip", () => {
    const data = { workerPid: 1234, jobs: [] };
    writeQueue(queuePath, data);
    expect(readQueue(queuePath)).toEqual(data);
  });

  test("enqueueJob appends a job with queued status", () => {
    const job = enqueueJob(queuePath, {
      input: "/rec/in.mp4",
      output: "/rec/out.mp4",
      resolution: "1080p",
      crf: 22,
      inputBytes: 5000,
    });
    expect(job.status).toBe("queued");
    expect(job.input).toBe("/rec/in.mp4");
    expect(job.output).toBe("/rec/out.mp4");
    expect(job.resolution).toBe("1080p");
    expect(job.crf).toBe(22);
    expect(job.inputBytes).toBe(5000);
    expect(job.id).toMatch(/^opt_\d+_/);

    const queued = getNextQueuedJob(queuePath);
    expect(queued?.id).toBe(job.id);
  });

  test("updateJob modifies an existing job and ignores unknown ids", () => {
    const job = enqueueJob(queuePath, { input: "in.mp4", output: "out.mp4" });
    updateJob(queuePath, job.id, { status: "processing" });
    expect(readQueue(queuePath).jobs[0]!.status).toBe("processing");

    updateJob(queuePath, "unknown-id", { status: "failed" });
    expect(readQueue(queuePath).jobs[0]!.status).toBe("processing");
  });

  test("getNextQueuedJob returns null when no queued jobs remain", () => {
    expect(getNextQueuedJob(queuePath)).toBeNull();
    const job = enqueueJob(queuePath, { input: "in.mp4", output: "out.mp4" });
    updateJob(queuePath, job.id, { status: "completed" });
    expect(getNextQueuedJob(queuePath)).toBeNull();
  });

  test("recoverStaleJobs reverts processing jobs back to queued", () => {
    const job = enqueueJob(queuePath, { input: "in.mp4", output: "out.mp4" });
    updateJob(queuePath, job.id, { status: "processing" });
    recoverStaleJobs(queuePath);
    expect(readQueue(queuePath).jobs[0]!.status).toBe("queued");

    // no-op when nothing is processing
    recoverStaleJobs(queuePath);
    expect(readQueue(queuePath).jobs[0]!.status).toBe("queued");
  });

  test("clearQueue removes completed and failed jobs and keeps active ones", () => {
    const j1 = enqueueJob(queuePath, { input: "1.mp4", output: "1.opt.mp4" });
    const j2 = enqueueJob(queuePath, { input: "2.mp4", output: "2.opt.mp4" });
    const j3 = enqueueJob(queuePath, { input: "3.mp4", output: "3.opt.mp4" });
    const j4 = enqueueJob(queuePath, { input: "4.mp4", output: "4.opt.mp4" });

    updateJob(queuePath, j1.id, { status: "completed" });
    updateJob(queuePath, j2.id, { status: "processing" });
    updateJob(queuePath, j3.id, { status: "failed" });
    // j4 is queued

    clearQueue(queuePath);
    const remaining = readQueue(queuePath).jobs;
    expect(remaining.map((j) => j.id)).toEqual([j2.id, j4.id]);
  });
});

describe("processQueue", () => {
  const fakeRunner = (exitCode = 0, stderr = ""): ProcessRunner => ({
    which: () => "/usr/bin/ffmpeg",
    run: (): RunResult => ({ exitCode, stdout: "", stderr }),
    spawnDetached: () => 10,
    isAlive: () => true,
    isRunning: () => true,
    kill: () => {},
    sleep: async () => {},
  });

  test("processes queued jobs successfully and marks completed", async () => {
    const j1 = enqueueJob(queuePath, { input: "in1.mp4", output: "out1.mp4", resolution: "720p" });
    const logs: string[] = [];
    const notified: string[] = [];

    const count = await processQueue({
      queuePath,
      runner: fakeRunner(0),
      statBytes: () => 2048,
      log: (msg) => logs.push(msg),
      notify: (file) => notified.push(file),
      sleepMs: 1,
    });

    expect(count).toBe(1);
    const updated = readQueue(queuePath).jobs[0]!;
    expect(updated.status).toBe("completed");
    expect(updated.outputBytes).toBe(2048);
    expect(notified).toEqual(["out1.mp4"]);
    expect(logs.some((l) => l.includes("completed"))).toBe(true);
  });

  test("handles stat failure on successful exit code", async () => {
    enqueueJob(queuePath, { input: "in.mp4", output: "out.mp4" });
    await processQueue({
      queuePath,
      runner: fakeRunner(0),
      statBytes: () => {
        throw new Error("file missing");
      },
    });
    const updated = readQueue(queuePath).jobs[0]!;
    expect(updated.status).toBe("completed");
    expect(updated.outputBytes).toBeUndefined();
  });

  test("marks job failed when ffmpeg exits with error", async () => {
    enqueueJob(queuePath, { input: "in.mp4", output: "out.mp4" });
    const logs: string[] = [];
    const count = await processQueue({
      queuePath,
      runner: fakeRunner(1, "corrupt input stream"),
      statBytes: () => 0,
      log: (msg) => logs.push(msg),
    });

    expect(count).toBe(1);
    const updated = readQueue(queuePath).jobs[0]!;
    expect(updated.status).toBe("failed");
    expect(updated.error).toBe("corrupt input stream");
    expect(logs.some((l) => l.includes("failed"))).toBe(true);
  });

  test("marks job failed with fallback error when stderr is empty", async () => {
    enqueueJob(queuePath, { input: "in.mp4", output: "out.mp4" });
    await processQueue({
      queuePath,
      runner: fakeRunner(2, ""),
      statBytes: () => 0,
    });
    const updated = readQueue(queuePath).jobs[0]!;
    expect(updated.status).toBe("failed");
    expect(updated.error).toBe("ffmpeg exit 2");
  });

  test("stops when shouldStop returns true", async () => {
    enqueueJob(queuePath, { input: "in1.mp4", output: "out1.mp4" });
    enqueueJob(queuePath, { input: "in2.mp4", output: "out2.mp4" });

    let stopped = false;
    const count = await processQueue({
      queuePath,
      runner: fakeRunner(0),
      statBytes: () => 100,
      shouldStop: () => {
        const val = stopped;
        stopped = true;
        return val;
      },
    });

    expect(count).toBe(1);
    expect(readQueue(queuePath).jobs[1]!.status).toBe("queued");
  });
});
