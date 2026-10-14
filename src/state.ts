import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Selection } from "./capture/selection.ts";
import type { PluginOptions } from "./plugins/types.ts";

// `drain`: stopped after every other process, with a longer timeout, because it flushes their output.
export interface Sidecar { pid: number; exe: string; drain?: boolean }

export interface RecordingState {
  pid: number; // ffmpeg (screen + mic), or the capture helper when engine is "sck"
  exe?: string; // executable name of `pid`; "ffmpeg" when absent
  engine?: "sck" | "ffmpeg"; // "ffmpeg" when absent
  selection?: Selection; // what was chosen with --window/--area/--display (sck engine)
  file: string; // final output path
  videoFile: string; // video part; equals `file` when there is nothing to mix
  videoHasMic: boolean;
  systemAudio?: { pid: number; file: string }; // ffmpeg engine: separate sysaudio process
  systemAudioFile?: string; // sck engine: written by the capture helper itself
  mic?: { pid: number; file: string }; // sck engine: audio-only ffmpeg
  startedAt: string;
  pluginOptions?: PluginOptions; // flags from `start`, so a separate `stop` process knows what ran
  plugins?: Record<string, unknown>; // each plugin's start() result, keyed by plugin name
  sidecars?: Sidecar[]; // detached processes plugins registered via addSidecar
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
  // Rename is atomic, so a concurrent reader sees the old state or the new one, never half of it.
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2));
  renameSync(temp, path);
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
