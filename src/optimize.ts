import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ProcessRunner } from "./runner.ts";

export class OptimizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptimizeError";
  }
}

export interface Resolution {
  width?: number;
  height?: number;
}

const PRESET_HEIGHTS: Record<string, number> = {
  "360p": 360,
  "480p": 480,
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
  "2k": 1440,
  "4k": 2160,
  "2160p": 2160,
};

export function parseResolution(res: string): Resolution {
  const norm = res.toLowerCase().trim();
  if (PRESET_HEIGHTS[norm]) return { height: PRESET_HEIGHTS[norm] };
  const hMatch = /^(\d+)p?$/.exec(norm);
  if (hMatch) {
    const h = Number(hMatch[1]);
    if (h > 0) return { height: h };
  }
  const dimMatch = /^(\d+)[x:](\d+)$/.exec(norm);
  if (dimMatch) {
    const w = Number(dimMatch[1]);
    const h = Number(dimMatch[2]);
    if (w > 0 && h > 0) return { width: w, height: h };
  }
  throw new OptimizeError(`invalid resolution "${res}". Expected e.g. 720p, 1080p, 1440p, 4k, or 1920x1080`);
}

export function buildScaleFilter(resolution?: string): string | undefined {
  if (!resolution) return undefined;
  const parsed = parseResolution(resolution);
  if (parsed.width && parsed.height) {
    return `scale=${parsed.width}:${parsed.height}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  }
  return `scale=-2:${parsed.height}`;
}

export interface OptimizeOptions {
  input: string;
  output: string;
  resolution?: string;
  crf?: number;
}

export function buildOptimizeArgs({ input, output, resolution, crf = 24 }: OptimizeOptions): string[] {
  const filter = buildScaleFilter(resolution);
  const filterArgs = filter ? ["-vf", filter] : [];
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    ...filterArgs,
    "-c:v",
    "libx264",
    "-crf",
    String(crf),
    "-preset",
    "fast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    output,
  ];
}

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface OptimizeJob {
  id: string;
  input: string;
  output: string;
  resolution?: string;
  crf?: number;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  inputBytes?: number;
  outputBytes?: number;
}

export interface OptimizeQueueData {
  workerPid?: number;
  jobs: OptimizeJob[];
}

export function readQueue(queuePath: string): OptimizeQueueData {
  try {
    return JSON.parse(readFileSync(queuePath, "utf8")) as OptimizeQueueData;
  } catch {
    return { jobs: [] };
  }
}

export function writeQueue(queuePath: string, data: OptimizeQueueData): void {
  mkdirSync(dirname(queuePath), { recursive: true });
  const temp = `${queuePath}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2));
  renameSync(temp, queuePath);
}

export function enqueueJob(
  queuePath: string,
  params: { input: string; output: string; resolution?: string; crf?: number; inputBytes?: number },
): OptimizeJob {
  const data = readQueue(queuePath);
  const id = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const job: OptimizeJob = {
    id,
    input: params.input,
    output: params.output,
    resolution: params.resolution,
    crf: params.crf,
    status: "queued",
    createdAt: new Date().toISOString(),
    inputBytes: params.inputBytes,
  };
  data.jobs.push(job);
  writeQueue(queuePath, data);
  return job;
}

export function updateJob(queuePath: string, id: string, patch: Partial<OptimizeJob>): void {
  const data = readQueue(queuePath);
  const job = data.jobs.find((j) => j.id === id);
  if (job) {
    Object.assign(job, patch);
    writeQueue(queuePath, data);
  }
}

export function getNextQueuedJob(queuePath: string): OptimizeJob | null {
  const data = readQueue(queuePath);
  return data.jobs.find((j) => j.status === "queued") ?? null;
}

export function recoverStaleJobs(queuePath: string): void {
  const data = readQueue(queuePath);
  let changed = false;
  for (const job of data.jobs) {
    if (job.status === "processing") {
      job.status = "queued";
      changed = true;
    }
  }
  if (changed) writeQueue(queuePath, data);
}

export function clearQueue(queuePath: string): void {
  const data = readQueue(queuePath);
  data.jobs = data.jobs.filter((j) => j.status === "queued" || j.status === "processing");
  writeQueue(queuePath, data);
}

export interface OptimizeWorkerDeps {
  queuePath: string;
  runner: ProcessRunner;
  statBytes: (path: string) => number;
  log?: (line: string) => void;
  notify?: (file: string) => void;
  shouldStop?: () => boolean;
  sleepMs?: number;
}

export async function processQueue(deps: OptimizeWorkerDeps): Promise<number> {
  let processed = 0;
  recoverStaleJobs(deps.queuePath);
  while (!deps.shouldStop?.()) {
    const job = getNextQueuedJob(deps.queuePath);
    if (!job) break;

    updateJob(deps.queuePath, job.id, {
      status: "processing",
      startedAt: new Date().toISOString(),
    });

    const args = ["ffmpeg", ...buildOptimizeArgs({
      input: job.input,
      output: job.output,
      resolution: job.resolution,
      crf: job.crf,
    })];

    deps.log?.(`optimizing ${job.input} -> ${job.output}${job.resolution ? ` (${job.resolution})` : ""}`);
    const res = deps.runner.run(args);

    if (res.exitCode === 0) {
      let outputBytes: number | undefined;
      try {
        outputBytes = deps.statBytes(job.output);
      } catch {
        // output file missing despite 0 exit code
      }

      updateJob(deps.queuePath, job.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        outputBytes,
      });

      deps.log?.(`completed ${job.id}: ${job.output}`);
      deps.notify?.(job.output);
    } else {
      updateJob(deps.queuePath, job.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        error: res.stderr.trim() || `ffmpeg exit ${res.exitCode}`,
      });
      deps.log?.(`failed ${job.id}: ${res.stderr.trim()}`);
    }

    processed++;
    if (deps.sleepMs) await deps.runner.sleep(deps.sleepMs);
  }
  return processed;
}
