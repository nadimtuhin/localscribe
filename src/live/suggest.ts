import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HermesRun } from "../notes/generate.ts";
import { buildHermesArgs } from "../notes/prompt.ts";
import { parseAnswer, parseSuggestions } from "./prompt.ts";

export const SUGGESTION_TIMEOUT_MS = 60_000;

// `suggestions` are the lines to show in the Hermes pane, whether from an auto suggestion or an answer.
export type SuggestionOutcome = { ok: true; suggestions: string[] } | { ok: false; status: string };

// Never throws: a failed call is a status line, not a crashed TUI.
async function requestLines(prompt: string, run: HermesRun, parse: (reply: string) => string[]): Promise<SuggestionOutcome> {
  const scratch = mkdtempSync(join(tmpdir(), "localscribe-live-"));
  try {
    const result = await run(buildHermesArgs(prompt, process.env.LOCALSCRIBE_HERMES_ARGS), scratch, SUGGESTION_TIMEOUT_MS);
    if (result.timedOut) return { ok: false, status: "hermes timed out" };
    if (result.exitCode !== 0) return { ok: false, status: `hermes failed (exit ${result.exitCode}): ${result.stderr.trim().split("\n")[0] ?? ""}` };
    const suggestions = parse(result.stdout);
    return suggestions.length ? { ok: true, suggestions } : { ok: false, status: "hermes returned nothing" };
  } catch (error) {
    return { ok: false, status: error instanceof Error ? error.message : String(error) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export const requestSuggestions = (prompt: string, run: HermesRun) => requestLines(prompt, run, parseSuggestions);
export const requestAnswer = (prompt: string, run: HermesRun) => requestLines(prompt, run, parseAnswer);
