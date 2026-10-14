export interface CadenceOptions { intervalMs: number; retryMs: number }

// Decides when to ask Hermes: every `intervalMs` of new transcript, one call at a time.
// `now` is the wall clock (only used for the retry delay); transcript times are recording-clock ms.
export class SuggestionCadence {
  private latestMs = 0;
  private markMs = 0;
  private callMarkMs = 0;
  private inFlight = false;
  private retryAtMs = 0;

  constructor(private now: () => number, private options: CadenceOptions) {}

  transcriptReached(ms: number) {
    this.latestMs = Math.max(this.latestMs, ms);
  }

  due(): boolean {
    return !this.inFlight && this.now() >= this.retryAtMs && this.latestMs - this.markMs >= this.options.intervalMs;
  }

  begin() {
    this.inFlight = true;
    this.callMarkMs = this.latestMs;
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
