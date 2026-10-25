## ADDED Requirements

### Requirement: Audio-only recording
The recorder SHALL support recording audio without video when `--audio-only` is provided.

#### Scenario: Audio-only with both mic and system audio
- **WHEN** the user runs `localscribe start --audio-only`
- **THEN** video capture is skipped
- **AND** both microphone and system audio are captured into intermediate audio parts
- **AND** stopping the recording mixes both parts into an `.m4a` file

#### Scenario: Audio-only with microphone only
- **WHEN** the user runs `localscribe start --audio-only --no-system-audio`
- **THEN** only the microphone is recorded and finalized into an `.m4a` file

#### Scenario: Audio-only with system audio only
- **WHEN** the user runs `localscribe start --audio-only --no-mic`
- **THEN** only system audio is recorded and finalized into an `.m4a` file

### Requirement: Audio-only flag validation
The CLI SHALL reject invalid flag combinations with `--audio-only`.

#### Scenario: Conflicting video flags
- **WHEN** the user runs `localscribe start --audio-only` with any of `--screen`, `--fps`, `--window`, `--area`, `--display`, `--draw`, or `--engine`
- **THEN** the command exits non-zero with an error explaining video options cannot be used with `--audio-only`

#### Scenario: No audio sources
- **WHEN** the user runs `localscribe start --audio-only --no-mic --no-system-audio`
- **THEN** the command exits non-zero with an error explaining at least one audio source is required

### Requirement: File discovery and commands support
The CLI commands SHALL support `.m4a` audio files.

#### Scenario: Listing audio recordings
- **WHEN** the user runs `localscribe list`
- **THEN** `.m4a` recording files are listed alongside `.mp4` recordings, and intermediate part files (`.mic.m4a`, `.system.m4a`) are excluded
