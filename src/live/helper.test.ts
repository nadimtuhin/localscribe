import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessRunner } from "../runner.ts";
import { ensureLiveHelper } from "./helper.ts";

let dir: string;
let files: { source: string; binary: string };
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "localscribe-helper-"));
  files = { source: join(dir, "livesys.swift"), binary: join(dir, "bin", "livesys") };
  writeFileSync(files.source, "// swift");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const fakeRunner = (options: { swiftc?: boolean; exitCode?: number; stderr?: string } = {}) => {
  const ran: string[][] = [];
  const runner = {
    which: (command: string) => (command === "swiftc" && options.swiftc !== false ? "/usr/bin/swiftc" : null),
    run: (command: string[]) => (ran.push(command), { exitCode: options.exitCode ?? 0, stdout: "", stderr: options.stderr ?? "" }),
  } as unknown as ProcessRunner;
  return { ran, runner };
};

describe("ensureLiveHelper", () => {
  test("returns an up-to-date binary without compiling", () => {
    writeFileSync(join(dir, "fresh"), "");
    files.binary = join(dir, "fresh");
    utimesSync(files.source, 1000, 1000);
    utimesSync(files.binary, 2000, 2000);
    const { ran, runner } = fakeRunner();
    expect(ensureLiveHelper(runner, files)).toBe(files.binary);
    expect(ran).toEqual([]);
  });

  test("recompiles a binary older than its source", () => {
    writeFileSync(join(dir, "stale"), "");
    files.binary = join(dir, "stale");
    utimesSync(files.source, 2000, 2000);
    utimesSync(files.binary, 1000, 1000);
    const { ran, runner } = fakeRunner();
    ensureLiveHelper(runner, files);
    expect(ran).toEqual([["swiftc", "-O", files.source, "-o", files.binary]]);
  });

  test("compiles a missing binary and creates its folder", () => {
    const { ran, runner } = fakeRunner();
    expect(ensureLiveHelper(runner, files)).toBe(files.binary);
    expect(ran).toEqual([["swiftc", "-O", files.source, "-o", files.binary]]);
    expect(existsSync(join(dir, "bin"))).toBe(true);
  });

  test("tells the user to install the command line tools when swiftc is missing", () => {
    const { runner } = fakeRunner({ swiftc: false });
    expect(() => ensureLiveHelper(runner, files)).toThrow("xcode-select --install");
  });

  test("a failed build reports the compiler output", () => {
    const { runner } = fakeRunner({ exitCode: 1, stderr: "error: boom" });
    expect(() => ensureLiveHelper(runner, files)).toThrow("building live system-audio helper failed:\nerror: boom");
  });
});
