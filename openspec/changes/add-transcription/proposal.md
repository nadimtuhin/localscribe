## Why

The "scribe" in localscribe: get a searchable text record of every recording, fully on-device, plus optional live captions while recording.

## What Changes

- New plugin `transcription` (`src/plugins/transcription.ts`) implementing the `add-recording-plugins` contract.
- `--transcribe`: after stop, run `whisper-cli` on the final mp4's mixed audio (system + mic) and write `<base>.transcript.md`.
- `--live` (implies `--transcribe`): during recording, run `whisper-stream` on the mic and append captions to `<base>.live.txt`; `localscribe captions` tails it.
- Model path: `LOCALSCRIBE_WHISPER_MODEL`, default `~/.hermes/models/whisper/ggml-base.en.bin`.

## Capabilities

### New Capabilities
- `transcription`: local speech-to-text for recordings.

## Impact

- New files only, plus one registry line and one `captions` CLI command.
- Runtime deps: `whisper-cli`, `whisper-stream` (Homebrew whisper-cpp), a ggml model. No network.
