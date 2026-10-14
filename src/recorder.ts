import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { buildArgs, buildMicArgs, buildMuxArgs, buildSckMuxArgs, parseMicrophones, parseScreens } from "./ffmpeg.ts";
import { captureArgs, type Selection } from "./capture/selection.ts";
import { defaultRecordingsDir, stateFilePath, timestampedFilename, withMp4Extension } from "./paths.ts";
import { clearState, readState, writeState, type RecordingState, type Sidecar } from "./state.ts";
import { plugins as defaultPlugins, runStartHooks, runStopHooks } from "./plugins/index.ts";
import type { PluginOptions, RecorderPlugin } from "./plugins/types.ts";
import { realRunner, type ProcessRunner } from "./runner.ts";

const STOP_TIMEOUT_MS = 10_000;
const DRAIN_TIMEOUT_MS = 30_000;
const STARTUP_CHECK_MS = 1_500;
const PROJECT_ROOT = join(import.meta.dir, "..");
const SYSAUDIO = { source: join(PROJECT_ROOT, "native", "sysaudio.swift"), binary: join(PROJECT_ROOT, "bin", "sysaudio") };
export const CAPTURE = { source: join(PROJECT_ROOT, "native", "capture.swift"), binary: join(PROJECT_ROOT, "bin", "localscribe-capture") };

export class RecorderError extends Error {}

// Everything start/stop touch outside their own logic; tests replace these.
export interface RecorderDeps {
  plugins: RecorderPlugin[];
  runner: ProcessRunner;
  statePath: string;
}

const withDefaults = (deps: Partial<RecorderDeps>): RecorderDeps => ({
  plugins: deps.plugins ?? defaultPlugins,
  runner: deps.runner ?? realRunner,
  statePath: deps.statePath ?? stateFilePath(),
});

export function activeRecording(statePath = stateFilePath(), runner: ProcessRunner = realRunner): RecordingState | null {
  const state = readState(statePath);
  if (state && !runner.isRunning(state.pid, state.exe ?? "ffmpeg")) {
    if (state.mic && runner.isRunning(state.mic.pid, "ffmpeg")) runner.kill(state.mic.pid, "SIGINT");
    if (state.systemAudio && runner.isRunning(state.systemAudio.pid, "sysaudio")) runner.kill(state.systemAudio.pid, "SIGINT");
    for (const { pid, exe } of state.sidecars ?? []) if (runner.isRunning(pid, exe)) runner.kill(pid, "SIGINT");
    clearState(statePath);
    return null;
  }
  return state;
}

function listDevices(runner: ProcessRunner) {
  const probe = runner.run(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]);
  return { screens: parseScreens(probe.stderr), microphones: parseMicrophones(probe.stderr) };
}

// Helpers are compiled on first use, and again when their source changes, so the repo ships source only.
export function ensureHelper(runner: ProcessRunner, { source, binary }: { source: string; binary: string }): string {
  const isFresh = existsSync(binary) && statSync(binary).mtimeMs >= statSync(source).mtimeMs;
  if (isFresh) return binary;
  if (!runner.which("swiftc")) throw new RecorderError("swiftc not found. Install Xcode command line tools: xcode-select --install");
  mkdirSync(dirname(binary), { recursive: true });
  const build = runner.run(["swiftc", "-O", source, "-o", binary]);
  if (build.exitCode !== 0) throw new RecorderError(`building ${basename(binary)} failed:\n${build.stderr}`);
  return binary;
}

const readLog = async (logFile: string) => (await Bun.file(logFile).text()).trim();

export interface StartOptions {
  out?: string;
  screen?: number;
  fps?: number;
  mic?: number | false; // device index, or false to skip
  systemAudio?: boolean;
  plugins?: PluginOptions;
  selection?: Selection; // window / area / display to capture; implies engine "sck"
  engine?: "sck" | "ffmpeg"; // default: "sck" when a selection is given, else "ffmpeg" until the parity smoke passes
}

const printLine = (line: string) => console.log(line);

