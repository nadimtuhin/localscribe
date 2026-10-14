import { describe, expect, test } from "bun:test";
import { isQuestionLine, SuggestionCadence } from "./cadence.ts";

const setup = () => {
  const clock = { now: 0 };
  const cadence = new SuggestionCadence(() => clock.now, { intervalMs: 60_000, retryMs: 15_000 });
  return { clock, cadence };
};

describe("SuggestionCadence", () => {
  test("not due before 60s of new speech", () => {
    const { cadence } = setup();
    cadence.transcriptReached(59_000);
    expect(cadence.due()).toBe(false);
  });

  test("due once 60s of transcript has accumulated", () => {
    const { cadence } = setup();
    cadence.transcriptReached(60_000);
    expect(cadence.due()).toBe(true);
  });

  test("measures from the transcript time of the last successful suggestion", () => {
    const { cadence } = setup();
    cadence.transcriptReached(65_000);
    cadence.begin();
    cadence.succeeded();
    cadence.transcriptReached(124_000);
    expect(cadence.due()).toBe(false);
    cadence.transcriptReached(125_000);
    expect(cadence.due()).toBe(true);
  });

  test("never due while a call is in flight", () => {
    const { cadence } = setup();
    cadence.transcriptReached(200_000);
    cadence.begin();
    expect(cadence.due()).toBe(false);
  });

  test("after a failure waits the retry delay on the wall clock", () => {
    const { clock, cadence } = setup();
    cadence.transcriptReached(70_000);
    clock.now = 1_000;
    cadence.begin();
    cadence.failed();
    clock.now = 15_999;
    expect(cadence.due()).toBe(false);
    clock.now = 16_000;
    expect(cadence.due()).toBe(true);
  });

  test("a failed call does not advance the mark, so the same speech is retried", () => {
    const { clock, cadence } = setup();
    cadence.transcriptReached(70_000);
    cadence.begin();
    cadence.failed();
    clock.now = 20_000;
    expect(cadence.due()).toBe(true);
  });
});

describe("isQuestionLine", () => {
  test("a them line ending with ? or opening with a question phrase", () => {
    for (const text of ["is that right?", "What is your biggest weakness", "how did you scale it", "Can you walk me through it", "tell me about yourself"]) {
      expect(isQuestionLine(`[01:00] them: ${text}`)).toBe(true);
    }
  });
  test("statements and my own questions do not count", () => {
    expect(isQuestionLine("[01:00] them: we shipped it last week")).toBe(false);
    expect(isQuestionLine("[01:00] them: however we think so")).toBe(false);
    expect(isQuestionLine("[01:00] me: what do you mean?")).toBe(false);
    expect(isQuestionLine("[01:00] note: what about pricing?")).toBe(false);
  });
});

describe("question-triggered cadence", () => {
  test("a heard question makes it due before 60s", () => {
    const { clock, cadence } = setup();
    clock.now = 100_000;
    cadence.transcriptReached(10_000);
    cadence.questionHeard();
    expect(cadence.due()).toBe(true);
  });

  test("debounced: not again within 15s of the previous auto call, due after", () => {
    const { clock, cadence } = setup();
    clock.now = 100_000;
    cadence.questionHeard();
    cadence.begin();
    cadence.succeeded();
    clock.now = 105_000;
    cadence.questionHeard();
    expect(cadence.due()).toBe(false);
    clock.now = 115_000;
    expect(cadence.due()).toBe(true);
  });

  test("a call consumes the heard question", () => {
    const { clock, cadence } = setup();
    clock.now = 100_000;
    cadence.questionHeard();
    cadence.begin();
    cadence.succeeded();
    clock.now = 200_000;
    expect(cadence.due()).toBe(false);
  });
});
