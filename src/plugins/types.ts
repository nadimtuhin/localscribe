// Contract for recording add-ons. See openspec/changes/add-recording-plugins/design.md.

export interface PluginOptions {
  transcribe?: boolean; // --transcribe
  liveCaptions?: boolean; // --live
  notes?: boolean; // --notes
  systemAudio?: boolean; // false with --no-system-audio; unset means on
  draw?: boolean; // --draw
  role?: "candidate" | "interviewer" | "meeting"; // --role, set with --live
  contextFiles?: string[]; // --context paths, absolute, set with --live
  lang?: string; // --lang as a whisper code or "auto"; "en" when unset
  name?: string; // --name param; conversation name
}

export interface PluginContext {
  base: string; // "/x/2026-10-14_22-05-29"; the final file is `${base}.mp4`
  options: PluginOptions;
  log: (line: string) => void;
}

export interface StartedContext extends PluginContext {
  micDevice?: number; // avfoundation audio index chosen by the recorder
  recorderPid?: number; // the recording process; sidecars can watch it to exit when it dies
  // Register a detached process the plugin spawned. The recorder interrupts it on stop, and when
  // cleaning up a crashed recording, so a plugin never has to persist or kill pids itself.
  addSidecar(pid: number, executableName: string, options?: { drain?: boolean }): void;
}

export interface StoppedContext extends PluginContext {
  file: string; // final mp4, finalized
  startedAt: string; // ISO time the recording began
  durationMs: number; // wall-clock length of the recording
  pluginState: unknown; // whatever this plugin's start() returned
}

export interface RecorderPlugin {
  name: string;
  enabled(options: PluginOptions): boolean;
  start?(ctx: StartedContext): Promise<unknown>;
  stop?(ctx: StoppedContext): Promise<unknown>;
}
