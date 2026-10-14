## 1. Units (TDD)

- [x] 1.1 `parseLanguage` and `languageInstruction`
- [x] 1.2 Model choice by language and missing-model download hint
- [x] 1.3 `-l <code>` in final and live-segment whisper args
- [x] 1.4 `--lang` in plugin options (default `en`, unknown fails)
- [x] 1.5 Language line in suggestion, ask and notes prompts

## 2. Wiring

- [x] 2.1 `start` checks the model before recording; live worker reads the code from state
- [x] 2.2 `notes --lang`, help text

## 3. Verification

- [x] 3.1 Real `say -v Lekha` Hindi audio through whisper-cli `-l hi` and the transcription plugin
