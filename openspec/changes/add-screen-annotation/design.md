## Overlay

One `NSWindow` per target display: borderless, `.statusBar`+ level, `backgroundColor = .clear`, `isOpaque = false`, `ignoresMouseEvents = true` by default, `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]`. The helper is an accessory app (`NSApp.setActivationPolicy(.accessory)`): no Dock icon.

Draw mode: `ignoresMouseEvents = false`, crosshair cursor, the window becomes key. Leaving it restores click-through. Strokes live in a model array rendered by one `NSView.draw`. Modifier at mouse-down picks the tool: none = pen, Shift = arrow, Opt = rectangle.

## Hotkeys

Carbon `RegisterEventHotKey` (Ctrl+Opt+D, Ctrl+Opt+C), delivered through the application event target. Unlike `CGEventTap` it needs no Accessibility or Input Monitoring permission. `Esc` is handled by the key window while in draw mode (no global Esc grab).

## Capture

- ffmpeg avfoundation grabs the composited display, so the overlay is in the video with no work.
- SCK engine: `capture.swift` builds `SCContentFilter(display:excludingWindows: [])`, so the overlay is not excluded. No change needed.
- `--window` capture uses `desktopIndependentWindow`, which renders only that window. The overlay does NOT appear. Documented limitation; use `--display`/`--area` with `--draw`.
- The overlay targets the main display (or `--display N` index later); multi-display is out of scope.

## Plugin

`annotation.enabled = options.draw === true`. `start` calls an injected `ensureHelper()` (compile-on-first-use like `livesys`), then `runner.spawnDetached([helper, "--parent-pid", pid], "<base>.annotate.log")` and `ctx.addSidecar(pid, "localscribe-annotate")`. No `stop` hook: the recorder interrupts sidecars. The helper handles SIGINT/SIGTERM by exiting 0; `--parent-pid` watchdog polls `kill(pid, 0)`.

## Debug

`--demo-stroke` (or env `LOCALSCRIBE_DEMO_STROKE`, since the plugin spawns the helper) draws a fixed diagonal red line at launch, for smoke tests where no human can drag. Not a `localscribe start` flag.

## Non-goals

Fading strokes, colors/width options, undo, per-window overlay, persisting strokes to a sidecar file.
