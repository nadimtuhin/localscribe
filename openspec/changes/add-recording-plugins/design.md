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
  addSidecar(pid: number, executableName: string): void; // register a detached process
}

export interface StoppedContext extends PluginContext {
  file: string;            // final mp4, exists and is finalized
  startedAt: string;       // ISO time the recording began
  durationMs: number;      // wall-clock length of the recording
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
3. **Detached sidecars:** a plugin that spawns a long-running process spawns it detached and registers it with `ctx.addSidecar(pid, executableName)` (chosen over returning sidecars from `start`: the pid is persisted the moment it exists, even if `start` later throws or the process is interrupted). The recorder owns the lifecycle: `stop` sends SIGINT (SIGKILL after 10s) to every sidecar before running stop hooks, always, including when mixing fails; stale-state cleanup in `activeRecording` also interrupts them. Each pid is checked with `isRunning(pid, executableName)` first, so a reused pid is never signalled. Plugins must not kill their own sidecars. State field: `RecordingState.sidecars?: { pid: number; exe: string }[]`.
4. **Sidecar files** (fixed names, other changes rely on them):
   - `<base>.live.txt`: live captions (append-only, plain text)
   - `<base>.transcript.md`: final transcript, Markdown, one `[mm:ss] text` line per segment
   - `<base>.notes.md`: Hermes notes
5. **State:** `RecordingState.plugins?: Record<string, unknown>`, written by the recorder right after start hooks finish. That second write re-reads the state file first; if a concurrent `stop` cleared it, the recorder interrupts the sidecars and throws instead of resurrecting the recording.
6. **Options persist:** `PluginOptions` are saved in the first state write (before start hooks run) so `stop` (a different process) knows what was enabled.
8. **Testability:** `start(opts, deps)` and `stop(deps)` accept `{ plugins, runner, statePath }` (defaults: real registry, `realRunner`, `~/.localscribe/state.json`). `ProcessRunner` (`src/runner.ts`) wraps which/run/spawnDetached/isAlive/isRunning/kill/sleep.
7. **`list`** ignores sidecar files (only `<base>.mp4` that are not parts).

## Non-goals

Dynamic plugin loading, third-party plugins, config files.
