import { generateAndReport, realHermesRun, type HermesRun } from "../notes/generate.ts";
import type { RecorderPlugin } from "./types.ts";

export const createNotesPlugin = (run: HermesRun): RecorderPlugin => ({
  name: "notes",
  enabled: (options) => options.notes === true,
  async stop(ctx) {
    const result = await generateAndReport(
      ctx.base,
      { file: ctx.file, startedAt: ctx.startedAt, durationMs: ctx.durationMs, role: ctx.options.role, lang: ctx.options.lang, name: ctx.options.name },
      ctx.log,
      run,
    );
    return result.file ? { file: result.file } : undefined;
  },
});

export const notes = createNotesPlugin(realHermesRun);