export async function start(opts: StartOptions = {}, injected: Partial<RecorderDeps> = {}): Promise<RecordingState> {
  const { plugins, runner, statePath } = withDefaults(injected);
  if (!runner.which("ffmpeg")) throw new RecorderError("ffmpeg not found. Install it: brew install ffmpeg");

  const existing = activeRecording(statePath, runner);
  if (existing) throw new RecorderError(`already recording: ${existing.file}`);

  const engine = opts.engine ?? (opts.selection ? "sck" : "ffmpeg");
  if (engine === "ffmpeg" && opts.selection) throw new RecorderError("--window, --area and --display need --engine sck");

  const { screens, microphones } = listDevices(runner);
  const screenIndex = opts.screen ?? 0;
  const screen = screens[screenIndex];
  if (engine === "ffmpeg" && !screen) throw new RecorderError(`screen ${screenIndex} not found (found ${screens.length})`);

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
  const videoFile = recordsSystemAudio || engine === "sck" ? `${partsBase}.video.mp4` : file;
  const audioFile = `${partsBase}.system.m4a`;
  const micFile = `${partsBase}.mic.m4a`;
  const taken = [file, videoFile, audioFile, micFile].find((path) => existsSync(path));
  if (taken) throw new RecorderError(`refusing to overwrite existing file: ${taken}`);
  mkdirSync(dirname(file), { recursive: true });

  const logDir = dirname(statePath);
  mkdirSync(logDir, { recursive: true });
  const ffmpegLog = join(logDir, "ffmpeg.log");
  const helperLog = join(logDir, "sysaudio.log");
  const captureLog = join(logDir, "capture.log");
  const fps = opts.fps ?? 30;

  // Every spawned process, so the startup check and cleanup treat both engines alike.
  const processes: { pid: number; label: string; log: string }[] = [];
  let engineState: Pick<RecordingState, "pid" | "exe" | "engine" | "selection" | "videoHasMic" | "systemAudio" | "systemAudioFile" | "mic">;
  if (engine === "sck") {
    const capture = ensureHelper(runner, CAPTURE);
    const captureArguments = captureArgs(opts.selection, { out: videoFile, systemAudio: recordsSystemAudio ? audioFile : undefined, fps });
    // Helper first: its clock anchor is taken after process start, the mic's after ffmpeg init.
    const pid = runner.spawnDetached([capture, ...captureArguments], captureLog);
    processes.push({ pid, label: "capture helper", log: captureLog });
    const mic = micDevice === undefined ? undefined : { pid: runner.spawnDetached(["ffmpeg", ...buildMicArgs({ micDevice, file: micFile })], ffmpegLog), file: micFile };
    if (mic) processes.push({ pid: mic.pid, label: "ffmpeg", log: ffmpegLog });
    engineState = { pid, exe: basename(capture), engine, selection: opts.selection, videoHasMic: false, systemAudioFile: recordsSystemAudio ? audioFile : undefined, mic };
  } else {
    const helper = recordsSystemAudio ? ensureHelper(runner, SYSAUDIO) : undefined;
    // Start both back to back so their clocks line up as closely as possible.
    const pid = runner.spawnDetached(["ffmpeg", ...buildArgs({ screenDevice: screen!.device, micDevice, fps, file: videoFile })], ffmpegLog);
    processes.push({ pid, label: "ffmpeg", log: ffmpegLog });
    const systemAudio = helper ? { pid: runner.spawnDetached([helper, audioFile], helperLog), file: audioFile } : undefined;
    if (systemAudio) processes.push({ pid: systemAudio.pid, label: "system-audio helper", log: helperLog });
    engineState = { pid, videoHasMic: micDevice !== undefined, systemAudio };
  }

  // Save state before waiting, so an interrupted `start` can still be stopped.
  const pluginOptions = opts.plugins ?? {};
  const state: RecordingState = { ...engineState, file, videoFile, startedAt: new Date().toISOString(), pluginOptions };
  writeState(statePath, state);

  // Processes fail fast when Screen Recording / Microphone permission is missing.
  await runner.sleep(STARTUP_CHECK_MS);
  const died = processes.find((process) => !runner.isAlive(process.pid));
  if (died) {
    clearState(statePath);
    for (const process of processes) if (process !== died && runner.isAlive(process.pid)) runner.kill(process.pid, "SIGKILL");
    throw new RecorderError(
      `${died.label} exited on startup. ` +
        `Check Screen Recording and Microphone access for your terminal in System Settings > Privacy & Security.\n${await readLog(died.log)}`,
    );
  }

  const sidecars: Sidecar[] = [];
  const addSidecar = (pid: number, exe: string, options?: { drain?: boolean }) => {
    sidecars.push(options?.drain ? { pid, exe, drain: true } : { pid, exe });
    const latest = readState(statePath);
    if (latest) writeState(statePath, { ...latest, sidecars });
  };
  const pluginStates = await runStartHooks(plugins, { base: partsBase, options: pluginOptions, micDevice, log: printLine, addSidecar });
  // A `stop` during slow plugin startup clears the state; don't resurrect it.
  const current = readState(statePath);
  if (!current) {
    await interruptSidecars(runner, sidecars);
    throw new RecorderError("recording was stopped while plugins were starting");
  }
  const withPlugins: RecordingState = { ...current, plugins: pluginStates, sidecars };
  writeState(statePath, withPlugins);
  return withPlugins;
}

