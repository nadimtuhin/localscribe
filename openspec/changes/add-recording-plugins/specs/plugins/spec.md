## ADDED Requirements

### Requirement: Plugin lifecycle
The recorder SHALL run enabled plugins' `start` hooks after recording begins and their `stop` hooks, in registry order, after the final mp4 is written.

#### Scenario: Stop hooks see the final file
- **WHEN** a recording with an enabled plugin is stopped
- **THEN** the plugin's `stop` hook receives `file` pointing to an existing, finalized mp4 and the value its `start` hook returned

#### Scenario: Disabled plugins are skipped
- **WHEN** no plugin flags are passed
- **THEN** no plugin hook runs and behaviour matches the recorder without plugins

### Requirement: Plugin failure isolation
A failing plugin SHALL NOT fail or corrupt the recording.

#### Scenario: Stop hook throws
- **WHEN** a plugin's `stop` hook throws
- **THEN** the CLI prints `<plugin>: <error>`, keeps the mp4, runs remaining plugins, and exits 0

### Requirement: Plugin state persists across processes
Options and data returned by `start` hooks SHALL be stored in the state file so a separate `stop` process can use them.

#### Scenario: Stop in another terminal
- **WHEN** `start --transcribe` runs in one terminal and `stop` in another
- **THEN** the transcription plugin's `stop` hook runs with its saved state
