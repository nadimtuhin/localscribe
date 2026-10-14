## ADDED Requirements

### Requirement: Two-sided realtime transcript
With `--live`, the recorder SHALL append `[mm:ss] me: <text>` (mic) and `[mm:ss] them: <text>` (system audio) lines to `<base>.live.txt` while recording. The file SHALL be append-only and in chronological order.

#### Scenario: Both sides labeled
- **WHEN** the user speaks into the mic and the other party's audio plays through the system
- **THEN** `<base>.live.txt` has `me:` lines for the first and `them:` lines for the second

#### Scenario: No duplicate lines
- **WHEN** a segment has been transcribed
- **THEN** it is never transcribed again, and an identical consecutive line from the same speaker is not appended twice

#### Scenario: Out-of-order completion
- **WHEN** a `them` segment finishes after a later `me` segment
- **THEN** the lines are still written in time order

### Requirement: Manual notes
`localscribe live` SHALL accept typed notes and append `[mm:ss] note: <text>` to `<base>.manual.md`, using the recording clock.

#### Scenario: Note stamped
- **WHEN** the user types `ask about pricing` 83 s into the recording
- **THEN** `<base>.manual.md` gains `[01:23] note: ask about pricing`

### Requirement: Rolling Hermes suggestions
`localscribe live` SHALL, after roughly every 60 s of new speech, send Hermes the last ~5 minutes of transcript and manual notes, show 1-3 short suggestions and append them to `<base>.suggestions.md`.

#### Scenario: Cadence
- **WHEN** less than 60 s of new transcript has arrived since the last suggestion
- **THEN** no Hermes call is made

#### Scenario: Never concurrent, never fatal
- **WHEN** a Hermes call is in flight, or it fails or times out
- **THEN** no second call starts, the TUI shows a dim status line and keeps running

#### Scenario: Hardened invocation
- **WHEN** Hermes is called
- **THEN** it runs with `--ignore-rules -t todo`, in a temp directory, with a timeout, and the transcript is passed as delimited untrusted data

### Requirement: Terminal UI
`localscribe live` SHALL show a captions pane, a suggestions pane and an input line, and exit when the recording stops. `start --live` SHALL print the hint to run it.

#### Scenario: Not recording
- **WHEN** no live recording is active
- **THEN** `localscribe live` prints an error and exits 1

### Requirement: Sidecar cleanup
Every process the live plugin spawns SHALL be registered with `ctx.addSidecar`, so `stop` ends them.

#### Scenario: Stop cleans up
- **WHEN** the user runs `localscribe stop`
- **THEN** the segmenters and the worker are interrupted by the recorder

### Requirement: Manual notes in final notes
With `--notes`, the notes prompt SHALL include `<base>.manual.md` when it exists.

#### Scenario: Notes see manual notes
- **WHEN** `<base>.manual.md` exists and notes are generated
- **THEN** the prompt contains its text in a delimited block
