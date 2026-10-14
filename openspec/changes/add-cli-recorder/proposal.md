## Why

We want a dead-simple local screen recorder we own: start and stop from the terminal, files land on disk, nothing leaves the machine. Owning the core lets us bolt on features later (audio, transcription, clipping) without fighting a GUI app.

## What Changes

- New Bun CLI `localscribe` with `start`, `stop`, `status`, `list`.
- Recording is done by `ffmpeg` (avfoundation on macOS), spawned detached so the terminal is free.
- Session state (pid, output path, start time) lives in a state file so `stop` works from any shell.
- Recordings saved to `~/Movies/localscribe/<timestamp>.mp4` by default (`--out` to override).

## Capabilities

### New Capabilities
- `recorder`: start/stop/status/list of local screen recordings via CLI.

### Modified Capabilities
None.

## Impact

- New project: `package.json`, `src/`, `bin` entry.
- Runtime deps: Bun, system `ffmpeg`. No npm deps for v1.
- macOS only for v1 (needs Screen Recording permission for the terminal).
