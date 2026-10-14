## ADDED Requirements

### Requirement: Start recording
The CLI SHALL start a screen recording in the background with `localscribe start` and return control to the shell.

#### Scenario: Start with defaults
- **WHEN** the user runs `localscribe start` and no recording is active
- **THEN** ffmpeg begins capturing the main screen in a detached process
- **AND** the CLI prints the output file path and exits 0

#### Scenario: Already recording
- **WHEN** the user runs `localscribe start` while a recording is active
- **THEN** the CLI prints the active file path and exits non-zero without starting a second recording

#### Scenario: Custom output
- **WHEN** the user runs `localscribe start --out ./demo.mp4`
- **THEN** the recording is written to `./demo.mp4`

### Requirement: Stop recording
The CLI SHALL stop the active recording with `localscribe stop` and leave a playable file.

#### Scenario: Stop active recording
- **WHEN** the user runs `localscribe stop` while recording
- **THEN** ffmpeg receives SIGINT, finalizes the file, and the CLI prints path, duration, and size

#### Scenario: Nothing to stop
- **WHEN** the user runs `localscribe stop` with no active recording
- **THEN** the CLI prints "not recording" and exits non-zero

#### Scenario: ffmpeg hangs on stop
- **WHEN** ffmpeg has not exited 10 seconds after SIGINT
- **THEN** the CLI sends SIGKILL and warns that the file may be truncated

### Requirement: Status
The CLI SHALL report whether a recording is active via `localscribe status`.

#### Scenario: Active
- **WHEN** a recording is active
- **THEN** status prints the file path and elapsed time

#### Scenario: Stale state
- **WHEN** the state file references a pid that is no longer alive
- **THEN** the state is cleared and status reports not recording

### Requirement: List recordings
The CLI SHALL list saved recordings with `localscribe list`, newest first, showing name, size, and date.

#### Scenario: List default dir
- **WHEN** the user runs `localscribe list`
- **THEN** files in `~/Movies/localscribe` are printed newest first

### Requirement: Local only
The recorder SHALL NOT make any network calls; all output stays on local disk.

#### Scenario: Offline
- **WHEN** the machine has no network
- **THEN** start/stop/status/list work unchanged

### Requirement: Record audio
The recorder SHALL capture system audio (via ScreenCaptureKit) and the microphone by default, mixed into one audio track in the final file.

#### Scenario: Default audio
- **WHEN** the user runs `localscribe start` then `localscribe stop`
- **THEN** the saved mp4 contains video plus one audio track mixing system audio and microphone

#### Scenario: Opt out
- **WHEN** the user passes `--no-mic` or `--no-system-audio`
- **THEN** that source is not recorded

#### Scenario: Mux failure keeps parts
- **WHEN** the final mix step fails
- **THEN** the separate video and audio part files are kept and their paths printed
