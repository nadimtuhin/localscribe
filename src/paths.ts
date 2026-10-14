import { homedir } from "node:os";
import { join } from "node:path";

export const defaultRecordingsDir = (home = homedir()) => join(home, "Movies", "localscribe");
export const stateFilePath = (home = homedir()) => join(home, ".localscribe", "state.json");

// 2026-10-14T19:30:05 -> "2026-10-14_19-30-05.mp4" (local time)
export function timestampedFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${day}_${time}.mp4`;
}

// Output is always mp4, so "demo" or "demo.mov" become "demo.mp4".
export function withMp4Extension(path: string): string {
  return path.replace(/\.[^./]+$/, "") + ".mp4";
}
