import { formatTimestamp } from "../transcription/core.ts";
import type { HermesRun } from "../notes/generate.ts";
import { SuggestionCadence } from "./cadence.ts";
import { createManualNotes } from "./manual.ts";
import { buildSuggestionPrompt, lastClockMs } from "./prompt.ts";
import { applyKey, type ScreenState } from "./render.ts";
import { requestSuggestions } from "./suggest.ts";

export interface LiveSessionDeps {
  startedAtMs: number;
  now: () => number;
  readLive: () => string;
  readManual: () => string;
  appendManual: (text: string) => void;
  appendSuggestions: (text: string) => void;
  run: HermesRun;
}

const SUGGESTION_INTERVAL_MS = 60_000;
const SUGGESTION_RETRY_MS = 15_000;
const KEPT_SUGGESTIONS = 6;

// All behaviour of the live TUI except terminal IO: tailing, cadence, hermes, notes, typing.
export function createLiveSession(deps: LiveSessionDeps) {
  const cadence = new SuggestionCadence(deps.now, { intervalMs: SUGGESTION_INTERVAL_MS, retryMs: SUGGESTION_RETRY_MS });
  const notes = createManualNotes({ startedAtMs: deps.startedAtMs, now: deps.now, append: deps.appendManual });
  const state: ScreenState = { captions: [], suggestions: [], status: "", input: "" };
  let shownLiveChars = 0;
  let pending: Promise<void> = Promise.resolve();

  const elapsedMs = () => deps.now() - deps.startedAtMs;

  async function suggest() {
    const prompt = buildSuggestionPrompt({ transcript: deps.readLive(), manual: deps.readManual(), nowMs: elapsedMs() });
    state.status = "asking Hermes...";
    const outcome = await requestSuggestions(prompt, deps.run);
    if (!outcome.ok) {
      cadence.failed();
      state.status = `suggestions: ${outcome.status}`;
      return;
    }
    cadence.succeeded();
    state.status = "";
    state.suggestions.push(...outcome.suggestions);
    state.suggestions.splice(0, Math.max(0, state.suggestions.length - KEPT_SUGGESTIONS));
    deps.appendSuggestions(`## [${formatTimestamp(elapsedMs())}]\n${outcome.suggestions.map((s) => `- ${s}`).join("\n")}\n\n`);
  }

  return {
    state,
    get pending() {
      return pending;
    },

    async tick() {
      const live = deps.readLive();
      if (live.length > shownLiveChars) {
        state.captions.push(...live.slice(shownLiveChars).split("\n").filter(Boolean));
        shownLiveChars = live.length;
        cadence.transcriptReached(lastClockMs(live));
      }
      if (cadence.due()) {
        cadence.begin();
        pending = suggest().catch((error) => {
          cadence.failed();
          state.status = `suggestions: ${error instanceof Error ? error.message : String(error)}`;
        });
      }
    },

    key(key: string): { quit: boolean } {
      const result = applyKey(state.input, key);
      state.input = result.input;
      if (result.submit !== undefined) {
        const line = notes.add(result.submit);
        if (line) state.captions.push(line.trimEnd());
      }
      return { quit: result.quit === true };
    },
  };
}
