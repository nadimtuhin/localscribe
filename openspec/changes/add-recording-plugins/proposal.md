## Why

Transcription, Hermes notes and the selection GUI all want to hook into a recording's lifecycle. Without a shared seam, three parallel changes would each edit `recorder.ts` and `cli.ts` and conflict. This change is the contract the other three build on.

## What Changes

- New `RecorderPlugin` interface (`src/plugins/types.ts`) with `start` and `stop` hooks.
- `start` runs enabled plugins after the recorder processes are up; `stop` runs them after the final mp4 exists, in registration order.
- Plugins persist their own data (e.g. sidecar pids) in `state.plugins[name]`.
- CLI flags are opt-in per plugin and passed through as `PluginOptions`.
- Sidecar file naming is fixed: `<base>.<suffix>` next to `<base>.mp4`.

## Capabilities

### New Capabilities
- `plugins`: lifecycle hooks and file contract for recording add-ons.

## Impact

- `src/plugins/types.ts`, `src/plugins/index.ts` (registry), small edits in `recorder.ts`, `state.ts`, `cli.ts`.
- No behaviour change when no plugin is enabled.
