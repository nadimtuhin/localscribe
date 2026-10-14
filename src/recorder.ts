import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildArgs, buildMuxArgs, parseMicrophones, parseScreens } from "./ffmpeg.ts";
import { defaultRecordingsDir, stateFilePath, timestampedFilename, withMp4Extension } from "./paths.ts";
import { clearState, isAlive, isRunning, readState, writeState, type RecordingState } from "./state.ts";

const STOP_TIMEOUT_MS = 10_000;
const STARTUP_CHECK_MS = 1_500;
const PROJECT_ROOT = join(import.meta.dir, "..");
const HELPER_SOURCE = join(PROJECT_ROOT, "native", "sysaudio.swift");
const HELPER_BINARY = join(PROJECT_ROOT, "bin", "sysaudio");

export class RecorderError extends Error {}

export function activeRecording(statePath = stateFilePath()): RecordingState | null {
  const state = readState(statePath);
  if (state && !isRunning(state.pid, "ffmpeg")) {
    if (state.systemAudio && isRunning(state.systemAudio.pid, "sysaudio")) process.kill(state.systemAudio.pid, "SIGINT");
    clearState(statePath);
    return null;
  }
  return state;
}

function listDevices() {
  const probe = Bun.spawnSync(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]);
  const output = probe.stderr.toString();
  return { screens: parseScreens(output), microphones: parseMicrophones(output) };
}

// The helper is compiled on first use so the repo ships source only.
function ensureSystemAudioHelper(): string {
  const isFresh = existsSync(HELPER_BINARY) && statSync(HELPER_BINARY).mtimeMs >= statSync(HELPER_SOURCE).mtimeMs;
  if (isFresh) return HELPER_BINARY;
  if (!Bun.which("swiftc")) throw new RecorderError("swiftc not found. Install Xcode command line tools: xcode-select --install");
  mkdirSync(dirname(HELPER_BINARY), { recursive: true });
  const build = Bun.spawnSync(["swiftc", "-O", HELPER_SOURCE, "-o", HELPER_BINARY]);
  if (build.exitCode !== 0) throw new RecorderError(`building system-audio helper failed:\n${build.stderr.toString()}`);
  return HELPER_BINARY;
}

function spawnDetached(command: string[], logFile: string) {
  const child = Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: Bun.file(logFile), detached: true });
  child.unref();
  return child.pid;
}

const readLog = async (logFile: string) => (await Bun.file(logFile).text()).trim();

export interface StartOptions {
  out?: string;
  screen?: number;
  fps?: number;
  mic?: number | false; // device index, or false to skip
  systemAudio?: boolean;
}

export async function start(opts: StartOptions = {}): Promise<RecordingState> {
  if (!Bun.which("ffmpeg")) throw new RecorderError("ffmpeg not found. Install it: brew install ffmpeg");

  const statePath = stateFilePath();
  const existing = activeRecording(statePath);
  if (existing) throw new RecorderError(`already recording: ${existing.file}`);

  const { screens, microphones } = listDevices();
  const screenIndex = opts.screen ?? 0;
  const screen = screens[screenIndex];
  if (!screen) throw new RecorderError(`screen ${screenIndex} not found (found ${screens.length})`);

  let micDevice: number | undefined;
  if (opts.mic !== false) {
    const wanted = opts.mic ?? 0;
    const mic = microphones.find((m) => m.device === wanted);
    if (!mic) throw new RecorderError(`microphone ${wanted} not found. Available: ${microphones.map((m) => `${m.device}=${m.name}`).join(", ")}`);
    micDevice = mic.device;
  }

  const file = withMp4Extension(resolve(opts.out ?? join(defaultRecordingsDir(), timestampedFilename(new Date()))));
  const recordsSystemAudio = opts.systemAudio !== false;
  const partsBase = file.replace(/\.mp4$/, "");
  const videoFile = recordsSystemAudio ? `${partsBase}.video.mp4` : file;
  const audioFile = `${partsBase}.system.m4a`;
  const taken = [file, videoFile, ...(recordsSystemAudio ? [audioFile] : [])].find((path) => existsSync(path));
  if (taken) throw new RecorderError(`refusing to overwrite existing file: ${taken}`);
  mkdirSync(dirname(file), { recursive: true });

  const logDir = dirname(statePath);
  mkdirSync(logDir, { recursive: true });
  const ffmpegLog = join(logDir, "ffmpeg.log");
  const helperLog = join(logDir, "sysaudio.log");

  const helper = recordsSystemAudio ? ensureSystemAudioHelper() : undefined;
  // Start both back to back so their clocks line up as closely as possible.
  const pid = spawnDetached(["ffmpeg", ...buildArgs({ screenDevice: screen.device, micDevice, fps: opts.fps ?? 30, file: videoFile })], ffmpegLog);
  const systemAudio = helper ? { pid: spawnDetached([helper, audioFile], helperLog), file: audioFile } : undefined;

  // Save state before waiting, so an interrupted `start` can still be stopped.
  const state: RecordingState = { pid, file, videoFile, videoHasMic: micDevice !== undefined, systemAudio, startedAt: new Date().toISOString() };
  writeState(statePath, state);

  // Both processes fail fast when Screen Recording / Microphone permission is missing.
  await Bun.sleep(STARTUP_CHECK_MS);
  const ffmpegDied = !isAlive(pid);
  const helperDied = systemAudio !== undefined && !isAlive(systemAudio.pid);
  if (ffmpegDied || helperDied) {
    clearState(statePath);
    if (!ffmpegDied) process.kill(pid, "SIGKILL");
    if (systemAudio && !helperDied) process.kill(systemAudio.pid, "SIGKILL");
    const log = ffmpegDied ? await readLog(ffmpegLog) : await readLog(helperLog);
    throw new RecorderError(
      `${ffmpegDied ? "ffmpeg" : "system-audio helper"} exited on startup. ` +
        `Check Screen Recording and Microphone access for your terminal in System Settings > Privacy & Security.\n${log}`,
    );
  }
  return state;
}

