import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { loadContextFiles } from "../live/context.ts";
import { createLiveSession } from "../live/session.ts";
import { renderScreen } from "../live/render.ts";
import { realHermesRun, type HermesRun } from "../notes/generate.ts";
import { activeRecording, readActive } from "../recorder.ts";
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

// What the live view needs from the terminal and the clock; tests supply fakes.
export interface TuiIo {
  stdin: {
    setRawMode(raw: boolean): unknown;
    resume(): unknown;
    pause(): unknown;
    on(event: "data", listener: (chunk: Buffer) => void): unknown;
    off(event: "data", listener: (chunk: Buffer) => void): unknown;
  };
  stdout: { write(text: string): unknown; columns?: number; rows?: number };
  sleep: (ms: number) => Promise<void>;
  readActive: () => RecordingState | null;
  now: () => number;
  run: HermesRun;
}

const readIfExists = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");

// Terminal IO only; every behaviour lives in createLiveSession and renderScreen.
export function createTui(io: TuiIo): (recording: RecordingState) => Promise<void> {
  return async (recording) => {
    const base = recording.file.replace(/\.mp4$/, "");
    const context = loadContextFiles(recording.pluginOptions?.contextFiles ?? [], (path) => readFileSync(path, "utf8"));
    const session = createLiveSession({
      role: recording.pluginOptions?.role,
      lang: recording.pluginOptions?.lang,
      context,
      startedAtMs: Date.parse(recording.startedAt),
      now: io.now,
      readLive: () => readIfExists(`${base}.live.txt`),
      readManual: () => readIfExists(`${base}.manual.md`),
      appendManual: (text) => appendFileSync(`${base}.manual.md`, text),
      appendSuggestions: (text) => appendFileSync(`${base}.suggestions.md`, text),
      run: io.run,
    });
    const contextNote = context.length ? ` + ${context.length} context file(s)` : "";
    session.state.status = `last 5 min of transcript + notes${contextNote} go to Hermes (may reach a cloud model). Type ?question to ask it.`;

    const draw = () => io.stdout.write(renderScreen(session.state, { cols: io.stdout.columns || 80, rows: io.stdout.rows || 24 }));
    let quit = false;
    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      // Pasted text arrives as one chunk; escape sequences (arrows) must stay whole.
      for (const key of text.startsWith("\x1b") ? [text] : [...text]) if (session.key(key).quit) quit = true;
      draw();
    };

    io.stdout.write(ENTER_SCREEN);
    io.stdin.setRawMode(true);
    io.stdin.resume();
    io.stdin.on("data", onData);
    try {
      while (!quit && io.readActive()) {
        await session.tick();
        draw();
        await io.sleep(REFRESH_MS);
      }
    } finally {
      io.stdin.off("data", onData);
      io.stdin.setRawMode(false);
      io.stdin.pause();
      io.stdout.write(LEAVE_SCREEN);
    }
  };
}

const realDeps: LiveCommandDeps = {
  active: activeRecording,
  isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  printError: console.error,
  runTui: createTui({ stdin: process.stdin, stdout: process.stdout, sleep: Bun.sleep, readActive, now: Date.now, run: realHermesRun }),
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
    try {
      await deps.runTui(recording);
    } catch (error) {
      deps.printError(error instanceof Error ? error.message : String(error));
      return 1;
    }
    return 0;
  };
}

export const liveCommand = createLiveCommand();
