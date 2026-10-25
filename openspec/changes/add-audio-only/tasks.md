## 1. Epic: CLI Interface & Validation

- [x] 1.1 Story: Add `--audio-only` flag to `cliOptions` and update `HELP` in `src/commands/shared.ts`
- [x] 1.2 Story: Add validation rejecting video flags and empty audio sources in `src/commands/start.ts`
- [x] 1.3 Story: Add unit tests for `--audio-only` CLI validation in `src/commands/start.test.ts`

## 2. Epic: Recorder Engine & Audio Mixing

- [x] 2.1 Story: Add `buildAudioMixArgs` in `src/ffmpeg.ts` to mix audio tracks without video
- [x] 2.2 Story: Update `src/paths.ts` to generate `.m4a` filenames for audio-only recordings
- [x] 2.3 Story: Implement audio-only process lifecycle in `start` and `stop` in `src/recorder.ts`
- [x] 2.4 Story: Add unit tests for audio-only recording lifecycle in `src/recorder.test.ts`

## 3. Epic: Multi-command Support

- [x] 3.1 Story: Update `list()` in `src/recorder.ts` and `src/commands/list.ts` to include `.m4a` files and exclude parts
- [x] 3.2 Story: Update `last`, `open`, `copy`, and `notes` commands to resolve `.m4a` bases
- [x] 3.3 Story: Add unit tests for `.m4a` support across `list`, `last`, `open`, `copy`, `notes`

## Later (not v1)

- [ ] 4.1 Story: Menu-bar GUI toggle for audio-only mode in LocalscribeBar
- [ ] 4.2 Story: Export to alternative audio formats (.mp3, .wav)
