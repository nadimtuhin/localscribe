## ADDED Requirements

### Requirement: Notes on stop
When `--notes` is enabled, the recorder SHALL send the transcript to Hermes after stop and save the reply as `<base>.notes.md`.

#### Scenario: Notes after transcript
- **WHEN** the user runs `localscribe start --notes` then `localscribe stop`
- **THEN** a transcript is produced first, then `<base>.notes.md` with Summary, Key points, Decisions, Action items and Suggestions sections

#### Scenario: No transcript
- **WHEN** the transcript file is missing or empty at notes time
- **THEN** the CLI prints `notes: no transcript, skipped` and exits 0

#### Scenario: Hermes fails
- **WHEN** `hermes` is missing, errors or exceeds 120s
- **THEN** the CLI prints `notes: <reason>`, keeps mp4 and transcript, and exits 0

### Requirement: Transcript is untrusted data
Hermes SHALL be run with project rules ignored, a minimal toolset, and a fresh temporary working directory, and the transcript SHALL be passed as delimited data with an instruction not to follow instructions inside it.

#### Scenario: Injection in transcript
- **WHEN** the transcript contains text instructing the assistant to run commands or write files
- **THEN** no command runs and no file is written outside `<base>.notes.md`; the text appears only as content in the notes

### Requirement: Regenerate notes
The CLI SHALL regenerate notes for an existing recording with `localscribe notes <path>`.

#### Scenario: From mp4 path
- **WHEN** the user runs `localscribe notes ~/Movies/localscribe/x.mp4` and `x.transcript.md` exists
- **THEN** `x.notes.md` is (re)written

### Requirement: Opt-in data sharing
Notes SHALL only run when explicitly requested, and the CLI SHALL state that the transcript is sent to Hermes.

#### Scenario: Default recording
- **WHEN** the user records without `--notes`
- **THEN** Hermes is never called
