## 1. Pure units (TDD)

- [x] 1.1 Segment readiness and timing (`src/live/segments.ts`)
- [x] 1.2 Live line formatting, non-speech filter, repeat drop, `LiveMerger` ordering (`src/live/lines.ts`)
- [x] 1.3 Suggestion cadence with fake clock (`src/live/cadence.ts`)
- [x] 1.4 Suggestion prompt and reply parsing (`src/live/prompt.ts`)
- [x] 1.5 Manual-note stamping (`src/live/manual.ts`)
- [x] 1.6 `renderScreen` pure render and input key reducer (`src/live/render.ts`)
- [x] 1.7 Manual notes in final notes prompt and `generateNotes`

## 2. Capture and worker

- [ ] 2.1 `native/livesys.swift` 16 kHz mono WAV segments
- [ ] 2.2 `live` plugin: spawn segmenters + worker, `addSidecar` each; remove whisper-stream from `transcription`
- [ ] 2.3 `live-worker` loop (injected runner/clock), append `live.txt`

## 3. TUI

- [ ] 3.1 `localscribe live` controller (suggestion loop, manual input, ANSI IO)
- [ ] 3.2 `start --live` hint, help text

## 4. Verification

- [ ] 4.1 Real run: `say` through speakers ~40 s, live.txt with `me`/`them`, a real Hermes suggestion, a manual note
