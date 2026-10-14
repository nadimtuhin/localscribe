import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearState, isAlive, isRunning, readState, writeState, type RecordingState } from "./state.ts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "localscribe-state-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const recording: RecordingState = {
  pid: 4242, file: "/r/a.mp4", videoFile: "/r/a.video.mp4", videoHasMic: true, startedAt: "2026-10-14T22:05:29.000Z",
  sidecars: [{ pid: 7, exe: "bun", drain: true }],
};

describe("state file", () => {
  test("a written state reads back unchanged", () => {
    const path = join(dir, "state.json");
    writeState(path, recording);
    expect(readState(path)).toEqual(recording);
  });

  test("writing creates missing parent directories and leaves no temp file behind", () => {
    const path = join(dir, "nested", "deeper", "state.json");
    writeState(path, recording);
    expect(readdirSync(join(dir, "nested", "deeper"))).toEqual(["state.json"]);
  });

  test("reading a missing file gives null", () => {
    expect(readState(join(dir, "absent.json"))).toBeNull();
  });

  test("reading a corrupt file gives null", () => {
    const path = join(dir, "state.json");
    writeFileSync(path, "{ half");
    expect(readState(path)).toBeNull();
  });

  test("clearing removes the file", () => {
    const path = join(dir, "state.json");
    writeState(path, recording);
    clearState(path);
    expect(existsSync(path)).toBe(false);
  });

  test("clearing a file that is not there is fine", () => {
    expect(() => clearState(join(dir, "absent.json"))).not.toThrow();
  });
});

describe("process checks", () => {
  const sleeper = () => Bun.spawn(["sleep", "30"]);

  test("a live process is alive", () => {
    const child = sleeper();
    try {
      expect(isAlive(child.pid)).toBe(true);
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("a reaped process is not alive and not running", async () => {
    const child = sleeper();
    child.kill("SIGKILL");
    await child.exited;
    expect(isAlive(child.pid)).toBe(false);
    expect(isRunning(child.pid, "sleep")).toBe(false);
  });

  test("isRunning is true when the executable name matches", () => {
    const child = sleeper();
    try {
      expect(isRunning(child.pid, "sleep")).toBe(true);
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("isRunning is false when a live pid belongs to a different executable", () => {
    const child = sleeper();
    try {
      expect(isRunning(child.pid, "ffmpeg")).toBe(false);
    } finally {
      child.kill("SIGKILL");
    }
  });
});
