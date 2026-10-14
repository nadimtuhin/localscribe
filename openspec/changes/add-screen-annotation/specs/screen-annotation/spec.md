## ADDED Requirements

### Requirement: Draw on screen while recording
With `--draw`, the recorder SHALL start an annotation overlay that is click-through until draw mode is toggled, and strokes drawn in it SHALL appear in the recorded video (display or area capture).

#### Scenario: Toggle and draw
- **WHEN** the user presses Ctrl+Opt+D and drags the mouse
- **THEN** a red line follows the drag, and it is visible in the recording

#### Scenario: Shapes by modifier
- **WHEN** the user drags with Shift held, or with Option held
- **THEN** an arrow, or a rectangle, is drawn from the press point to the release point

#### Scenario: Leave draw mode
- **WHEN** the user presses Esc or Ctrl+Opt+D in draw mode
- **THEN** the overlay is click-through again and existing strokes stay

#### Scenario: Clear
- **WHEN** the user presses Ctrl+Opt+C
- **THEN** all strokes are removed

### Requirement: Helper lifecycle
The overlay helper SHALL be registered as a sidecar, exit on SIGINT/SIGTERM, and exit by itself when the recorder process is gone.

#### Scenario: Stop
- **WHEN** the user runs `localscribe stop`
- **THEN** no `localscribe-annotate` process remains

### Requirement: Window capture limitation
With `--window`, the overlay SHALL NOT be guaranteed to appear in the video because only that window is captured.

#### Scenario: Documented
- **WHEN** the user reads the design
- **THEN** the limitation and the `--display`/`--area` workaround are stated
