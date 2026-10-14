## Context

Greenfield Bun project. macOS host, ffmpeg already installed via Homebrew. Goal is a tiny core with clear seams for later features.

## Goals / Non-Goals

**Goals:** one-command start/stop, crash-safe output, survives closing the terminal that started it, easy to extend.

**Non-Goals (v1):** GUI, Linux/Windows, audio, region select, editing, cloud upload.

## Decisions

1. **ffmpeg does the capture, Bun orchestrates.** Writing our own encoder is pointless; ffmpeg `-f avfoundation -i "<screen>:none"` with `libx264 -preset veryfast -pix_fmt yuv420p` gives a playable mp4. Alt considered: ScreenCaptureKit via Swift helper — better quality/perf, but a native build step. Revisit if ffmpeg capture is too heavy.
2. **Detached child + state file.** `start` spawns ffmpeg detached (`Bun.spawn` + `unref`), writes `~/.localscribe/state.json` `{pid, file, startedAt}`. `stop` reads it, sends `SIGINT` (ffmpeg finalizes the moov atom on SIGINT), waits for exit (timeout 10s, then SIGKILL + warn), deletes state.
3. **Fragmented mp4 (`-movflags +frag_keyframe+empty_moov`).** If ffmpeg is killed hard, the file stays playable.
4. **Module layout (deep core, thin CLI):**
   - `src/cli.ts` — argv parsing, printing only.
   - `src/recorder.ts` — `start(opts)`, `stop()`, `status()`; owns process + state.
   - `src/ffmpeg.ts` — pure `buildArgs(opts): string[]` (unit-testable).
   - `src/state.ts` — read/write/clear state file.
   - `src/paths.ts` — default output dir, timestamped filename (pure).
5. **Screen device discovery:** parse `ffmpeg -f avfoundation -list_devices true -i ""` for "Capture screen N"; default to first, `--screen N` override.

## Risks / Trade-offs

- Stale state after reboot/crash → `status`/`start` check pid liveness (`process.kill(pid, 0)`) and clear stale state.
- macOS Screen Recording permission missing → ffmpeg errors early; surface a clear message pointing to System Settings.
- CPU cost of x264 at full Retina res → default `-r 30`, offer `--fps` and `--scale` later.

## Extension Seams (later features)

`buildArgs` takes an options object, so audio (`--mic`), region crop, fps, and codec flags slot in without touching the lifecycle. Post-stop hook (`onStopped(file)`) is where transcription/thumbnails/clips plug in.

## Audio (added)

- **Mic:** ffmpeg avfoundation input `"<screen>:<mic>"`, AAC, same file as video.
- **System audio:** `native/sysaudio.swift` uses ScreenCaptureKit (`capturesAudio`, macOS 13+) and writes AAC `.m4a` with AVAssetWriter; SIGINT finishes the file. Built on first use with `swiftc` into `bin/sysaudio`. Alt rejected: BlackHole driver (install + reroute output, loses volume keys).
- **Recording writes parts** `<name>.video.mp4` and `<name>.system.m4a`; `stop` mixes them with `amix` into `<name>.mp4` and deletes parts on success. Sync is start-time aligned (~100ms drift acceptable for v1).
