## Why

When demoing or explaining something on screen, the user wants to draw on it (circle a button, point an arrow) and have those marks appear in the recorded video.

## What Changes

- New flag `start --draw` and plugin `annotation` (`src/plugins/annotation.ts`, appended to the registry after `notes`).
- New Swift helper `native/annotate.swift` built to `bin/localscribe-annotate`: a transparent, borderless, always-on-top, click-through overlay window over the recorded display, visible on all spaces.
- Global hotkeys via Carbon `RegisterEventHotKey` (no Accessibility permission): `Ctrl+Opt+D` toggles draw mode, `Ctrl+Opt+C` clears. `Esc` also leaves draw mode.
- In draw mode: drag = red freehand pen, Shift-drag = arrow, Opt-drag = rectangle. Strokes stay until cleared.
- Live TUI header mentions the `Ctrl+Opt+D draw` key (text only).

## Capabilities

### New Capabilities
- `screen-annotation`: draw on screen during a recording; marks appear in the video.

## Impact

- New: `native/annotate.swift`, `src/plugins/annotation.ts`, `src/annotate/helper.ts` (build on demand).
- Touched: `PluginOptions.draw`, `pluginOptionsFromFlags`, plugin registry (one line), CLI flag table and help, live TUI header text.
- The helper runs as a sidecar and exits on SIGINT/SIGTERM or when the recorder process is gone.
