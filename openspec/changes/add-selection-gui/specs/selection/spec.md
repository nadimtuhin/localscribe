## ADDED Requirements

### Requirement: List capture sources
The CLI SHALL list displays, windows and microphones with `localscribe devices`, and as JSON with `--json`.

#### Scenario: JSON for the GUI
- **WHEN** the user runs `localscribe devices --json`
- **THEN** stdout is one JSON object with `displays`, `windows` and `microphones` arrays as defined in design.md

### Requirement: Record a window
The recorder SHALL record a single window with `--window <id|name>`.

#### Scenario: By app name
- **WHEN** the user runs `localscribe start --window Safari`
- **THEN** only the frontmost Safari window is recorded, at its native pixel size

#### Scenario: Ambiguous name
- **WHEN** several windows match the name
- **THEN** the CLI lists the matches with ids and exits non-zero

### Requirement: Record an area
The recorder SHALL record a rectangle of a display with `--area x,y,w,h` in points.

#### Scenario: Area capture
- **WHEN** the user runs `localscribe start --area 0,0,800,600`
- **THEN** the output video is 800×600 points at the display's scale (1600×1200 on a 2× display)

### Requirement: Menu-bar GUI
A menu-bar app SHALL let the user choose display, window, area and mic, toggle transcription/notes, and start/stop recording via the CLI.

#### Scenario: Drag to pick an area
- **WHEN** the user chooses "Area…" and drags a rectangle
- **THEN** recording starts for that rectangle and the menu-bar icon shows elapsed time

#### Scenario: Stop from the menu bar
- **WHEN** the user clicks Stop
- **THEN** the GUI runs `localscribe stop` and shows the saved file path with "Reveal in Finder"
