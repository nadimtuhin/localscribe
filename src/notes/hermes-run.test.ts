import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realHermesRun } from "./generate.ts";

let dir: string;
beforeEach(() => { dir = realpathSync(mkdtempSync(join(tmpdir(), "localscribe-hermes-"))); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function script(body: string) {
  const path = join(dir, "hermes");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe("realHermesRun", () => {
  test("returns what the command printed and its exit code", async () => {
    const result = await realHermesRun([script('echo "said: $1"; echo oops >&2; exit 2'), "hi"], dir, 5000);
    expect(result).toEqual({ exitCode: 2, stdout: "said: hi\n", stderr: "oops\n", timedOut: false });
  });

  test("runs the command in the given folder", async () => {
    const result = await realHermesRun([script("pwd")], dir, 5000);
    expect(result.stdout.trim()).toBe(dir);
  });

  test("kills a command that outlives the timeout and says so", async () => {
    const result = await realHermesRun([script("exec sleep 5")], dir, 100);
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  test("a command that does not exist anywhere fails with a clear message", async () => {
    await expect(realHermesRun(["localscribe-no-such-hermes-binary"], dir, 1000)).rejects.toThrow("hermes not found");
  });
});
