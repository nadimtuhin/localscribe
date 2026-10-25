import { existsSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export const defaultRecordingsDir = (home = homedir()) => join(home, "Movies", "localscribe");
export const stateFilePath = (home = homedir()) => join(home, ".localscribe", "state.json");
export const optimizeQueuePath = (home = homedir()) => join(home, ".localscribe", "optimize-queue.json");
export const optimizeLogPath = (home = homedir()) => join(home, ".localscribe", "optimize-worker.log");

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

// 2026-10-14T19:30:05 -> "2026-10-14_19-30-05.mp4" (local time)
export function timestampedFilename(date: Date, name?: string, ext: "mp4" | "m4a" = "mp4"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  const slug = name ? slugify(name) : "";
  return slug ? `${day}_${time}_${slug}.${ext}` : `${day}_${time}.${ext}`;
}

// Output is always mp4, so "demo" or "demo.mov" become "demo.mp4".
export function withMp4Extension(path: string): string {
  return path.replace(/\.[^./]+$/, "") + ".mp4";
}

export function withAudioExtension(path: string): string {
  if (path.endsWith(".mp4") || path.endsWith(".m4a")) return path;
  return path.replace(/\.[^./]+$/, "") + ".m4a";
}

export function withRecordingExtension(path: string, audioOnly = false): string {
  return audioOnly ? withAudioExtension(path) : withMp4Extension(path);
}

export function uniqueBase(base: string, slug: string, isExplicit = false, exists: (path: string) => boolean = existsSync): string {
  const name = basename(base);
  if (name.endsWith(`_${slug}`)) return base;
  if (!isExplicit && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_.+/.test(name)) return base;
  const dir = dirname(base);
  const target = `${name}_${slug}`;
  let candidate = target;
  let counter = 1;
  while (exists(join(dir, `${candidate}.mp4`)) || exists(join(dir, `${candidate}.m4a`))) {
    candidate = `${target}-${counter++}`;
  }
  return join(dir, candidate);
}

export function renameRecordingFiles(
  oldBase: string,
  newBase: string,
  exists: (path: string) => boolean = existsSync,
  rename: (from: string, to: string) => void = renameSync,
): string[] {
  if (oldBase === newBase) return [];
  const renamed: string[] = [];
  const extensions = [".mp4", ".m4a", ".transcript.md", ".notes.md", ".live.txt", ".manual.md"];
  for (const ext of extensions) {
    const oldPath = `${oldBase}${ext}`;
    const newPath = `${newBase}${ext}`;
    if (exists(oldPath)) {
      rename(oldPath, newPath);
      renamed.push(newPath);
    }
  }
  return renamed;
}
