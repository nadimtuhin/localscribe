#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { pluginOptionsFromFlags } from "./plugins/index.ts";
import { activeRecording, list, RecorderError, start, stop } from "./recorder.ts";

const HELP = `localscribe - local screen recorder

  localscribe start [--out file.mp4] [--screen N] [--fps 30] [--mic N] [--no-mic] [--no-system-audio]
                   [--transcribe] [--live] [--notes]
  localscribe stop
  localscribe status
  localscribe list`;

const formatDuration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};
const optionalNumber = (value?: string) => (value === undefined ? undefined : Number(value));
const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      screen: { type: "string" },
      fps: { type: "string" },
      mic: { type: "string" },
      "no-mic": { type: "boolean" },
      "no-system-audio": { type: "boolean" },
      transcribe: { type: "boolean" },
      live: { type: "boolean" },
      notes: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  switch (positionals[0]) {
    case "start": {
      const state = await start({
        out: values.out,
        screen: optionalNumber(values.screen),
        fps: optionalNumber(values.fps),
        mic: values["no-mic"] ? false : optionalNumber(values.mic),
        systemAudio: !values["no-system-audio"],
        plugins: pluginOptionsFromFlags(values),
      });
      console.log(`recording -> ${state.file}\nstop with: localscribe stop`);
      return 0;
    }
    case "stop": {
      const result = await stop();
      if (result.forced) console.warn("warning: a recorder process did not exit in time and was killed; file may be truncated");
      if (result.mixError) {
        console.error(`mixing audio failed; raw parts kept:\n  ${result.keptParts.join("\n  ")}\n${result.mixError}`);
        return 1;
      }
      console.log(`saved ${result.file} (${formatDuration(result.durationMs)}, ${formatSize(result.bytes)})`);
      return 0;
    }
    case "status": {
      const state = activeRecording();
      if (!state) {
        console.log("not recording");
        return 1;
      }
      console.log(`recording ${state.file} (${formatDuration(Date.now() - Date.parse(state.startedAt))})`);
      return 0;
    }
    case "list": {
      const files = list();
      if (files.length === 0) console.log("no recordings yet");
      for (const f of files) console.log(`${f.modified.toLocaleString()}  ${formatSize(f.bytes).padStart(9)}  ${f.name}`);
      return 0;
    }
    default:
      console.log(HELP);
      return values.help ? 0 : 1;
  }
}

main(Bun.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof RecorderError ? error.message : error);
    process.exit(1);
  },
);
