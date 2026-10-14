import { parseArgs } from "node:util";
import { captionsCommand } from "./captions.ts";
import { devicesCommand } from "./devices.ts";
import { listCommand } from "./list.ts";
import { liveCommand } from "./live.ts";
import { liveWorkerCommand } from "./live-worker.ts";
import { notesCommand } from "./notes.ts";
import { cliOptions, HELP, type Command } from "./shared.ts";
import { startCommand } from "./start.ts";
import { statusCommand } from "./status.ts";
import { stopCommand } from "./stop.ts";

const commands: Record<string, Command> = {
  start: startCommand,
  stop: stopCommand,
  status: statusCommand,
  list: listCommand,
  devices: devicesCommand,
  captions: captionsCommand,
  notes: notesCommand,
  live: liveCommand,
  "live-worker": liveWorkerCommand,
};

export async function runCli(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: cliOptions });
  const command = commands[positionals[0] ?? ""];
  if (!command || values.help) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }
  return command({ positionals: positionals.slice(1), values });
}
