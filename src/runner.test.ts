import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realRunner } from "./runner.ts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "localscribe-runner-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const until = async (condition: () => boolean, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await Bun.sleep(10);
  return condition();
};

describe("realRunner.which", () => {
  test("finds an executable on PATH", () => {
    expect(realRunner.which("echo")).toMatch(/\/echo$/);
  });

  test("returns null for a command that does not exist", () => {
    expect(realRunner.which("localscribe-no-such-command")).toBeNull();
  });
});

describe("realRunner.run", () => {
  test("captures stdout and a zero exit code", () => {
    expect(realRunner.run(["echo", "hello"])).toEqual({ exitCode: 0, stdout: "hello\n", stderr: "" });
  });

  test("captures stderr and a non-zero exit code", () => {
    expect(realRunner.run(["sh", "-c", "echo oops >&2; exit 3"])).toEqual({ exitCode: 3, stdout: "", stderr: "oops\n" });
  });

  test("a process killed by a signal counts as exit code 1", () => {
    expect(realRunner.run(["sh", "-c", "kill -9 $$"]).exitCode).toBe(1);
  });
});

describe("realRunner.spawnDetached", () => {
  test("returns the pid of a running process and sends its stderr to the log file", async () => {
    const logFile = join(dir, "child.log");
    const pid = realRunner.spawnDetached(["sh", "-c", "echo to-the-log >&2"], logFile);
    expect(pid).toBeGreaterThan(0);
    expect(await until(() => existsSync(logFile) && readFileSync(logFile, "utf8") === "to-the-log\n")).toBe(true);
  });
});

describe("realRunner process control", () => {
  test("kill ends a detached process that isAlive and isRunning had seen", async () => {
    const pid = realRunner.spawnDetached(["sleep", "30"], join(dir, "sleep.log"));
    expect(realRunner.isAlive(pid)).toBe(true);
    expect(realRunner.isRunning(pid, "sleep")).toBe(true);
    expect(realRunner.isRunning(pid, "ffmpeg")).toBe(false);
    realRunner.kill(pid, "SIGKILL");
    expect(await until(() => !realRunner.isAlive(pid))).toBe(true);
  });
});

describe("realRunner.sleep", () => {
  test("resolves after at least the requested time", async () => {
    const before = Date.now();
    await realRunner.sleep(50);
    expect(Date.now() - before).toBeGreaterThanOrEqual(45);
  });
});
