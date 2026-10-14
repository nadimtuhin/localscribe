import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PluginOptions } from "./plugins/types.ts";

export interface RecordingState {
  pid: number; // ffmpeg (screen + mic)
  file: string; // final output path
  videoFile: string; // ffmpeg's output; equals `file` when there is nothing to mix
  videoHasMic: boolean;
  systemAudio?: { pid: number; file: string };
  startedAt: string;
  pluginOptions?: PluginOptions; // flags from `start`, so a separate `stop` process knows what ran
  plugins?: Record<string, unknown>; // each plugin's start() result, keyed by plugin name
}

export function readState(path: string): RecordingState | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RecordingState;
  } catch {
    return null;
  }
}

export function writeState(path: string, state: RecordingState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function clearState(path: string): void {
  rmSync(path, { force: true });
}

// A pid alone can be reused after a reboot or crash; also check the executable name
// so we never signal an unrelated process.
export function isRunning(pid: number, executableName: string): boolean {
  if (!isAlive(pid)) return false;
  const ps = Bun.spawnSync(["ps", "-o", "comm=", "-p", String(pid)]);
  return ps.stdout.toString().trim().endsWith(executableName);
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
