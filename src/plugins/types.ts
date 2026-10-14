// Contract for recording add-ons. See openspec/changes/add-recording-plugins/design.md.

export interface PluginOptions {
  transcribe?: boolean; // --transcribe
  liveCaptions?: boolean; // --live
  notes?: boolean; // --notes
}

export interface PluginContext {
  base: string; // "/x/2026-10-14_22-05-29"; the final file is `${base}.mp4`
  options: PluginOptions;
  log: (line: string) => void;
}

export interface StartedContext extends PluginContext {
  micDevice?: number; // avfoundation audio index chosen by the recorder
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
  stop?(ctx: StoppedContext): Promise<void>;
}
