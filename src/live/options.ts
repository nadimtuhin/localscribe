import { statSync } from "node:fs";
import { resolve } from "node:path";
import { ROLES, type Role } from "./prompt.ts";

export class LiveOptionsError extends Error {}

export interface LiveFlags { role?: string; context?: string[] }
export interface LiveOptions { role: Role; contextFiles: string[] }

const isRegularFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

// Checked before recording starts, so a typo costs nothing.
export function liveOptionsFromFlags(flags: LiveFlags, isFile: (path: string) => boolean = isRegularFile, cwd = process.cwd()): LiveOptions {
  const role = flags.role ?? "meeting";
  if (!(ROLES as readonly string[]).includes(role)) throw new LiveOptionsError(`--role expects candidate, interviewer or meeting, got "${role}"`);
  const contextFiles = (flags.context ?? []).map((path) => resolve(cwd, path));
  const missing = contextFiles.find((path) => !isFile(path));
  if (missing !== undefined) throw new LiveOptionsError(`context file not found: ${missing}`);
  return { role: role as Role, contextFiles };
}
