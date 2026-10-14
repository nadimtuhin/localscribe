import { ANNOTATE, ensureHelper } from "../recorder.ts";
import { realRunner, type ProcessRunner } from "../runner.ts";
import type { RecorderPlugin } from "./types.ts";

export interface AnnotationDeps {
  runner: ProcessRunner;
  ensureHelper: typeof ensureHelper;
}

// Screen-drawing overlay. The recorder interrupts the sidecar on stop, so there is no stop hook.
// Defaults are read when the hook runs, not at import: recorder.ts and the plugin list import each other.
export function createAnnotationPlugin(deps: Partial<AnnotationDeps> = {}): RecorderPlugin {
  return {
    name: "annotation",
    enabled: (options) => options.draw === true,
    async start(ctx) {
      const { runner = realRunner, ensureHelper: build = ensureHelper } = deps;
      const parent = ctx.recorderPid === undefined ? [] : ["--parent-pid", String(ctx.recorderPid)];
      ctx.addSidecar(runner.spawnDetached([build(runner, ANNOTATE), ...parent], `${ctx.base}.annotate.log`), "localscribe-annotate");
      ctx.log("annotation: Ctrl+Opt+D toggles drawing (Shift = arrow, Opt = rectangle), Ctrl+Opt+C clears");
      return null;
    },
  };
}

export const annotation = createAnnotationPlugin();
