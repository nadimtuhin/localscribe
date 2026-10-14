import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProcessRunner } from "../runner.ts";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");

export interface HelperFiles {
  source: string;
  binary: string;
}

export const LIVESYS: HelperFiles = {
  source: join(PROJECT_ROOT, "native", "livesys.swift"),
  binary: join(PROJECT_ROOT, "bin", "livesys"),
};

// Same compile-on-first-use scheme as the sysaudio recorder helper, kept separate so the two evolve independently.
export function ensureLiveHelper(runner: ProcessRunner, { source, binary }: HelperFiles = LIVESYS): string {
  const isFresh = existsSync(binary) && statSync(binary).mtimeMs >= statSync(source).mtimeMs;
  if (isFresh) return binary;
  if (!runner.which("swiftc")) throw new Error("swiftc not found. Install Xcode command line tools: xcode-select --install");
  mkdirSync(dirname(binary), { recursive: true });
  const build = runner.run(["swiftc", "-O", source, "-o", binary]);
  if (build.exitCode !== 0) throw new Error(`building live system-audio helper failed:\n${build.stderr}`);
  return binary;
}
