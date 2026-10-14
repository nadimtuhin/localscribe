import { formatTimestamp } from "../transcription/core.ts";
import type { HermesRun } from "../notes/generate.ts";
import { isQuestionLine, SuggestionCadence } from "./cadence.ts";
import type { ContextFile } from "./context.ts";
import { createManualNotes } from "./manual.ts";
import { buildAskPrompt, buildSuggestionPrompt, lastClockMs, type Role } from "./prompt.ts";
import { applyKey, type ScreenState } from "./render.ts";
import { requestAnswer, requestSuggestions, type SuggestionOutcome } from "./suggest.ts";

export interface LiveSessionDeps {
  startedAtMs: number;
  now: () => number;
  readLive: () => string;
  readManual: () => string;
  appendManual: (text: string) => void;
  appendSuggestions: (text: string) => void;
  run: HermesRun;
  role?: Role;
  lang?: string;
  context?: ContextFile[];
}

const SUGGESTION_INTERVAL_MS = 60_000;
const SUGGESTION_RETRY_MS = 15_000;
const KEPT_SUGGESTIONS = 8;

// A submitted line starting with "?" is a question for Hermes; undefined means it is a note.
const questionOf = (line: string): string | undefined => {
  const text = line.trim();
  return text.startsWith("?") ? text.slice(1).replace(/\s+/g, " ").trim() : undefined;
};

// All behaviour of the live TUI except terminal IO: tailing, cadence, hermes, notes, typing.
// One loop owns the Hermes calls, so two never run at once and asked questions go before suggestions.
export function createLiveSession(deps: LiveSessionDeps) {
  const cadence = new SuggestionCadence(deps.now, { intervalMs: SUGGESTION_INTERVAL_MS, retryMs: SUGGESTION_RETRY_MS });
  const notes = createManualNotes({ startedAtMs: deps.startedAtMs, now: deps.now, append: deps.appendManual });
  const state: ScreenState = { captions: [], suggestions: [], status: "", input: "" };
  const questions: string[] = [];
  let shownLiveChars = 0;
  let draining = false;
  let pending: Promise<void> = Promise.resolve();

  const elapsedMs = () => deps.now() - deps.startedAtMs;
  const promptInput = () => ({ transcript: deps.readLive(), manual: deps.readManual(), nowMs: elapsedMs(), role: deps.role, lang: deps.lang, context: deps.context });

  function show(lines: string[]) {
    state.suggestions.push(...lines);
    state.suggestions.splice(0, Math.max(0, state.suggestions.length - KEPT_SUGGESTIONS));
  }

  async function suggest() {
    state.status = "asking Hermes...";
    const outcome = await requestSuggestions(buildSuggestionPrompt(promptInput()), deps.run);
    if (!outcome.ok) {
      cadence.failed();
      state.status = `suggestions: ${outcome.status}`;
      return;
    }
    cadence.succeeded();
    state.status = "";
    const stamp = formatTimestamp(elapsedMs());
    show(outcome.suggestions.map((line) => `[${stamp}] ${line}`));
    deps.appendSuggestions(`## [${stamp}]\n${outcome.suggestions.map((s) => `- ${s}`).join("\n")}\n\n`);
  }

  async function answer(question: string) {
    state.status = "asking Hermes...";
    const outcome: SuggestionOutcome = await requestAnswer(buildAskPrompt({ question, ...promptInput() }), deps.run);
    if (!outcome.ok) {
      state.status = `ask: ${outcome.status}`;
      return;
    }
    state.status = "";
    const [first = "", ...rest] = outcome.suggestions;
    const stamp = formatTimestamp(elapsedMs());
    show([`[${stamp}] Q: ${question}`, `A: ${first}`, ...rest.map((line) => `   ${line}`)]);
    deps.appendSuggestions(`## [${stamp}] Q: ${question}\n${outcome.suggestions.join("\n")}\n\n`);
  }

  const failure = (prefix: string) => (error: unknown) => {
    state.status = `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
  };

  type Job = () => Promise<void>;
  function nextJob(allowSuggestion: boolean): Job | undefined {
    const question = questions.shift();
    if (question !== undefined) return () => answer(question).catch(failure("ask"));
    if (!allowSuggestion || !cadence.due()) return undefined;
    cadence.begin();
    return () => suggest().catch((error) => {
      cadence.failed();
      failure("suggestions")(error);
    });
  }

  async function drain() {
    draining = true;
    try {
      // Only a tick starts a suggestion; once a call ends, just the queued questions follow it.
      for (let job = nextJob(true); job; job = nextJob(false)) await job();
    } finally {
      draining = false;
    }
  }

  function pump() {
    if (!draining) pending = drain();
  }

  return {
    state,
    get pending() {
      return pending;
    },

    async tick() {
      const live = deps.readLive();
      if (live.length > shownLiveChars) {
        const fresh = live.slice(shownLiveChars).split("\n").filter(Boolean);
        state.captions.push(...fresh);
        shownLiveChars = live.length;
        cadence.transcriptReached(lastClockMs(live));
        if (fresh.some(isQuestionLine)) cadence.questionHeard();
      }
      pump();
    },

    key(key: string): { quit: boolean } {
      const result = applyKey(state.input, key);
      state.input = result.input;
      if (result.submit !== undefined) {
        const question = questionOf(result.submit);
        if (question === undefined) {
          const line = notes.add(result.submit);
          if (line) state.captions.push(line.trimEnd());
        } else if (question) {
          questions.push(question);
          state.status = "question queued for Hermes";
          pump();
        }
      }
      return { quit: result.quit === true };
    },
  };
}
