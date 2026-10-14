## 1. Contract (built before fan-out)

- [x] 1.1 `src/plugins/types.ts` with the interfaces from design.md
- [x] 1.2 `src/plugins/index.ts` registry (empty array) + `runStartHooks` / `runStopHooks` with failure isolation
- [x] 1.3 Tests: hook order, failure isolation, disabled plugins skipped (fake plugins at the registry seam)
- [x] 1.4 Wire into `recorder.start`/`stop`; persist `pluginOptions` + `plugins` in state
- [x] 1.5 CLI flags `--transcribe`, `--live`, `--notes` parsed into `PluginOptions`
