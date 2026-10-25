## Context

`localscribe` is a local screen recorder that produces `.mp4` video files muxed with microphone and/or system audio. Adding audio-only recording allows lightweight capture for voice notes, audio meetings, and transcription workflows without video overhead.

## Goals

1. CLI flag `--audio-only` on `start`.
2. Support recording:
   - Microphone only (`--audio-only --no-system-audio`)
   - System audio only (`--audio-only --no-mic`)
   - Both microphone and system audio (`--audio-only`)
3. Mix microphone and system audio into a unified `.m4a` file on `stop`.
4. Work seamlessly with plugins: `--transcribe`, `--live`, `--notes`.
5. Support `.m4a` files across `list`, `last`, `open`, `copy`, and `notes`.

## Non-Goals

- Video capture or synthetic video tracks for audio-only recordings.
- Alternative audio formats beyond `.m4a` / AAC (MPEG-4 Audio).

## Decisions

1. **Audio format:** Use `.m4a` with AAC encoding.
   - *Alternative considered:* `.mp3` or `.wav`.
   - *Reason:* `.m4a` (AAC) is natively output by `sysaudio` (AVAssetWriter) and ffmpeg mic capture (`-c:a aac`), keeping encoding zero-transcode and fast.

2. **Flag conflicts:**
   - `--audio-only` rejects video-related flags (`--screen`, `--fps`, `--window`, `--area`, `--display`, `--draw`, `--engine`).
   - `--audio-only` with both `--no-mic` and `--no-system-audio` throws an error because there are no audio streams to record.

3. **Capture implementation:**
   - When mic is enabled, ffmpeg records `none:<micDevice>` into `<base>.mic.m4a`.
   - When system audio is enabled, `sysaudio` records system audio into `<base>.system.m4a`.
   - If both are enabled, on `stop` ffmpeg mixes them via `amix` into `<base>.m4a` and cleans up the part files.
   - If only one stream is recorded, it is simply renamed to `<base>.m4a`.

4. **Multi-command support for `.m4a`:**
   - `list` lists `.mp4` and `.m4a` files (excluding intermediate `.system.m4a` and `.mic.m4a`).
   - `last`, `open`, `copy`, `notes` strip either `.mp4` or `.m4a` to determine the recording base path for sidecars (`.transcript.md`, `.notes.md`, etc.).

## Risks / Trade-offs

- *Risk:* Concurrent processes during audio-only recording.
  - *Mitigation:* `RecordingState` holds primary PID and tracks the secondary audio process (`systemAudio` or `mic`) so `activeRecording` and `stop` clean up all spawned processes reliably.
