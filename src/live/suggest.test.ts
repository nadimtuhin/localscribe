import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import type { HermesResult, HermesRun } from "../notes/generate.ts";
import { requestSuggestions, SUGGESTION_TIMEOUT_MS } from "./suggest.ts";

const reply = (over: Partial<HermesResult>): HermesRun => async () => ({ exitCode: 0, stdout: "", stderr: "", timedOut: false, ...over });

describe("requestSuggestions", () => {
  test("runs the hardened hermes invocation in a temp cwd that is removed afterwards", async () => {
    let seen: { args: string[]; cwd: string; timeout: number } | undefined;
    const run: HermesRun = async (args, cwd, timeout) => {
      seen = { args, cwd, timeout };
      expect(existsSync(cwd)).toBe(true);
      return { exitCode: 0, stdout: "- ask why\n", stderr: "", timedOut: false };
    };
    const result = await requestSuggestions("PROMPT", run);
    expect(result).toEqual({ ok: true, suggestions: ["ask why"] });
    expect(seen!.args.slice(-5)).toEqual(["--ignore-rules", "-t", "todo", "-z", "PROMPT"]);
    expect(seen!.timeout).toBe(SUGGESTION_TIMEOUT_MS);
    expect(existsSync(seen!.cwd)).toBe(false);
  });

  test("timeout, non-zero exit, empty reply and a throwing runner all become a status, never a throw", async () => {
    expect(await requestSuggestions("p", reply({ timedOut: true }))).toEqual({ ok: false, status: "hermes timed out" });
    expect(await requestSuggestions("p", reply({ exitCode: 2, stderr: "boom\nmore" }))).toEqual({ ok: false, status: "hermes failed (exit 2): boom" });
    expect(await requestSuggestions("p", reply({ stdout: "  " }))).toEqual({ ok: false, status: "hermes returned nothing" });
    const throwing: HermesRun = async () => { throw new Error("hermes not found"); };
    expect(await requestSuggestions("p", throwing)).toEqual({ ok: false, status: "hermes not found" });
  });
});
