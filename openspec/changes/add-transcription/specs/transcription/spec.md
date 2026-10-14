## ADDED Requirements

### Requirement: Final transcript
When `--transcribe` is enabled, the recorder SHALL write `<base>.transcript.md` after stop using a local whisper model on the final mixed audio.

#### Scenario: Transcribe on stop
- **WHEN** the user runs `localscribe start --transcribe`, speaks, then `localscribe stop`
- **THEN** `<base>.transcript.md` exists with one `[mm:ss] text` line per segment and the CLI prints its path

#### Scenario: whisper missing
- **WHEN** `whisper-cli` or the model file is missing
- **THEN** the CLI prints `transcription: <reason>` with an install hint, keeps the mp4, and exits 0

### Requirement: Live captions
When `--live` is enabled, the recorder SHALL append live microphone captions to `<base>.live.txt` while recording.

#### Scenario: Follow captions
- **WHEN** a `--live` recording is active and the user runs `localscribe captions`
- **THEN** new caption lines are printed as they arrive until the recording stops

#### Scenario: Live implies transcript
- **WHEN** `--live` is passed without `--transcribe`
- **THEN** the final transcript is still produced on stop

### Requirement: Local only
Transcription SHALL NOT use the network.

#### Scenario: Offline transcription
- **WHEN** the machine is offline
- **THEN** transcription works unchanged
