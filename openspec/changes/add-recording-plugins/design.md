## Contract

```ts
// src/plugins/types.ts
export interface PluginContext {
  base: string;            // "/x/2026-10-14_22-05-29"  (final file is `${base}.mp4`)
  options: PluginOptions;  // parsed CLI flags
  log: (line: string) => void; // user-facing output (stdout)
}

export interface StartedContext extends PluginContext {
  micDevice?: number;      // avfoundation audio index chosen by the recorder
}

export interface StoppedContext extends PluginContext {
  file: string;            // final mp4, exists and is finalized
  pluginState: unknown;    // whatever this plugin returned from start()
}

export interface RecorderPlugin {
  name: string;                                   // key in state.plugins
  enabled(options: PluginOptions): boolean;
  start?(ctx: StartedContext): Promise<unknown>;  // returned value is persisted
  stop?(ctx: StoppedContext): Promise<void>;
}

export interface PluginOptions {
  transcribe?: boolean;      // --transcribe   (add-transcription)
  liveCaptions?: boolean;    // --live         (add-transcription)
  notes?: boolean;           // --notes        (add-hermes-notes)
}
```

## Rules

1. **Order:** registry order in `src/plugins/index.ts` is `[transcription, notes]`. `stop` hooks run sequentially so notes can read the transcript.
2. **Failure isolation:** a plugin throwing in `start` or `stop` is logged as `<name>: <message>` and never fails the recording or deletes the mp4. `stop` exit code stays 0.
3. **Detached sidecars:** a plugin that spawns a long-running process must spawn it detached and return its pid from `start`; it stops it itself in `stop` (SIGINT, ≤10s, SIGKILL).
4. **Sidecar files** (fixed names, other changes rely on them):
   - `<base>.live.txt`: live captions (append-only, plain text)
   - `<base>.transcript.md`: final transcript, Markdown, one `[mm:ss] text` line per segment
   - `<base>.notes.md`: Hermes notes
5. **State:** `RecordingState.plugins?: Record<string, unknown>`, written by the recorder right after start hooks finish.
6. **Options persist:** `PluginOptions` are saved in state so `stop` (a different process) knows what was enabled.
7. **`list`** ignores sidecar files (only `<base>.mp4` that are not parts).

## Non-goals

Dynamic plugin loading, third-party plugins, config files.
