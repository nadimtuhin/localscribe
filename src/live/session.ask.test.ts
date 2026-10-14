import { describe, expect, test } from "bun:test";
import type { HermesResult, HermesRun } from "../notes/generate.ts";
import type { ContextFile } from "./context.ts";
import type { Role } from "./prompt.ts";
import { createLiveSession } from "./session.ts";

const START = 1_000_000;
const reply = (stdout: string): HermesResult => ({ exitCode: 0, stdout, stderr: "", timedOut: false });
const isAsk = (prompt: string) => prompt.includes("Question from the user:");

function setup(run: HermesRun, extra: { role?: Role; context?: ContextFile[] } = {}) {
  const clock = { now: START };
  const files = { live: "", manual: "", suggestions: "" };
  const prompts: string[] = [];
  let running = 0;
  let maxRunning = 0;
  const session = createLiveSession({
    startedAtMs: START,
    now: () => clock.now,
    readLive: () => files.live,
    readManual: () => files.manual,
    appendManual: (text) => void (files.manual += text),
    appendSuggestions: (text) => void (files.suggestions += text),
    run: async (args, cwd, timeout) => {
      prompts.push(args.at(-1)!);
      maxRunning = Math.max(maxRunning, ++running);
      try {
        return await run(args, cwd, timeout);
      } finally {
        running--;
      }
    },
    ...extra,
  });
  const type = (text: string) => {
    for (const ch of text) session.key(ch);
    session.key("\r");
  };
  return { clock, files, prompts, session, type, maxRunning: () => maxRunning };
}

describe("inline ask", () => {
  test("a ? line goes to hermes with recent transcript, notes and context, and is not a note", async () => {
    const { clock, files, prompts, session, type } = setup(async () => reply("Budget was flat.\nNo growth planned."), { context: [{ path: "/x/brief.md", text: "Acme brief" }] });
    clock.now = START + 83_000;
    files.live = "[01:00] them: budget is flat this year\n";
    files.manual = "[01:10] note: pricing\n";
    type("?what did they say about budget");
    await session.pending;
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("what did they say about budget");
    expect(prompts[0]).toContain("budget is flat this year");
    expect(prompts[0]).toContain("pricing");
    expect(prompts[0]).toContain("Acme brief");
    expect(files.manual).toBe("[01:10] note: pricing\n");
    expect(session.state.suggestions).toEqual(["[01:23] Q: what did they say about budget", "A: Budget was flat.", "   No growth planned."]);
    expect(files.suggestions).toBe("## [01:23] Q: what did they say about budget\nBudget was flat.\nNo growth planned.\n\n");
  });

  test("a bare ? does nothing and plain lines stay notes", async () => {
    const { files, prompts, session, type } = setup(async () => reply("x"));
    type("?");
    type("  ?   ");
    type("ask about pricing");
    await session.pending;
    expect(prompts).toEqual([]);
    expect(files.manual).toBe("[00:00] note: ask about pricing\n");
  });

  test("a failed ask shows a status and stores nothing", async () => {
    const { files, session, type } = setup(async () => ({ exitCode: 1, stdout: "", stderr: "auth expired", timedOut: false }));
    type("?why");
    await session.pending;
    expect(session.state.status).toContain("auth expired");
    expect(session.state.suggestions).toEqual([]);
    expect(files.suggestions).toBe("");
  });
});

describe("queue", () => {
  const minute = (n: number) => `[0${n}:00] them: said something at minute ${n}\n`;

  test("a question typed during an auto call waits, then runs before the next auto, never concurrently", async () => {
    const releases: Array<() => void> = [];
    const slow: HermesRun = () => new Promise((resolve) => releases.push(() => resolve(reply("- suggestion"))));
    const { files, prompts, session, type, maxRunning } = setup(slow);
    files.live = minute(1) + minute(2);
    await session.tick();
    expect(prompts).toHaveLength(1);
    expect(isAsk(prompts[0]!)).toBe(false);

    type("?first");
    type("?second");
    files.live += minute(3) + minute(4); // another auto suggestion is now due too
    await session.tick();
    expect(prompts).toHaveLength(1);

    releases.shift()!();
    await Bun.sleep(0);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Question from the user: first");

    releases.shift()!();
    await Bun.sleep(0);
    expect(prompts[2]).toContain("Question from the user: second");

    releases.shift()!();
    await session.pending;
    expect(prompts).toHaveLength(3); // the due suggestion waits for the next tick
    await session.tick();
    expect(isAsk(prompts[3]!)).toBe(false);
    releases.shift()!();
    await session.pending;
    expect(prompts).toHaveLength(4);
    expect(maxRunning()).toBe(1);
  });
});

describe("question-triggered suggestions", () => {
  test("a them question triggers a call before 60s, debounced to 15s between auto calls", async () => {
    const { clock, files, prompts, session } = setup(async () => reply("- hint"));
    clock.now = START + 10_000;
    files.live = "[00:05] them: so how would you scale this?\n";
    await session.tick();
    await session.pending;
    expect(prompts).toHaveLength(1);

    clock.now = START + 15_000;
    files.live += "[00:12] them: and why that choice?\n";
    await session.tick();
    await session.pending;
    expect(prompts).toHaveLength(1);

    clock.now = START + 26_000;
    await session.tick();
    await session.pending;
    expect(prompts).toHaveLength(2);
  });

  test("my own questions do not trigger", async () => {
    const { files, prompts, session } = setup(async () => reply("- hint"));
    files.live = "[00:05] me: what do you think?\n";
    await session.tick();
    await session.pending;
    expect(prompts).toEqual([]);
  });
});

describe("role", () => {
  test("the role instruction reaches both auto suggestions and asks", async () => {
    const { files, prompts, session, type } = setup(async () => reply("- x"), { role: "candidate" });
    files.live = "[00:05] them: tell me about a hard bug\n";
    await session.tick();
    await session.pending;
    type("?what now");
    await session.pending;
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) expect(prompt).toMatch(/candidate[\s\S]*latest question/);
  });
});
