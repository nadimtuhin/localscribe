import { parseMicrophones, type Device } from "../ffmpeg.ts";
import type { ProcessRunner } from "../runner.ts";
import { SelectionError, type CaptureSources } from "./selection.ts";

export interface DevicesReport extends CaptureSources { microphones: Device[] }

function parseHelperList(helperStdout: string): CaptureSources {
  try {
    const parsed = JSON.parse(helperStdout) as Partial<CaptureSources>;
    if (Array.isArray(parsed.displays) && Array.isArray(parsed.windows)) return { displays: parsed.displays, windows: parsed.windows };
  } catch {
    // fall through to the shared error
  }
  throw new SelectionError(`capture helper returned unexpected output: ${helperStdout.slice(0, 200)}`);
}

export const buildDevicesReport = (helperStdout: string, ffmpegDeviceListing: string): DevicesReport => ({
  ...parseHelperList(helperStdout),
  microphones: parseMicrophones(ffmpegDeviceListing),
});

export function formatDevicesText({ displays, windows, microphones }: DevicesReport): string {
  return [
    "Displays (id  name  size in points)",
    ...displays.map((d) => `  ${d.id}  ${d.name}  ${d.width}x${d.height} @${d.scale}x`),
    "Windows (id  app - title, frontmost first)",
    ...windows.map((w) => `  ${w.id}  ${w.app} - ${w.title}`),
    "Microphones (--mic index  name)",
    ...microphones.map((m) => `  ${m.device}  ${m.name}`),
  ].join("\n");
}

function runHelperList(runner: ProcessRunner, captureHelper: string): string {
  const listing = runner.run([captureHelper, "--list", "--json"]);
  if (listing.exitCode !== 0) {
    throw new SelectionError(`listing displays and windows failed (is Screen Recording allowed?):\n${listing.stderr.trim()}`);
  }
  return listing.stdout;
}

export const listSources = (runner: ProcessRunner, captureHelper: string): CaptureSources =>
  parseHelperList(runHelperList(runner, captureHelper));

export function listDevices(runner: ProcessRunner, captureHelper: string): DevicesReport {
  const helperStdout = runHelperList(runner, captureHelper);
  const mics = runner.run(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]);
  return buildDevicesReport(helperStdout, mics.stderr);
}
