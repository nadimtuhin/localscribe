## Why

Flags are fine for scripts but clumsy for "record this window" or "record this box". A small native GUI to pick what to record, and to start/stop, makes daily use easy.

## What Changes

- **Video capture moves to ScreenCaptureKit** in the Swift helper (renamed `native/capture.swift`, binary `bin/localscribe-capture`), which records screen, a single window, or an area, plus system audio, into one file. ffmpeg keeps doing the mic and the final mix.
- New CLI flags: `--window <id|name>`, `--area x,y,w,h` (points), `--display <id>`; new `localscribe devices [--json]` listing displays, windows and mics.
- New menu-bar app `native/LocalscribeBar` (SwiftUI `MenuBarExtra`): pick display / window / area (drag overlay) / mic, toggles for transcribe/notes, start/stop with elapsed time. It shells out to the `localscribe` CLI; it holds no recording logic.

## Capabilities

### New Capabilities
- `selection`: choosing display, window, area and mic, from CLI and GUI.

### Modified Capabilities
- `recorder`: video source becomes ScreenCaptureKit; avfoundation path kept behind `--engine ffmpeg` until parity is verified.

## Impact

- Largest change. Touches `native/`, `recorder.ts` (capture start/stop), `ffmpeg.ts` (mux of SCK video + mic), `cli.ts`.
- Does not touch `src/plugins/*` (contract stays the same).
- New build step: `swiftc` for the helper, `swift build` (SwiftPM) for the app.
