## Decisions

1. **Final transcript is post-hoc on the mixed audio.** `ffmpeg -i <base>.mp4 -vn -ac 1 -ar 16000 <tmp>.wav`, then `whisper-cli -m <model> -f <tmp>.wav -oj -of <prefix>`. Pure `segmentsToMarkdown(segments)` → `[mm:ss] text` lines. Post-hoc is more accurate than streaming and includes system audio (meeting participants), which `whisper-stream` cannot hear.
   **whisper-cli JSON contract (verified with a real run; fixture: `test/fixtures/whisper.json`):**
   - `-oj` writes `<-of prefix>.json` (prefix + `.json`; without `-of` it is `<input file>.json`, e.g. `x.wav.json`). Nothing JSON goes to stdout, so read the file, then delete it.
   - Segments live in `transcription[]`; each has `offsets.from` / `offsets.to` in milliseconds (also `timestamps.from/to` as `"00:00:00,000"` strings; ignore them) and `text`.
   - `text` has a leading space (` Hello World this is a test.`): trim it. The model may also emit non-speech markers such as `[BLANK_AUDIO]`; decide in `segmentsToMarkdown` whether to drop them (recommended: drop).
   - So the segment type is `{ offsets: { from: number; to: number }; text: string }`, not `{from_ms, to_ms, text}`.
2. **Live captions are mic-only and best-effort.** `whisper-stream -m <model> -c <sdl-device> --step 3000 --length 10000 -f <base>.live.txt` spawned detached. Known gap: other people's voices from system audio are not in live captions. Acceptable for v1; a later change can feed the ScreenCaptureKit helper's audio to whisper instead.
3. **Device mapping:** `whisper-stream` uses SDL capture IDs, not avfoundation indices. Default `-c -1` (system default input). Map by name later if it proves wrong.
   **Unverified, check first:** `whisper-stream -f <file>` may overwrite or rewrite the file each step instead of appending. Before relying on append semantics (and on `localscribe captions` tailing), run it for a few seconds and watch the file. Fallback: `--step 0` (VAD mode, one line per utterance), which appends finished utterances only. If neither appends, have the plugin read whisper-stream stdout instead and append to `<base>.live.txt` itself.
4. **`localscribe captions`:** tails `<base>.live.txt` of the active recording (reads state); exits when recording stops.
5. **Missing deps** produce a plugin error (per contract), never a failed recording.

## Pure, testable units

- `buildWhisperArgs`, `buildStreamArgs`, `buildExtractAudioArgs`
- `segmentsToMarkdown(segments: { offsets: { from: number; to: number }; text: string }[])` (input is `transcription[]` from the JSON above)
- `formatTimestamp(ms)`

## Risks

- `base.en` model is English only; non-English speech needs `ggml-base.bin` or larger. Model is an env var, not a flag, for v1.
- Long recordings: whisper-cli on base.en runs roughly 10–20× realtime on Apple Silicon (unverified here), so `stop` blocks; print progress.