// With an executable name the pid is verified first, so a reused pid is never signalled.
async function interrupt(runner: ProcessRunner, pid: number, exe?: string, timeoutMs = STOP_TIMEOUT_MS): Promise<{ forced: boolean }> {
  const alive = () => (exe === undefined ? runner.isAlive(pid) : runner.isRunning(pid, exe));
  if (!alive()) return { forced: false };
  runner.kill(pid, "SIGINT");
  const deadline = Date.now() + timeoutMs;
  while (alive() && Date.now() < deadline) await runner.sleep(100);
  const forced = alive();
  if (forced) runner.kill(pid, "SIGKILL");
  return { forced };
}

// Draining sidecars go last so they can finish what the others were still writing.
async function interruptSidecars(runner: ProcessRunner, sidecars: Sidecar[]) {
  await Promise.all(sidecars.filter((s) => !s.drain).map(({ pid, exe }) => interrupt(runner, pid, exe)));
  await Promise.all(sidecars.filter((s) => s.drain).map(({ pid, exe }) => interrupt(runner, pid, exe, DRAIN_TIMEOUT_MS)));
}

export interface StopResult {
  file: string;
  durationMs: number;
  bytes: number;
  forced: boolean;
  keptParts: string[]; // non-empty when mixing failed and the raw parts were left on disk
  mixError?: string;
}

const hasContent = (path: string) => existsSync(path) && statSync(path).size > 0;

// SCK engine: video-only part plus whichever audio parts actually recorded something.
function mixSckParts(runner: ProcessRunner, state: RecordingState): { keptParts: string[]; mixError?: string } {
  const audioParts = [state.systemAudioFile, state.mic?.file].filter((path): path is string => path !== undefined);
  const recordedAudio = audioParts.filter(hasContent);
  if (!hasContent(state.videoFile)) {
    return { keptParts: recordedAudio, mixError: `video part missing: ${state.videoFile}` };
  }
  if (recordedAudio.length === 0) {
    renameSync(state.videoFile, state.file);
    for (const path of audioParts) rmSync(path, { force: true });
    return { keptParts: [] };
  }
  const mux = runner.run(["ffmpeg", ...buildSckMuxArgs({ video: state.videoFile, audio: recordedAudio, out: state.file })]);
  if (mux.exitCode !== 0) return { keptParts: [state.videoFile, ...recordedAudio], mixError: mux.stderr.trim() };
  for (const path of [state.videoFile, ...audioParts]) rmSync(path, { force: true });
  return { keptParts: [] };
}

export async function stop(injected: Partial<RecorderDeps> = {}): Promise<StopResult> {
  const { plugins, runner, statePath } = withDefaults(injected);
  const state = activeRecording(statePath, runner);
  if (!state) throw new RecorderError("not recording");

  const [video, audio, mic] = await Promise.all([
    interrupt(runner, state.pid),
    state.systemAudio ? interrupt(runner, state.systemAudio.pid) : { forced: false },
    state.mic ? interrupt(runner, state.mic.pid) : { forced: false },
    interruptSidecars(runner, state.sidecars ?? []),
  ]);
  clearState(statePath);
  const durationMs = Date.now() - Date.parse(state.startedAt);
  const forced = video.forced || audio.forced || mic.forced;

  let keptParts: string[] = [];
  let mixError: string | undefined;
  if (state.engine === "sck") {
    ({ keptParts, mixError } = mixSckParts(runner, state));
  } else if (state.systemAudio) {
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
      const mux = runner.run(["ffmpeg", ...muxArgs]);
      if (mux.exitCode === 0) {
        rmSync(state.videoFile, { force: true });
        rmSync(state.systemAudio.file, { force: true });
      } else {
        keptParts = [state.videoFile, state.systemAudio.file];
        mixError = mux.stderr.trim();
      }
    }
  }

  if (!mixError && existsSync(state.file)) {
    await runStopHooks(plugins, {
      base: state.file.replace(/\.mp4$/, ""),
      options: state.pluginOptions ?? {},
      file: state.file,
      startedAt: state.startedAt,
      durationMs,
      pluginStates: state.plugins ?? {},
      log: printLine,
    });
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
