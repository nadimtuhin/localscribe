## Why

A transcript is long. The useful part is the decisions, action items and what to do next. Hermes already knows the user's context and tools, so it can turn a transcript into notes and suggestions.

## What Changes

- New plugin `notes` (`src/plugins/notes.ts`) implementing the `add-recording-plugins` contract.
- `--notes` (implies `--transcribe`): after the transcript is written, send it to `hermes -z <prompt>` and save the reply to `<base>.notes.md`.
- `localscribe notes <file.mp4|transcript.md>`: regenerate notes for an existing recording.

## Capabilities

### New Capabilities
- `notes`: AI summary and suggestions from a transcript via Hermes.

## Impact

- **Breaks the "local only" rule when enabled:** the transcript leaves this program and goes to whatever model Hermes routes to. Hence opt-in only, and the CLI says so the first time.
- New files only, plus one registry line and one CLI command.
