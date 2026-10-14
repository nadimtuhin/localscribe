import { pluginOptionsFromFlags } from "../plugins/index.ts";
import { start } from "../recorder.ts";
import { optionalNumber, type Command } from "./shared.ts";

export const startMessage = (file: string, liveCaptions: boolean) =>
  `recording -> ${file}\nstop with: localscribe stop` + (liveCaptions ? "\nlive assist: run `localscribe live` in another pane" : "");

export const startCommand: Command = async ({ values }) => {
  const state = await start({
    out: values.out,
    screen: optionalNumber(values.screen),
    fps: optionalNumber(values.fps),
    mic: values["no-mic"] ? false : optionalNumber(values.mic),
    systemAudio: !values["no-system-audio"],
    plugins: pluginOptionsFromFlags(values),
  });
  console.log(startMessage(state.file, values.live === true));
  return 0;
};