async function interrupt(pid: number): Promise<{ forced: boolean }> {
  if (!isAlive(pid)) return { forced: false };
  process.kill(pid, "SIGINT");
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (isAlive(pid) && Date.now() < deadline) await Bun.sleep(100);
  const forced = isAlive(pid);
  if (forced) process.kill(pid, "SIGKILL");
  return { forced };
}

export interface StopResult {
  file: string;
  durationMs: number;
  bytes: number;
  forced: boolean;
  keptParts: string[]; // non-empty when mixing failed and the raw parts were left on disk
  mixError?: string;
}

export async function stop(): Promise<StopResult> {
  const statePath = stateFilePath();
  const state = activeRecording(statePath);
  if (!state) throw new RecorderError("not recording");

  const [video, audio] = await Promise.all([interrupt(state.pid), state.systemAudio ? interrupt(state.systemAudio.pid) : { forced: false }]);
  clearState(statePath);
  const durationMs = Date.now() - Date.parse(state.startedAt);
  const forced = video.forced || audio.forced;

  let keptParts: string[] = [];
  let mixError: string | undefined;
  if (state.systemAudio) {
    // The helper writes nothing if no system sound played; then the video part is already final.
    const hasSystemAudio = existsSync(state.systemAudio.file) && statSync(state.systemAudio.file).size > 0;
    if (!existsSync(state.videoFile)) {
      keptParts = [state.systemAudio.file].filter((path) => existsSync(path));
      mixError = `video part missing: ${state.videoFile}`;
    } else if (!hasSystemAudio) {
      renameSync(state.videoFile, state.file);
      rmSync(state.systemAudio.file, { force: true });
    } else {
      const muxArgs = buildMuxArgs({ video: state.videoFile, videoHasMic: state.videoHasMic, systemAudio: state.systemAudio.file, out: state.file });
      const mux = Bun.spawnSync(["ffmpeg", ...muxArgs]);
      if (mux.exitCode === 0) {
        rmSync(state.videoFile, { force: true });
        rmSync(state.systemAudio.file, { force: true });
      } else {
        keptParts = [state.videoFile, state.systemAudio.file];
        mixError = mux.stderr.toString().trim();
      }
    }
  }

  return { file: state.file, durationMs, bytes: Bun.file(state.file).size, forced, keptParts, mixError };
}

export interface RecordingFile { name: string; path: string; bytes: number; modified: Date }

export function list(dir = defaultRecordingsDir()): RecordingFile[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(".mp4") && !name.endsWith(".video.mp4"))
    .map((name) => {
      const path = join(dir, name);
      const info = statSync(path);
      return { name, path, bytes: info.size, modified: info.mtime };
    })
    .sort((a, b) => b.modified.getTime() - a.modified.getTime());
}
