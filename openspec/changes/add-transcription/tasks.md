## 1. Pure core (TDD)

- [ ] 1.1 `formatTimestamp`, `segmentsToMarkdown` using `test/fixtures/whisper.json` (real whisper-cli output; trim the leading space in `text`)
- [ ] 1.2 `buildExtractAudioArgs`, `buildWhisperArgs` (must pass `-oj -of <prefix>`; result is `<prefix>.json`), `buildStreamArgs`
- [ ] 1.3 Verify `whisper-stream -f` append semantics with a real run; if it rewrites the file, switch to `--step 0` or capture stdout (see design.md)

## 2. Plugin

- [ ] 2.1 `transcription` plugin (stub already registered in `src/plugins/transcription.ts`; `enabled` is done)
- [ ] 2.2 `start`: if live, spawn detached whisper-stream and register it with `ctx.addSidecar(pid, "whisper-stream")`; the recorder stops it (do not kill it in `stop`)
- [ ] 2.3 `stop`: (whisper-stream is already stopped by the recorder) extract wav; run whisper-cli; read `<prefix>.json`; write transcript.md; clean temp files. `ctx.durationMs` / `ctx.startedAt` are available

## 3. CLI + verification

- [ ] 3.1 `localscribe captions`: fill the stub in `src/commands/captions.ts` (tail live file of active recording)
- [ ] 3.2 Smoke: `start --live`, `say "hello from localscribe"`, `stop` → transcript contains "hello"
