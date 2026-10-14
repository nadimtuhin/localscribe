import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProcessRunner } from "../runner.ts";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const SOURCE = join(PROJECT_ROOT, "native", "livesys.swift");
const BINARY = join(PROJECT_ROOT, "bin", "livesys");

// Same compile-on-first-use scheme as the sysaudio recorder helper, kept separate so the two evolve independently.
export function ensureLiveHelper(runner: ProcessRunner): string {
  const isFresh = existsSync(BINARY) && statSync(BINARY).mtimeMs >= statSync(SOURCE).mtimeMs;
  if (isFresh) return BINARY;
  if (!runner.which("swiftc")) throw new Error("swiftc not found. Install Xcode command line tools: xcode-select --install");
  mkdirSync(dirname(BINARY), { recursive: true });
  const build = runner.run(["swiftc", "-O", SOURCE, "-o", BINARY]);
  if (build.exitCode !== 0) throw new Error(`building live system-audio helper failed:\n${build.stderr}`);
  return BINARY;
}
