import { formatDevicesText, listDevices } from "../capture/devices.ts";
import { ensureToolPath } from "../ffmpeg.ts";
import { CAPTURE, ensureHelper } from "../recorder.ts";
import { realRunner, type ProcessRunner } from "../runner.ts";
import type { Command } from "./shared.ts";

export const devicesOutput = (flags: { json?: boolean }, runner: ProcessRunner, captureHelper: string): string => {
  const report = listDevices(runner, captureHelper);
  return flags.json ? JSON.stringify(report) : formatDevicesText(report);
};

export const devicesCommand: Command = async ({ values }) => {
  ensureToolPath();
  console.log(devicesOutput(values, realRunner, ensureHelper(realRunner, CAPTURE)));
  return 0;
};
