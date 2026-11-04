# localscribe

Bun + TypeScript macOS recorder with Whisper transcription and Swift native helpers (`native/`).

## Commands

- Tests: `bun test`; coverage: `bun run coverage`; e2e: `bun run e2e`
- Typecheck: `bunx tsc -p tsconfig.json --noEmit` (needs the explicit tsconfig)
- Swift system audio helper: `mkdir -p bin && swiftc -O native/sysaudio.swift -o bin/sysaudio`
- Menu bar app: `bun run bar`; its tests: `bun run bar:test`
- List capture devices: `ffmpeg -hide_banner -f avfoundation -list_devices true -i ""`
- If the load guard rejects a heavy command while background agents run, wait for them to finish; do not bypass the guard.

## Gotchas

- Never pass `-shortest` to ffmpeg when muxing video with system audio: it cuts leading silence and desyncs audio (tests assert this).
- `native/sysaudio.swift` must flush audio before exit on a duplicate SIGINT; keep the `finishAndExit` guard.
- Whisper model: `~/.hermes/models/whisper/ggml-base.en.bin`. Recordings: `~/Movies/localscribe/`.
- Purpose: live interview and meeting notes with Hermes suggestions plus manual notes; Bangla and English.
- Do not read PNG or video files into context; inspect media with `ffprobe`.
- Show test output before claiming done (the Stop hook rejects claims without evidence).
