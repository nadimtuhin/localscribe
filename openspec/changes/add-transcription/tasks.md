## 1. Pure core (TDD)

- [ ] 1.1 `formatTimestamp`, `segmentsToMarkdown` with a whisper JSON fixture
- [ ] 1.2 `buildExtractAudioArgs`, `buildWhisperArgs`, `buildStreamArgs`

## 2. Plugin

- [ ] 2.1 `transcription` plugin: `enabled` = transcribe || liveCaptions
- [ ] 2.2 `start`: if live, spawn detached whisper-stream, return `{ pid }`
- [ ] 2.3 `stop`: stop whisper-stream; extract wav; run whisper-cli; write transcript.md; clean temp files
- [ ] 2.4 Register in `src/plugins/index.ts` (first in order)

## 3. CLI + verification

- [ ] 3.1 `localscribe captions` (tail live file of active recording)
- [ ] 3.2 Smoke: `start --live`, `say "hello from localscribe"`, `stop` → transcript contains "hello"
