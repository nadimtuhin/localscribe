## MODIFIED Requirements

### Requirement: Live captions
When `--live` is enabled, the recorder SHALL append two-sided labeled captions (`[mm:ss] me|them: text`) to `<base>.live.txt` while recording, as specified by `live-assist`. `whisper-stream` is no longer used.

#### Scenario: Follow captions
- **WHEN** a `--live` recording is active and the user runs `localscribe captions`
- **THEN** new caption lines are printed as they arrive until the recording stops
