// Pure logic for choosing what to record: parsing flags, resolving names to ids, building helper args.

export class SelectionError extends Error {}

export interface Display { id: number; name: string; width: number; height: number; scale: number } // width/height in points
export interface WindowInfo { id: number; app: string; title: string } // listed front to back
export interface CaptureSources { displays: Display[]; windows: WindowInfo[] }

export interface Area { x: number; y: number; w: number; h: number } // points, relative to the display's top-left

export type Selection =
  | { kind: "display"; displayId: number }
  | { kind: "window"; windowId: number; app: string; title: string }
  | ({ kind: "area"; displayId: number } & Area);

export interface SelectionFlags { window?: string; area?: string; display?: string }

export function parseArea(text: string): Area {
  const parts = text.split(",").map((part) => part.trim());
  const numbers = parts.map(Number);
  const valid = parts.length === 4 && parts.every((part) => part !== "") && numbers.every(Number.isFinite);
  const [x, y, w, h] = numbers as [number, number, number, number];
  if (!valid || x < 0 || y < 0 || w <= 0 || h <= 0) {
    throw new SelectionError(`--area expects x,y,w,h in points (x,y >= 0, w,h > 0), got "${text}"`);
  }
  return { x, y, w, h };
}

const describeWindow = (w: WindowInfo) => `  ${w.id}  ${w.app} - ${w.title}`;

// A bare app name means that app's frontmost window; anything else must match exactly one window.
export function resolveWindow(windows: WindowInfo[], query: string): WindowInfo {
  if (/^\d+$/.test(query)) {
    const byId = windows.find((w) => w.id === Number(query));
    if (!byId) throw new SelectionError(`no window with id ${query}. Run: localscribe devices`);
    return byId;
  }
  const needle = query.toLowerCase();
  const sameApp = windows.find((w) => w.app.toLowerCase() === needle);
  if (sameApp) return sameApp;
  const matches = windows.filter((w) => `${w.app} ${w.title}`.toLowerCase().includes(needle));
  if (matches.length === 0) throw new SelectionError(`no window matches "${query}". Run: localscribe devices`);
  if (matches.length > 1) {
    throw new SelectionError(`"${query}" is ambiguous, pick one by id:\n${matches.map(describeWindow).join("\n")}`);
  }
  return matches[0]!;
}

function resolveDisplay(displays: Display[], text: string): Display {
  if (!/^\d+$/.test(text)) throw new SelectionError(`--display expects a display id, got "${text}"`);
  const display = displays.find((d) => d.id === Number(text));
  if (!display) throw new SelectionError(`display ${text} not found. Available ids: ${displays.map((d) => d.id).join(", ")}`);
  return display;
}

export function resolveSelection(flags: SelectionFlags, sources: CaptureSources): Selection | undefined {
  if (flags.window !== undefined && (flags.area !== undefined || flags.display !== undefined)) {
    throw new SelectionError("use only one of --window, --area, --display (--display may accompany --area)");
  }
  if (flags.window !== undefined) {
    const window = resolveWindow(sources.windows, flags.window);
    return { kind: "window", windowId: window.id, app: window.app, title: window.title };
  }
  const display = flags.display !== undefined ? resolveDisplay(sources.displays, flags.display) : undefined;
  if (flags.area !== undefined) {
    const target = display ?? sources.displays[0];
    if (!target) throw new SelectionError("no display found");
    const area = parseArea(flags.area);
    if (area.x + area.w > target.width || area.y + area.h > target.height) {
      throw new SelectionError(`--area is outside display ${target.id} (${target.width}x${target.height} points)`);
    }
    return { kind: "area", displayId: target.id, ...area };
  }
  return display ? { kind: "display", displayId: display.id } : undefined;
}

export interface CaptureArgsOptions { out: string; systemAudio?: string; fps: number }

// Without a selection the helper captures the main display.
export function captureArgs(selection: Selection | undefined, { out, systemAudio, fps }: CaptureArgsOptions): string[] {
  const target =
    selection === undefined ? []
    : selection.kind === "display" ? ["--display", String(selection.displayId)]
    : selection.kind === "window" ? ["--window", String(selection.windowId)]
    : ["--area", `${selection.x},${selection.y},${selection.w},${selection.h}`, "--display", String(selection.displayId)];
  return [...target, "--fps", String(fps), "--out", out, ...(systemAudio ? ["--system-audio", systemAudio] : [])];
}

// Output of `localscribe-capture --pick window|area` (empty when the user pressed Esc), as flags.
export function parsePick(stdout: string): SelectionFlags {
  if (stdout.trim() === "") throw new SelectionError("selection cancelled");
  const pick = JSON.parse(stdout) as { window?: number; displayId?: number; x?: number; y?: number; w?: number; h?: number };
  if (pick.window !== undefined) return { window: String(pick.window) };
  return { area: `${pick.x},${pick.y},${pick.w},${pick.h}`, display: String(pick.displayId) };
}
