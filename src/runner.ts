import { isAlive, isRunning } from "./state.ts";

export interface RunResult { exitCode: number; stdout: string; stderr: string }

// Every process the recorder touches goes through this seam so tests can fake it.
export interface ProcessRunner {
  which(command: string): string | null;
  run(command: string[]): RunResult;
  spawnDetached(command: string[], logFile: string): number;
  isAlive(pid: number): boolean;
  isRunning(pid: number, executableName: string): boolean;
  kill(pid: number, signal: NodeJS.Signals): void;
  sleep(ms: number): Promise<void>;
}

export const realRunner: ProcessRunner = {
  which: (command) => Bun.which(command),
  run: (command) => {
    const done = Bun.spawnSync(command);
    return { exitCode: done.exitCode ?? 1, stdout: done.stdout.toString(), stderr: done.stderr.toString() };
  },
  spawnDetached: (command, logFile) => {
    const child = Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: Bun.file(logFile), detached: true });
    child.unref();
    return child.pid;
  },
  isAlive,
  isRunning,
  kill: (pid, signal) => process.kill(pid, signal),
  sleep: (ms) => Bun.sleep(ms),
};
