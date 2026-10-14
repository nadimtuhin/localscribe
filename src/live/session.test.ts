import { describe, expect, test } from "bun:test";
import type { HermesResult, HermesRun } from "../notes/generate.ts";
import { createLiveSession, type LiveSessionDeps } from "./session.ts";

const START = 1_000_000;

function setup(run: HermesRun, overrides: Partial<LiveSessionDeps> = {}) {
  const clock = { now: START };
  const files = { live: "", manual: "", suggestions: "" };
  const prompts: string[] = [];
  const session = createLiveSession({
    startedAtMs: START,
    now: () => clock.now,
    readLive: () => files.live,
    readManual: () => files.manual,
    appendManual: (text) => void (files.manual += text),
    appendSuggestions: (text) => void (files.suggestions += text),
    ...overrides,
    run: async (args, cwd, timeout) => {
      prompts.push(args.at(-1)!);
      return run(args, cwd, timeout);
    },
  });
  return { clock, files, prompts, session };
}

const ok = (stdout: string): HermesRun => async () => ({ exitCode: 0, stdout, stderr: "", timedOut: false });
const minute = (n: number) => `[0${n}:00] them: said something at minute ${n}\n`;

describe("live session", () => {
  test("tick shows new caption lines as they arrive", async () => {
    const { files, session } = setup(ok("- x"));
    files.live = "[00:01] me: hello\n";
    await session.tick();
    files.live += "[00:05] them: hi\n";
    await session.tick();
    expect(session.state.captions).toEqual(["[00:01] me: hello", "[00:05] them: hi"]);
  });

  test("no hermes call before 60s of transcript", async () => {
    const { files, prompts, session } = setup(ok("- x"));
    files.live = "[00:01] me: hello\n[00:59] them: still short\n";
    await session.tick();
    await session.pending;
    expect(prompts).toEqual([]);
  });

  test("after 60s of speech it asks hermes once, shows and stores the suggestions", async () => {
    const { clock, files, prompts, session } = setup(ok("- Ask about budget\n- Probe the timeline"));
    clock.now = START + 70_000;
    files.live = "[00:01] me: hello\n[01:05] them: we shipped last quarter\n";
    files.manual = "[00:30] note: budget?\n";
    await session.tick();
    await session.pending;
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("we shipped last quarter");
    expect(prompts[0]).toContain("budget?");
    expect(session.state.suggestions).toEqual(["[01:10] Ask about budget", "[01:10] Probe the timeline"]);
    expect(files.suggestions).toBe("## [01:10]\n- Ask about budget\n- Probe the timeline\n\n");
    await session.tick();
    await session.pending;
    expect(prompts).toHaveLength(1); // no new speech yet
  });

  test("never two hermes calls at once", async () => {
    let release!: (r: HermesResult) => void;
    const slow: HermesRun = () => new Promise((resolve) => (release = resolve));
    const { files, prompts, session } = setup(slow);
    files.live = minute(1) + minute(2) + minute(3);
    await session.tick();
    files.live += minute(4) + minute(5);
    await session.tick();
    await session.tick();
    expect(prompts).toHaveLength(1);
    release({ exitCode: 0, stdout: "- done", stderr: "", timedOut: false });
    await session.pending;
    expect(session.state.suggestions).toEqual([expect.stringMatching(/^\[\d\d:\d\d\] done$/)]);
  });

  test("a failing hermes shows a dim status and the session keeps ticking", async () => {
    const failing: HermesRun = async () => ({ exitCode: 1, stdout: "", stderr: "auth expired", timedOut: false });
    const { files, session } = setup(failing);
    files.live = minute(1) + minute(2);
    await session.tick();
    await session.pending;
    expect(session.state.status).toContain("auth expired");
    expect(session.state.suggestions).toEqual([]);
    files.live += "[02:30] me: more\n";
    await session.tick();
    expect(session.state.captions.at(-1)).toBe("[02:30] me: more");
  });

  test("a hermes that throws never rejects tick or pending", async () => {
    const { files, session } = setup(async () => { throw new Error("hermes not found"); });
    files.live = minute(1) + minute(2);
    await session.tick();
    await expect(session.pending).resolves.toBeUndefined();
    expect(session.state.status).toContain("hermes not found");
  });

  test("a prompt that cannot be built shows the reason and is retried 15s later", async () => {
    let manualReadable = false;
    const { clock, files, prompts, session } = setup(ok("- Ask"), {
      readManual: () => {
        if (!manualReadable) throw new Error("notes unreadable");
        return "";
      },
    });
    files.live = minute(1) + minute(2);
    await session.tick();
    await session.pending;
    expect(session.state.status).toBe("suggestions: notes unreadable");
    manualReadable = true;
    clock.now += 14_000;
    await session.tick();
    await session.pending;
    expect(prompts).toEqual([]);
    clock.now += 1_000;
    await session.tick();
    await session.pending;
    expect(prompts).toHaveLength(1);
  });

  test("a failure that is not an Error is shown as plain text", async () => {
    const { files, session } = setup(ok("- Ask"), {
      appendSuggestions: () => { throw "quota exceeded"; },
    });
    files.live = minute(1) + minute(2);
    await session.tick();
    await session.pending;
    expect(session.state.status).toBe("suggestions: quota exceeded");
  });

  test("a question whose answer cannot be saved shows the reason under ask", async () => {
    const { session } = setup(ok("an answer"), {
      appendSuggestions: () => { throw new Error("read-only folder"); },
    });
    for (const ch of "?what is dns") session.key(ch);
    session.key("\r");
    await session.pending;
    expect(session.state.status).toBe("ask: read-only folder");
  });

  test("typed note is stamped with the recording clock, stored, and shown", () => {
    const { clock, files, session } = setup(ok("- x"));
    clock.now = START + 83_000;
    for (const ch of "ask about pricing") session.key(ch);
    expect(session.state.input).toBe("ask about pricing");
    session.key("\r");
    expect(files.manual).toBe("[01:23] note: ask about pricing\n");
    expect(session.state.input).toBe("");
    expect(session.state.captions.at(-1)).toBe("[01:23] note: ask about pricing");
  });

  test("key reports quit for ctrl-c", () => {
    const { session } = setup(ok("- x"));
    expect(session.key("\x03")).toEqual({ quit: true });
    expect(session.key("a")).toEqual({ quit: false });
  });
});
