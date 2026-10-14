import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { buildHermesArgs, buildNotesPrompt, formatNotesFile, type NotesMeta } from "./prompt.ts";

export const HERMES_TIMEOUT_MS = 120_000;

export interface HermesResult { exitCode: number; stdout: string; stderr: string; timedOut: boolean }
// The seam tests fake: runs the argv in `cwd`, killing it after `timeoutMs`.
export type HermesRun = (args: string[], cwd: string, timeoutMs: number) => Promise<HermesResult>;

export interface NotesResult { written: boolean; message: string }

export const realHermesRun: HermesRun = async (args, cwd, timeoutMs) => {
  const [command = "hermes", ...rest] = args;
  const binary = Bun.which(command) ?? join(homedir(), ".local", "bin", command);
  if (!existsSync(binary)) throw new Error("hermes not found");
  const child = Bun.spawn([binary, ...rest], { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  clearTimeout(timer);
  return { exitCode, stdout, stderr, timedOut };
};

const skipped = (message: string): NotesResult => ({ written: false, message });

// Never throws: notes must not fail a recording.
export async function generateNotes(base: string, meta: NotesMeta, run: HermesRun): Promise<NotesResult> {
  const transcriptPath = `${base}.transcript.md`;
  const notesPath = `${base}.notes.md`;
  const readIfExists = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
  // The live transcript knows who spoke (me/them); the final one is mixed audio.
  const live = readIfExists(`${base}.live.txt`);
  const transcript = live.trim() ? live : readIfExists(transcriptPath);
  if (!transcript.trim()) return skipped("notes: no transcript, skipped (run with --transcribe first)");
  if (existsSync(notesPath)) return skipped(`notes: ${notesPath} already exists, not overwriting`);

  const scratch = mkdtempSync(join(tmpdir(), "localscribe-notes-"));
  try {
    const manualPath = `${base}.manual.md`;
    const manualNotes = existsSync(manualPath) ? readFileSync(manualPath, "utf8") : "";
    const args = buildHermesArgs(buildNotesPrompt(transcript, manualNotes), process.env.LOCALSCRIBE_HERMES_ARGS);
    const result = await run(args, scratch, HERMES_TIMEOUT_MS);
    if (result.timedOut) return skipped(`notes: hermes timed out after ${HERMES_TIMEOUT_MS / 1000}s`);
    if (result.exitCode !== 0) return skipped(`notes: hermes failed (exit ${result.exitCode}): ${result.stderr.trim().split("\n")[0] ?? ""}`);
    if (!result.stdout.trim()) return skipped("notes: hermes returned nothing");
    writeFileSync(notesPath, formatNotesFile(meta, result.stdout), { flag: "wx" });
    return { written: true, message: `notes: wrote ${notesPath}` };
  } catch (error) {
    return skipped(`notes: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// Shared by the stop hook and the `notes` command: states the data-sharing fact, then the outcome.
export async function generateAndReport(base: string, meta: NotesMeta, log: (line: string) => void, run: HermesRun = realHermesRun): Promise<NotesResult> {
  log("notes: sending the transcript to Hermes (it may reach a cloud model)");
  const result = await generateNotes(base, meta, run);
  log(result.message);
  return result;
}
