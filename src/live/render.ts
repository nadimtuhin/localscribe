export interface ScreenState {
  captions: string[]; // newest last
  suggestions: string[]; // newest last
  status: string; // dim one-liner (errors, "thinking...")
  input: string;
}

export interface ScreenSize { cols: number; rows: number }

const CHROME_ROWS = 3; // header, status, input
const CAPTIONS_SHARE = 0.6;

// Captions and suggestions come from audio and a model, so they must not carry terminal escapes.
export const stripControlChars = (text: string) => text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
const cut = (text: string, cols: number) => {
  const safe = stripControlChars(text);
  return safe.length > cols ? safe.slice(0, cols) : safe;
};
const dim = (text: string) => (text ? `\x1b[2m${text}\x1b[22m` : "");
const bold = (text: string) => `\x1b[1m${text}\x1b[22m`;

function pane(title: string, items: string[], height: number, cols: number): string[] {
  const visible = items.slice(Math.max(0, items.length - (height - 1))).map((item) => cut(item, cols));
  const blanks = Array<string>(height - 1 - visible.length).fill("");
  return [bold(cut(title, cols)), ...visible, ...blanks];
}

// A pure function of state and terminal size; the controller only writes the result.
export function renderScreen(state: ScreenState, { cols, rows }: ScreenSize): string {
  const body = Math.max(2, rows - CHROME_ROWS);
  const captionRows = Math.ceil(body * CAPTIONS_SHARE);
  const lines = [
    dim(cut("localscribe live - type a note + Enter, Ctrl-C to leave, Ctrl+Opt+D draw", cols)),
    ...pane("Captions", state.captions, captionRows, cols),
    ...pane("Suggestions", state.suggestions.map((s) => (/^(?:Q: |A: | {3})/.test(s) ? s : `- ${s}`)), body - captionRows, cols),
    dim(cut(state.status, cols)),
    `> ${state.input}`.slice(-cols),
  ];
  return `\x1b[H${lines.map((line) => `${line}\x1b[K`).join("\n")}\x1b[J`;
}

export interface KeyResult { input: string; submit?: string; quit?: boolean }

export function applyKey(input: string, key: string): KeyResult {
  if (key === "\x03" || key === "\x04") return { input, quit: true };
  if (key === "\r" || key === "\n") return { input: "", submit: input };
  if (key === "\x7f" || key === "\b") return { input: input.slice(0, -1) };
  if (key.startsWith("\x1b")) return { input };
  return { input: input + key.replace(/[\x00-\x1f]/g, "") };
}
