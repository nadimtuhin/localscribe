## 1. Scaffold

- [x] 1.1 `bun init`, set `bin: { localscribe: "src/cli.ts" }`, tsconfig strict
- [x] 1.2 Check `ffmpeg` on PATH at startup; clear error if missing

## 2. Pure core (TDD with `bun test`)

- [x] 2.1 `paths.ts`: default dir + timestamped filename
- [x] 2.2 `ffmpeg.ts`: `buildArgs(opts)` for avfoundation + x264 + fragmented mp4
- [x] 2.3 Parse avfoundation device list → screen indices

## 3. Lifecycle

- [x] 3.1 `state.ts`: read/write/clear `~/.localscribe/state.json`, pid liveness check
- [x] 3.2 `recorder.start`: spawn detached, write state, detect early ffmpeg failure (permission)
- [x] 3.3 `recorder.stop`: SIGINT, wait ≤10s, SIGKILL fallback, clear state
- [x] 3.4 `recorder.status` + `list`

## 4. CLI

- [x] 4.1 `cli.ts`: `start [--out] [--screen] [--fps]`, `stop`, `status`, `list`, `--help`
- [x] 4.2 `bun link` and manual smoke: start → 5s → stop → file plays in QuickTime

## 5. Later (not v1)

- [ ] 5.1 Region capture, post-stop hooks (transcribe, thumbnail)

## 6. Audio

- [x] 6.1 Swift ScreenCaptureKit system-audio helper, auto-built on first use
- [x] 6.2 Mic device parsing + ffmpeg mic input
- [x] 6.3 Pure `buildMuxArgs` + tests; mix on stop, keep parts on failure
- [x] 6.4 `--no-mic`, `--no-system-audio`, `--mic N` flags; smoke test
