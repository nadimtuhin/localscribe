import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { runCli } from "./index.ts";

let out: string[];
let err: string[];
beforeEach(() => {
  out = [];
  err = [];
  spyOn(console, "log").mockImplementation((...args) => void out.push(args.join(" ")));
  spyOn(console, "error").mockImplementation((...args) => void err.push(args.join(" ")));
});
afterEach(() => {
  (console.log as unknown as { mockRestore(): void }).mockRestore();
  (console.error as unknown as { mockRestore(): void }).mockRestore();
});

describe("runCli", () => {
  test("no command prints help and fails; --help succeeds", async () => {
    expect(await runCli([])).toBe(1);
    expect(await runCli(["--help"])).toBe(0);
    expect(out.join("\n")).toContain("localscribe start");
  });

  test("list runs against the recordings dir without throwing", async () => {
    expect(await runCli(["list"])).toBe(0);
  });

  test("capture-source and engine flags parse and are documented in help", async () => {
    await runCli(["--help", "--window", "Safari", "--area", "0,0,800,600", "--display", "1", "--engine", "sck", "--json"]);
    const help = out.join("\n");
    for (const flag of ["--window", "--area", "--display", "--engine", "devices"]) expect(help).toContain(flag);
  });
});
