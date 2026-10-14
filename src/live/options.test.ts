import { describe, expect, test } from "bun:test";
import { parseArgs } from "node:util";
import { cliOptions } from "../commands/shared.ts";
import { pluginOptionsFromFlags } from "../plugins/index.ts";
import { liveOptionsFromFlags, LiveOptionsError } from "./options.ts";

const files = new Set(["/work/resume.md", "/work/jd.md"]);
const isFile = (path: string) => files.has(path);
const options = (flags: Parameters<typeof liveOptionsFromFlags>[0]) => liveOptionsFromFlags(flags, isFile, "/work");

describe("liveOptionsFromFlags", () => {
  test("defaults to the meeting role and no context", () => {
    expect(options({})).toEqual({ role: "meeting", contextFiles: [] });
  });

  test("accepts each role", () => {
    for (const role of ["candidate", "interviewer", "meeting"]) expect(options({ role }).role as string).toBe(role);
  });

  test("an unknown role fails and lists the choices", () => {
    expect(() => options({ role: "boss" })).toThrow(/--role expects candidate, interviewer or meeting, got "boss"/);
  });

  test("context paths are resolved against the working directory, in order", () => {
    expect(options({ context: ["resume.md", "/work/jd.md"] }).contextFiles).toEqual(["/work/resume.md", "/work/jd.md"]);
  });

  test("a missing context file fails naming the path", () => {
    expect(() => options({ context: ["resume.md", "nope.md"] })).toThrow(LiveOptionsError);
    expect(() => options({ context: ["nope.md"] })).toThrow(/context file not found: \/work\/nope\.md/);
  });
});

describe("cli flags", () => {
  test("--context repeats and --role is a string", () => {
    const { values } = parseArgs({ args: ["--live", "--role", "candidate", "--context", "a.md", "--context", "b.md"], options: cliOptions });
    expect(values.role).toBe("candidate");
    expect(values.context).toEqual(["a.md", "b.md"]);
  });
});

describe("pluginOptionsFromFlags with live modes", () => {
  test("--live stores role and context in the plugin options", () => {
    const resolved = pluginOptionsFromFlags({ live: true, role: "interviewer", context: ["package.json"] });
    expect(resolved.role).toBe("interviewer");
    expect(resolved.contextFiles).toEqual([`${process.cwd()}/package.json`]);
  });

  test("a missing context file fails before anything starts", () => {
    expect(() => pluginOptionsFromFlags({ live: true, context: ["definitely-missing.md"] })).toThrow(/not found/);
  });

  test("--role or --context without --live is an error", () => {
    expect(() => pluginOptionsFromFlags({ role: "candidate" })).toThrow(/--live/);
    expect(() => pluginOptionsFromFlags({ context: ["package.json"] })).toThrow(/--live/);
  });

  test("without the new flags the options are unchanged", () => {
    expect(pluginOptionsFromFlags({ live: true })).toEqual({ transcribe: true, liveCaptions: true, notes: true, systemAudio: true, role: "meeting", contextFiles: [] });
  });
});
