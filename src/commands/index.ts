import { parseArgs } from "node:util";
import { isLanguageToken } from "../transcription/language.ts";
import { captionsCommand } from "./captions.ts";
import { copyCommand } from "./copy.ts";
import { devicesCommand } from "./devices.ts";
import { lastCommand } from "./last.ts";
import { listCommand } from "./list.ts";
import { liveCommand } from "./live.ts";
import { liveWorkerCommand } from "./live-worker.ts";
import { notesCommand } from "./notes.ts";
import { openCommand } from "./open.ts";
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
  open: openCommand,
  copy: copyCommand,
  last: lastCommand,
};

// Merges multi-word or repeated language flags like `--lang en bn` into `--lang en,bn`.
export function normalizeLanguageArgs(argv: string[]): string[] {
  const result: string[] = [];
  const langTokens: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--lang" && i + 1 < argv.length) {
      const parts = argv[i + 1]!.replace(/,/g, " ").split(/\s+/).filter(Boolean);
      langTokens.push(...parts);
      i += 2;
      while (i < argv.length && !argv[i]!.startsWith("-") && isLanguageToken(argv[i]!)) {
        langTokens.push(argv[i]!);
        i++;
      }
      continue;
    }
    if (arg.startsWith("--lang=")) {
      const parts = arg.slice("--lang=".length).replace(/,/g, " ").split(/\s+/).filter(Boolean);
      langTokens.push(...parts);
      i++;
      while (i < argv.length && !argv[i]!.startsWith("-") && isLanguageToken(argv[i]!)) {
        langTokens.push(argv[i]!);
        i++;
      }
      continue;
    }
    result.push(arg);
    i++;
  }
  if (langTokens.length > 0) {
    result.push("--lang", langTokens.join(","));
  }
  return result;
}

export async function runCli(argv: string[]): Promise<number> {
  const normalized = normalizeLanguageArgs(argv);
  const { positionals, values } = parseArgs({ args: normalized, allowPositionals: true, options: cliOptions });
  const command = commands[positionals[0] ?? ""];
  if (!command || values.help) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }
  return command({ positionals: positionals.slice(1), values });
}
