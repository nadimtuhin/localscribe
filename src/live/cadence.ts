export interface CadenceOptions { intervalMs: number; retryMs: number }

const QUESTION_GAP_MS = 15_000;
const QUESTION_OPENER = /^(?:what|how|why|when|where|who|which|can you|could you|tell me|walk me through|describe|explain)\b/i;

// True for a line the other side said that asks something.
export function isQuestionLine(line: string): boolean {
  const text = /^\[\d+:\d{2}\] them:\s*(.*)$/.exec(line)?.[1]?.trim();
  return text !== undefined && (text.endsWith("?") || QUESTION_OPENER.test(text));
}

// Decides when to ask Hermes: every `intervalMs` of new transcript, or soon after a question
// from the other side (debounced), one call at a time.
// `now` is the wall clock (retry delay and debounce); transcript times are recording-clock ms.
export class SuggestionCadence {
  private latestMs = 0;
  private markMs = 0;
  private callMarkMs = 0;
  private inFlight = false;
  private retryAtMs = 0;
  private lastBeginAtMs = -Infinity;
  private questionPending = false;

  constructor(private now: () => number, private options: CadenceOptions) {}

  transcriptReached(ms: number) {
    this.latestMs = Math.max(this.latestMs, ms);
  }

  questionHeard() {
    this.questionPending = true;
  }

  due(): boolean {
    if (this.inFlight || this.now() < this.retryAtMs) return false;
    const timerDue = this.latestMs - this.markMs >= this.options.intervalMs;
    const questionDue = this.questionPending && this.now() - this.lastBeginAtMs >= QUESTION_GAP_MS;
    return timerDue || questionDue;
  }

  begin() {
    this.inFlight = true;
    this.callMarkMs = this.latestMs;
    this.lastBeginAtMs = this.now();
    this.questionPending = false;
  }

  succeeded() {
    this.inFlight = false;
    this.markMs = this.callMarkMs;
  }

  failed() {
    this.inFlight = false;
    this.retryAtMs = this.now() + this.options.retryMs;
  }
}
