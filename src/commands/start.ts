import { listSources } from "../capture/devices.ts";
import { parsePick, resolveSelection, type Selection, type SelectionFlags } from "../capture/selection.ts";
import { ensureToolPath } from "../ffmpeg.ts";
import { pluginOptionsFromFlags, requireModelForStart } from "../plugins/index.ts";
import { CAPTURE, ensureHelper, RecorderError, start } from "../recorder.ts";
import { realRunner, type ProcessRunner } from "../runner.ts";
import { liveCommand } from "./live.ts";
import { optionalNumber, type Command } from "./shared.ts";
import { stopCommand } from "./stop.ts";

// `--window pick` / `--area pick` open an overlay in the helper and substitute what the user chose.
function withPickedFlags(flags: SelectionFlags, runner: ProcessRunner, captureHelper: string): SelectionFlags {
  const kind = flags.window === "pick" ? "window" : "area";
  if (flags.window !== "pick" && flags.area !== "pick") return flags;
  const { window: _window, area: _area, ...rest } = flags;
  return { ...rest, ...parsePick(runner.run([captureHelper, "--pick", kind]).stdout) };
}

export function selectionForStart(flags: SelectionFlags, runner: ProcessRunner, captureHelper: string): Selection | undefined {
  if (flags.window === undefined && flags.area === undefined && flags.display === undefined) return undefined;
  return resolveSelection(withPickedFlags(flags, runner, captureHelper), listSources(runner, captureHelper));
}

const parseEngine = (value?: string) => {
  if (value !== undefined && value !== "sck" && value !== "ffmpeg") throw new RecorderError(`--engine expects sck or ffmpeg, got "${value}"`);
  return value;
};

export const startMessage = (file: string, liveCaptions: boolean) =>
  `recording -> ${file}\nstop with: localscribe stop` + (liveCaptions ? "\nlive assist: run `localscribe live` in another pane" : "");

export const runsLiveInForeground = (flags: { live?: boolean; detach?: boolean }, isTty: boolean) =>
  flags.live === true && flags.detach !== true && isTty;

export const startCommand: Command = async (args) => {
  const { values } = args;
  ensureToolPath();
  const engine = parseEngine(values.engine);
  const plugins = pluginOptionsFromFlags(values);
  requireModelForStart(plugins, process.env);
  const wantsSelection = values.window !== undefined || values.area !== undefined || values.display !== undefined;
  const selection = wantsSelection ? selectionForStart(values, realRunner, ensureHelper(realRunner, CAPTURE)) : undefined;
  const state = await start({
    out: values.out,
    screen: optionalNumber(values.screen),
    fps: optionalNumber(values.fps),
    mic: values["no-mic"] ? false : optionalNumber(values.mic),
    systemAudio: !values["no-system-audio"],
    plugins,
    selection,
    engine,
  });
  if (!runsLiveInForeground(values, Boolean(process.stdin.isTTY && process.stdout.isTTY))) {
    console.log(startMessage(state.file, values.live === true));
    return 0;
  }
  const liveExit = await liveCommand(args);
  return Math.max(liveExit, await stopCommand(args));
};
