import { liveOptionsFromFlags, LiveOptionsError } from "../live/options.ts";
import { annotation } from "./annotation.ts";
import { live } from "./live.ts";
import { notes as notesPlugin } from "./notes.ts";
import { transcription } from "./transcription.ts";
import { requireWhisperModel } from "../transcription/core.ts";
import { DEFAULT_LANGUAGE, parseLanguage } from "../transcription/language.ts";
import type { PluginContext, PluginOptions, RecorderPlugin, StartedContext } from "./types.ts";

export interface PluginFlags { transcribe?: boolean; draw?: boolean; live?: boolean; notes?: boolean; "no-system-audio"?: boolean; role?: string; context?: string[]; lang?: string }

// Live captions and notes are both built on the final transcript, so they turn it on.
// --live also implies notes: the speaker-labelled live transcript is what they summarise.
export function pluginOptionsFromFlags(flags: PluginFlags): PluginOptions {
  const liveCaptions = flags.live === true;
  const notes = flags.notes === true || liveCaptions;
  if (!liveCaptions && (flags.role !== undefined || flags.context !== undefined)) throw new LiveOptionsError("--role and --context need --live");
  return {
    transcribe: flags.transcribe === true || liveCaptions || notes,
    liveCaptions,
    notes,
    systemAudio: flags["no-system-audio"] !== true,
    draw: flags.draw === true,
    lang: parseLanguage(flags.lang ?? DEFAULT_LANGUAGE),
    ...(liveCaptions ? liveOptionsFromFlags(flags) : {}),
  };
}

// Order matters: stop hooks run in this order, so notes can read the transcript.
// Each change fills in its own file under src/plugins/; this list never needs to change again.
export const plugins: RecorderPlugin[] = [live, transcription, notesPlugin, annotation];

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

// Transcription runs only after the recording, so a missing model would otherwise be found too late.
export function requireModelForStart(options: PluginOptions, env: Record<string, string | undefined>, exists?: (path: string) => boolean): void {
  if (options.transcribe) requireWhisperModel(env, options.lang ?? DEFAULT_LANGUAGE, exists);
}
