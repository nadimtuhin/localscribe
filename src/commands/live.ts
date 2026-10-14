import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createLiveSession } from "../live/session.ts";
import { renderScreen } from "../live/render.ts";
import { realHermesRun } from "../notes/generate.ts";
import { activeRecording } from "../recorder.ts";
import type { RecordingState } from "../state.ts";
import type { Command } from "./shared.ts";

const REFRESH_MS = 500;
const ENTER_SCREEN = "\x1b[?1049h\x1b[2J";
const LEAVE_SCREEN = "\x1b[?1049l";

export interface LiveCommandDeps {
  active: () => RecordingState | null;
  isTty: boolean;
  printError: (text: string) => void;
  runTui: (state: RecordingState) => Promise<void>;
}

const readIfExists = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");

// Terminal IO only; every behaviour lives in createLiveSession and renderScreen.
async function runRealTui(recording: RecordingState): Promise<void> {
  const base = recording.file.replace(/\.mp4$/, "");
  const session = createLiveSession({
    startedAtMs: Date.parse(recording.startedAt),
    now: Date.now,
    readLive: () => readIfExists(`${base}.live.txt`),
    readManual: () => readIfExists(`${base}.manual.md`),
    appendManual: (text) => appendFileSync(`${base}.manual.md`, text),
    appendSuggestions: (text) => appendFileSync(`${base}.suggestions.md`, text),
    run: realHermesRun,
  });
  session.state.status = "last 5 min of transcript + notes go to Hermes (may reach a cloud model)";

  const draw = () => process.stdout.write(renderScreen(session.state, { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 }));
  let quit = false;
  const onData = (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    // Pasted text arrives as one chunk; escape sequences (arrows) must stay whole.
    for (const key of text.startsWith("\x1b") ? [text] : [...text]) if (session.key(key).quit) quit = true;
    draw();
  };

  process.stdout.write(ENTER_SCREEN);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", onData);
  try {
    while (!quit && activeRecording()) {
      await session.tick();
      draw();
      await Bun.sleep(REFRESH_MS);
    }
  } finally {
    process.stdin.off("data", onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write(LEAVE_SCREEN);
  }
}

const realDeps: LiveCommandDeps = {
  active: () => activeRecording(),
  isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  printError: (text) => void console.error(text),
  runTui: runRealTui,
};

export function createLiveCommand(deps: LiveCommandDeps = realDeps): Command {
  return async () => {
    const recording = deps.active();
    if (!recording) {
      deps.printError("not recording");
      return 1;
    }
    if (!recording.pluginOptions?.liveCaptions) {
      deps.printError("this recording has no live assist (start it with --live)");
      return 1;
    }
    if (!deps.isTty) {
      deps.printError("live needs an interactive terminal");
      return 1;
    }
    await deps.runTui(recording);
    return 0;
  };
}

export const liveCommand = createLiveCommand();
