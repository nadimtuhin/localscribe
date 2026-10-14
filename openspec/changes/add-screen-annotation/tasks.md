## 1. Plugin (TDD)

- [ ] 1.1 `--draw` flag -> `PluginOptions.draw`; help text
- [ ] 1.2 `annotation` plugin: enabled, start spawns helper with `--parent-pid`, registers sidecar; registry order
- [ ] 1.3 Live TUI header mentions Ctrl+Opt+D

## 2. Helper

- [ ] 2.1 `native/annotate.swift` overlay, hotkeys, tools, `--parent-pid`, `--demo-stroke`
- [ ] 2.2 `src/annotate/helper.ts` build on demand to `bin/localscribe-annotate`

## 3. Verification

- [ ] 3.1 Real 8 s recording with `--draw` + demo stroke; red line visible in extracted frame; no helper left after stop
