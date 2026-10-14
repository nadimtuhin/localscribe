import type { parseArgs } from "node:util";

export const HELP = `localscribe - local screen recorder

  localscribe start [--out file.mp4] [--screen N] [--fps 30] [--mic N] [--no-mic] [--no-system-audio]
                   [--window <id|name>] [--area x,y,w,h] [--display N] [--engine sck|ffmpeg]
                   [--transcribe] [--live] [--notes] [--draw] [-d|--detach]
                   (--live opens the live view here; quitting it stops the recording. -d runs in the background)
  localscribe live        (reattach the live view to a recording started with --live -d)
  localscribe stop
  localscribe status
  localscribe list
  localscribe devices [--json]
  localscribe captions
  localscribe notes <mp4|transcript.md>`;

// One flag table for every command, so adding a flag never touches another command's file.
export const cliOptions = {
  out: { type: "string" },
  screen: { type: "string" },
  fps: { type: "string" },
  mic: { type: "string" },
  "no-mic": { type: "boolean" },
  "no-system-audio": { type: "boolean" },
  transcribe: { type: "boolean" },
  live: { type: "boolean" },
  notes: { type: "boolean" },
  draw: { type: "boolean" },
  detach: { type: "boolean", short: "d" },
  window: { type: "string" },
  area: { type: "string" },
  display: { type: "string" },
  engine: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

export interface CliArgs {
  positionals: string[];
  values: ReturnType<typeof parseArgs<{ options: typeof cliOptions; allowPositionals: true }>>["values"];
}

export type Command = (args: CliArgs) => Promise<number>;

export const formatDuration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};
export const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export const optionalNumber = (value?: string) => (value === undefined ? undefined : Number(value));

export const notImplemented = (name: string): Command => async () => {
  console.error(`${name}: not implemented`);
  return 1;
};
