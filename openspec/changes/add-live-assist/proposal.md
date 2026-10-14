## Why

During an interview or meeting the user wants help while it happens, not after `stop`: a realtime transcript of both sides, a place for manual notes, and Hermes suggesting questions and missed points as the conversation goes.

## What Changes

- `--live` now produces a two-sided realtime transcript in `<base>.live.txt` (`[mm:ss] me: ...` from the mic, `[mm:ss] them: ...` from system audio). The mic-only `whisper-stream` path is replaced.
- New plugin `live` (`src/plugins/live.ts`): spawns a mic segmenter (ffmpeg), a system-audio segmenter (new `native/livesys.swift`, no edits to `sysaudio.swift`) and a transcription worker, all registered with `ctx.addSidecar`.
- New command `localscribe live`: terminal UI with captions, Hermes suggestions and a manual-note input line. `start --live` prints the hint to run it in another pane.
- Manual notes go to `<base>.manual.md`; suggestions to `<base>.suggestions.md`.
- Final notes (`--notes`) include the manual notes.

## Capabilities

### New Capabilities
- `live-assist`: realtime two-sided transcript, manual notes, rolling Hermes suggestions.

### Modified Capabilities
- `transcription`: live captions are now two-sided and labeled, produced by `live-assist`.

## Impact

- New files under `src/live/`, `src/plugins/live.ts`, `src/commands/live.ts`, `native/livesys.swift`.
- Touched: plugin registry (one line), `transcription` plugin (drops whisper-stream), notes prompt/generate (manual notes), `start` hint, command table.
- Hermes receives the last ~5 minutes of transcript and manual notes every ~60s of new speech (may reach a cloud model; stated at `live` startup).
