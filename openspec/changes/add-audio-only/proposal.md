## Why

Sometimes users only need to record audio (interviews, voice memos, meetings, podcasts) without burning CPU and disk space on video encoding. An `--audio-only` flag lets `localscribe` record microphone audio, system audio, or both, directly into an audio container (`.m4a`) while keeping full compatibility with transcription (`--transcribe`), live captions (`--live`), and AI meeting notes (`--notes`).

## What Changes

- New CLI flag `--audio-only` on `localscribe start`.
- Skips video capture (no ScreenCaptureKit video helper or ffmpeg video capture).
- Records mic (ffmpeg AAC) and/or system audio (`sysaudio` AAC helper).
- In stop, mixes both audio streams if both were recorded, or finalizes the single stream if only one was recorded.
- Defaults output extension to `.m4a` (or preserves `.m4a` / `.mp4` if specified in `--out`).
- Updates `list`, `last`, `open`, `copy`, and `notes` to recognize `.m4a` recording files alongside `.mp4`.
- Rejects conflicting video options (`--screen`, `--fps`, `--window`, `--area`, `--display`, `--draw`, `--engine`) and invalid audio configuration (`--no-mic` together with `--no-system-audio`).

## Capabilities

### New Capabilities
- `audio-only`: record microphone and/or system audio without video into an audio file.

### Modified Capabilities
None.

## Impact

- Touches `src/commands/shared.ts` (CLI options and help text).
- Touches `src/commands/start.ts` (argument parsing and validation).
- Touches `src/recorder.ts` (audio-only capture start, stop, and mix).
- Touches `src/ffmpeg.ts` (audio mixing args).
- Touches `src/paths.ts` and command files (`list.ts`, `open.ts`, `copy.ts`, `last.ts`, `notes.ts`) to handle `.m4a` files.
