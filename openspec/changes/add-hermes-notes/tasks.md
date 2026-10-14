## 1. Pure core (TDD)

- [ ] 1.1 `buildNotesPrompt`, `truncateTranscript`, `formatNotesFile`
- [ ] 1.2 `buildHermesArgs` (respects `LOCALSCRIBE_HERMES_ARGS`)

## 2. Plugin

- [ ] 2.1 Check `hermes --help` for stdin/file input; pick the safest way to pass a long transcript
- [ ] 2.2 `notes` plugin: `enabled` = notes; `stop` reads `<base>.transcript.md`, calls Hermes (120s timeout), writes notes.md
- [ ] 2.3 `--notes` implies `--transcribe` (set in CLI option parsing)
- [ ] 2.4 Register in `src/plugins/index.ts` after transcription

## 3. CLI + verification

- [ ] 3.1 `localscribe notes <mp4|transcript.md>`
- [ ] 3.2 Smoke with a fixture transcript → real `hermes` call → notes.md has all 5 sections

## 4. Follow-up (not this change)

- [ ] 4.1 Rolling suggestions every N minutes during a `--live` recording
