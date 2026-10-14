## Why

Whisper runs with an English-only model, so Bangla, Hindi, Urdu, Arabic or Spanish conversations transcribe as garbage, and Hermes is never told which language to answer in.

## What Changes

- `start --lang <name|code>` (default `en`; also `bangla`/`bengali`/`bn`, `hindi`/`hi`, `urdu`/`ur`, `arabic`/`ar`, `spanish`/`es`, `auto`), case-insensitive. An unknown value fails `start` before recording, listing examples. `notes --lang` does the same for existing transcripts.
- `en` keeps `ggml-base.en.bin`; every other value, including `auto`, uses the multilingual `ggml-small.bin`. `LOCALSCRIBE_WHISPER_MODEL` still overrides. A missing model fails `start` with the exact download command.
- Every `whisper-cli` call (final transcription, live segments) gets `-l <code>`. The code is stored in the state `pluginOptions`, which the live worker and stop hooks read.
- Live suggestions, inline asks and final notes prompts add "The conversation is in <Language>. Reply in <Language>." (`auto`: "Reply in the language of the conversation.").

## Capabilities

### Modified Capabilities
- `transcription`: language flag, model choice, language in Hermes prompts.

## Impact

- `src/transcription/{language,core}.ts`, `src/plugins/{index,types,live,transcription,notes}.ts`, `src/commands/{start,notes,live,live-worker,shared}.ts`, `src/live/{prompt,session,worker}.ts`, `src/notes/{prompt,generate}.ts`, `src/cli.ts`.
- `captions` only tails the live file, so it has no language option; it follows the recording's `--lang`.
- `ggml-small.bin` is about 466 MB on disk.
