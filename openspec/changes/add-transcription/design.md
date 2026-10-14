## Decisions

1. **Final transcript is post-hoc on the mixed audio.** `ffmpeg -i <base>.mp4 -vn -ac 1 -ar 16000 <tmp>.wav`, then `whisper-cli -m <model> -f <tmp>.wav -oj` (JSON segments). Pure `segmentsToMarkdown(segments)` → `[mm:ss] text` lines. Post-hoc is more accurate than streaming and includes system audio (meeting participants), which `whisper-stream` cannot hear.
2. **Live captions are mic-only and best-effort.** `whisper-stream -m <model> -c <sdl-device> --step 3000 --length 10000 -f <base>.live.txt` spawned detached. Known gap: other people's voices from system audio are not in live captions. Acceptable for v1; a later change can feed the ScreenCaptureKit helper's audio to whisper instead.
3. **Device mapping:** `whisper-stream` uses SDL capture IDs, not avfoundation indices. Default `-c -1` (system default input). Map by name later if it proves wrong.
4. **`localscribe captions`:** tails `<base>.live.txt` of the active recording (reads state); exits when recording stops.
5. **Missing deps** produce a plugin error (per contract), never a failed recording.

## Pure, testable units

- `buildWhisperArgs`, `buildStreamArgs`, `buildExtractAudioArgs`
- `segmentsToMarkdown(segments: {from_ms, to_ms, text}[])`
- `formatTimestamp(ms)`

## Risks

- `base.en` model is English only; non-English speech needs `ggml-base.bin` or larger. Model is an env var, not a flag, for v1.
- Long recordings: whisper-cli on base.en runs roughly 10–20× realtime on Apple Silicon (unverified here), so `stop` blocks; print progress.
