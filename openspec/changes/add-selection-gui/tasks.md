## 1. Capture helper

- [ ] 1.1 `native/capture.swift`: `--list --json` (displays, windows)
- [ ] 1.2 Display / window / area video capture via ScreenCaptureKit + AVAssetWriter, system audio optional, finish-once on SIGINT
- [ ] 1.3 Parity smoke vs ffmpeg engine: size, duration, a/v sync clap test

## 2. CLI

- [ ] 2.1 `devices [--json]` (pure formatter tested with fixtures): fill the stub in `src/commands/devices.ts`; the `--window/--area/--display/--engine/--json` flags are already in `src/commands/shared.ts` and HELP
- [ ] 2.2 `--window`, `--area`, `--display`, `--engine`; pure arg parsing/validation tests
- [ ] 2.3 Recorder: SCK engine path (video+sys from helper, mic from ffmpeg), mux of three parts

## 3. Menu-bar app

- [ ] 3.1 SwiftPM package `native/LocalscribeBar`, `MenuBarExtra` with status + start/stop
- [ ] 3.2 Source pickers from `devices --json`; transcribe/notes toggles
- [ ] 3.3 Area overlay (drag, Esc cancels)
- [ ] 3.4 Manual smoke: pick window → record 5s → file plays, correct size
