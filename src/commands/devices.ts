import { formatDevicesText, listDevices } from "../capture/devices.ts";
import { ensureToolPath } from "../ffmpeg.ts";
import { CAPTURE, ensureHelper } from "../recorder.ts";
import { realRunner, type ProcessRunner } from "../runner.ts";
import type { Command } from "./shared.ts";

export const devicesOutput = (flags: { json?: boolean }, runner: ProcessRunner, captureHelper: string): string => {
  const report = listDevices(runner, captureHelper);
  return flags.json ? JSON.stringify(report) : formatDevicesText(report);
};

export interface DevicesDeps {
  ensureToolPath: () => void;
  ensureHelper: typeof ensureHelper;
  runner: ProcessRunner;
  log: (text: string) => void;
}

const realDeps: DevicesDeps = { ensureToolPath, ensureHelper, runner: realRunner, log: console.log };

export function createDevicesCommand(deps: DevicesDeps = realDeps): Command {
  return async ({ values }) => {
    deps.ensureToolPath();
    deps.log(devicesOutput(values, deps.runner, deps.ensureHelper(deps.runner, CAPTURE)));
    return 0;
  };
}

export const devicesCommand = createDevicesCommand();
