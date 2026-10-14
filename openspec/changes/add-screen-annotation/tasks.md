## 1. Plugin (TDD)

- [x] 1.1 `--draw` flag -> `PluginOptions.draw`; help text
- [x] 1.2 `annotation` plugin: enabled, start spawns helper with `--parent-pid`, registers sidecar; registry order
- [x] 1.3 Live TUI header mentions Ctrl+Opt+D

## 2. Helper

- [x] 2.1 `native/annotate.swift` overlay, hotkeys, tools, `--parent-pid`, `--demo-stroke`
- [x] 2.2 build on demand (shared `ensureHelper`, `ANNOTATE` in recorder.ts) to `bin/localscribe-annotate`

## 3. Verification

- [x] 3.1 Real 8 s recording with `--draw` + demo stroke; red line visible in extracted frame; no helper left after stop
