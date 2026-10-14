## ADDED Requirements

### Requirement: Conversation language
`start` and `notes` SHALL accept `--lang <name|code>`, case-insensitive, mapping names (english, bangla, bengali, hindi, urdu, arabic, spanish) and whisper codes to a whisper code, or `auto`. The default SHALL be `en`. An unknown value SHALL fail before recording starts with a message listing examples. `start` SHALL store the code in the state `pluginOptions`.

#### Scenario: Name or code
- **WHEN** `--lang Bengali` or `--lang bn` is given
- **THEN** the stored language is `bn`

#### Scenario: Unknown language
- **WHEN** `--lang klingon` is given
- **THEN** `start` exits with an error listing example languages and nothing is recorded

### Requirement: Model by language
English SHALL use `~/.hermes/models/whisper/ggml-base.en.bin`. Any other language, including `auto`, SHALL use `~/.hermes/models/whisper/ggml-small.bin`. `LOCALSCRIBE_WHISPER_MODEL` SHALL override both. When transcription is requested and the chosen model file is missing, `start` SHALL fail before recording with the exact `curl -L -o <path> <url>` download command.

#### Scenario: Missing multilingual model
- **WHEN** `start --lang hi --transcribe` runs and `ggml-small.bin` is absent
- **THEN** `start` fails and prints the download command for `ggml-small.bin`

### Requirement: Language reaches whisper and Hermes
Every `whisper-cli` invocation SHALL receive `-l <code>`. The live worker SHALL read the code from the state. Live suggestion, inline ask and final notes prompts SHALL state "The conversation is in <Language>. Reply in <Language>.", or "Reply in the language of the conversation." for `auto`.

#### Scenario: Hindi final transcript
- **WHEN** a recording made with `--lang hindi` is transcribed
- **THEN** `whisper-cli` runs with `-l hi` and the multilingual model
