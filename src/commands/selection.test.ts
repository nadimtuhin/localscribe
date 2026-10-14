import { describe, expect, test } from "bun:test";
import { devicesOutput } from "./devices.ts";
import { selectionForStart } from "./start.ts";
import type { ProcessRunner } from "../runner.ts";

const LIST = JSON.stringify({
  displays: [{ id: 1, name: "Built-in", width: 1512, height: 982, scale: 2 }],
  windows: [{ id: 4242, app: "Safari", title: "GitHub" }],
});
const MICS = "[x] AVFoundation audio devices:\n[x] [0] Mic";

const fakeRunner = (pickStdout = "") => {
  const calls: string[][] = [];
  const runner = {
    run: (command: string[]) => {
      calls.push(command);
      if (command.includes("--pick")) return { exitCode: 0, stdout: pickStdout, stderr: "" };
      if (command.includes("--list")) return { exitCode: 0, stdout: LIST, stderr: "" };
      return { exitCode: 0, stdout: "", stderr: MICS };
    },
  } as unknown as ProcessRunner;
  return { runner, calls };
};

describe("devicesOutput", () => {
  test("--json prints one JSON object with displays, windows and microphones", () => {
    const { runner } = fakeRunner();
    const parsed = JSON.parse(devicesOutput({ json: true }, runner, "/h"));
    expect(Object.keys(parsed).sort()).toEqual(["displays", "microphones", "windows"]);
    expect(parsed.windows[0].id).toBe(4242);
  });
  test("without --json prints readable sections", () => {
    const { runner } = fakeRunner();
    expect(devicesOutput({}, runner, "/h")).toContain("Safari - GitHub");
  });
});

describe("selectionForStart", () => {
  test("no capture flags never touches the helper", () => {
    const { runner, calls } = fakeRunner();
    expect(selectionForStart({}, runner, "/h")).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
  test("--window by name resolves through the helper listing", () => {
    const { runner } = fakeRunner();
    expect(selectionForStart({ window: "Safari" }, runner, "/h")).toEqual({ kind: "window", windowId: 4242, app: "Safari", title: "GitHub" });
  });
  test("--area x,y,w,h", () => {
    const { runner } = fakeRunner();
    expect(selectionForStart({ area: "0,0,800,600" }, runner, "/h")).toMatchObject({ kind: "area", displayId: 1, w: 800, h: 600 });
  });
  test("--window pick runs the click-to-pick overlay", () => {
    const { runner, calls } = fakeRunner('{"window":4242}');
    expect(selectionForStart({ window: "pick" }, runner, "/h")).toMatchObject({ kind: "window", windowId: 4242 });
    expect(calls[0]).toEqual(["/h", "--pick", "window"]);
  });
  test("--area pick runs the drag overlay", () => {
    const { runner, calls } = fakeRunner('{"displayId":1,"x":10,"y":20,"w":300,"h":200}');
    expect(selectionForStart({ area: "pick" }, runner, "/h")).toMatchObject({ kind: "area", x: 10, y: 20, w: 300, h: 200 });
    expect(calls[0]).toEqual(["/h", "--pick", "area"]);
  });
  test("a cancelled pick fails", () => {
    const { runner } = fakeRunner("");
    expect(() => selectionForStart({ area: "pick" }, runner, "/h")).toThrow("cancelled");
  });
});
