import { ANNOTATE, ensureHelper } from "../recorder.ts";
import { realRunner, type ProcessRunner } from "../runner.ts";
import type { RecorderPlugin } from "./types.ts";

export interface AnnotationDeps {
  runner: ProcessRunner;
  ensureHelper: () => string;
}

const realDeps = (): AnnotationDeps => ({ runner: realRunner, ensureHelper: () => ensureHelper(realRunner, ANNOTATE) });

// Screen-drawing overlay. The recorder interrupts the sidecar on stop, so there is no stop hook.
export function createAnnotationPlugin(deps: AnnotationDeps = realDeps()): RecorderPlugin {
  return {
    name: "annotation",
    enabled: (options) => options.draw === true,
    async start(ctx) {
      const parent = ctx.recorderPid === undefined ? [] : ["--parent-pid", String(ctx.recorderPid)];
      ctx.addSidecar(deps.runner.spawnDetached([deps.ensureHelper(), ...parent], `${ctx.base}.annotate.log`), "localscribe-annotate");
      ctx.log("annotation: Ctrl+Opt+D toggles drawing (Shift = arrow, Opt = rectangle), Ctrl+Opt+C clears");
      return null;
    },
  };
}

export const annotation = createAnnotationPlugin();
