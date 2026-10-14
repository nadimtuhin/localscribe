import { notes as notesPlugin } from "./notes.ts";
import { transcription } from "./transcription.ts";
import type { PluginContext, PluginOptions, RecorderPlugin, StartedContext } from "./types.ts";

export interface PluginFlags { transcribe?: boolean; live?: boolean; notes?: boolean }

// Live captions and notes are both built on the final transcript, so they turn it on.
export function pluginOptionsFromFlags(flags: PluginFlags): PluginOptions {
  const liveCaptions = flags.live === true;
  const notes = flags.notes === true;
  return { transcribe: flags.transcribe === true || liveCaptions || notes, liveCaptions, notes };
}

// Order matters: stop hooks run in this order, so notes can read the transcript.
// Each change fills in its own file under src/plugins/; this list never needs to change again.
export const plugins: RecorderPlugin[] = [transcription, notesPlugin];

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Returns the start result of each enabled plugin, keyed by name, for the state file.
export async function runStartHooks(registry: RecorderPlugin[], ctx: StartedContext): Promise<Record<string, unknown>> {
  const states: Record<string, unknown> = {};
  for (const plugin of registry) {
    if (!plugin.enabled(ctx.options)) continue;
    try {
      states[plugin.name] = plugin.start ? await plugin.start(ctx) : null;
    } catch (error) {
      ctx.log(`${plugin.name}: ${errorMessage(error)}`);
    }
  }
  return states;
}

export interface StopHooksContext extends PluginContext {
  file: string;
  startedAt: string;
  durationMs: number;
  pluginStates: Record<string, unknown>;
}

// A failing plugin is reported and skipped; it never fails the recording.
export async function runStopHooks(registry: RecorderPlugin[], ctx: StopHooksContext): Promise<void> {
  const { pluginStates, ...shared } = ctx;
  for (const plugin of registry) {
    if (!plugin.enabled(ctx.options) || !plugin.stop) continue;
    try {
      await plugin.stop({ ...shared, pluginState: pluginStates[plugin.name] });
    } catch (error) {
      ctx.log(`${plugin.name}: ${errorMessage(error)}`);
    }
  }
}
