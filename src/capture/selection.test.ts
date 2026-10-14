import { describe, expect, test } from "bun:test";
import { captureArgs, parseArea, parsePick, resolveSelection, resolveWindow, type CaptureSources } from "./selection.ts";

const sources: CaptureSources = {
  displays: [
    { id: 1, name: "Built-in", width: 1512, height: 982, scale: 2 },
    { id: 7, name: "External", width: 1920, height: 1080, scale: 1 },
  ],
  windows: [
    { id: 4242, app: "Safari", title: "GitHub" },
    { id: 4243, app: "Safari", title: "Docs" },
    { id: 90, app: "Terminal", title: "zsh - build" },
    { id: 91, app: "Notes", title: "Groceries" },
    { id: 92, app: "Notes Helper", title: "Groceries list" },
  ],
};

describe("parseArea", () => {
  test("parses x,y,w,h", () => expect(parseArea("0,10,800,600")).toEqual({ x: 0, y: 10, w: 800, h: 600 }));
  test("tolerates spaces", () => expect(parseArea(" 5, 6 ,7,8 ")).toEqual({ x: 5, y: 6, w: 7, h: 8 }));
  test.each(["", "1,2,3", "1,2,3,4,5", "a,b,c,d", "1,2,0,5", "1,2,5,-1", "-1,0,5,5", "1,2,NaN,4", "1,2,Infinity,4"])(
    "rejects %p",
    (text) => expect(() => parseArea(text)).toThrow("--area"),
  );
});

describe("resolveWindow", () => {
  test("by numeric id", () => expect(resolveWindow(sources.windows, "90").app).toBe("Terminal"));
  test("exact app name picks the frontmost (first listed) window", () => expect(resolveWindow(sources.windows, "safari").id).toBe(4242));
  test("unique title substring", () => expect(resolveWindow(sources.windows, "build").id).toBe(90));
  test("unknown id fails", () => expect(() => resolveWindow(sources.windows, "555")).toThrow("no window"));
  test("unknown name fails", () => expect(() => resolveWindow(sources.windows, "Firefox")).toThrow("no window"));
  test("ambiguous partial name lists matches with ids", () => {
    expect(() => resolveWindow(sources.windows, "Groceries")).toThrow(/ambiguous[\s\S]*91[\s\S]*92/);
  });
});

describe("resolveSelection", () => {
  test("nothing selected means the default capture", () => expect(resolveSelection({}, sources)).toBeUndefined());
  test("display", () => expect(resolveSelection({ display: "7" }, sources)).toEqual({ kind: "display", displayId: 7 }));
  test("unknown display fails and lists ids", () => {
    expect(() => resolveSelection({ display: "3" }, sources)).toThrow(/display 3[\s\S]*1[\s\S]*7/);
  });
  test("non-numeric display fails", () => expect(() => resolveSelection({ display: "x" }, sources)).toThrow("--display"));
  test("window", () =>
    expect(resolveSelection({ window: "Terminal" }, sources)).toEqual({ kind: "window", windowId: 90, app: "Terminal", title: "zsh - build" }));
  test("area defaults to the first (main) display", () =>
    expect(resolveSelection({ area: "0,0,800,600" }, sources)).toEqual({ kind: "area", displayId: 1, x: 0, y: 0, w: 800, h: 600 }));
  test("area on a chosen display", () =>
    expect(resolveSelection({ area: "10,10,100,100", display: "7" }, sources)).toMatchObject({ kind: "area", displayId: 7 }));
  test("area outside the display bounds fails", () => {
    expect(() => resolveSelection({ area: "1000,0,800,600" }, sources)).toThrow("outside display 1");
  });
  test("window and area together are rejected", () => {
    expect(() => resolveSelection({ window: "Safari", area: "0,0,10,10" }, sources)).toThrow("only one");
  });
  test("window and display together are rejected", () => {
    expect(() => resolveSelection({ window: "Safari", display: "1" }, sources)).toThrow("only one");
  });
});

describe("captureArgs", () => {
  const common = { out: "/r/a.video.mp4", systemAudio: "/r/a.system.m4a", fps: 30 };
  test("display", () =>
    expect(captureArgs({ kind: "display", displayId: 7 }, common)).toEqual([
      "--display", "7", "--fps", "30", "--out", "/r/a.video.mp4", "--system-audio", "/r/a.system.m4a",
    ]));
  test("window", () =>
    expect(captureArgs({ kind: "window", windowId: 90, app: "T", title: "t" }, common).slice(0, 2)).toEqual(["--window", "90"]));
  test("area carries its display", () => {
    const args = captureArgs({ kind: "area", displayId: 1, x: 1, y: 2, w: 3, h: 4 }, common);
    expect(args.slice(0, 4)).toEqual(["--area", "1,2,3,4", "--display", "1"]);
  });
  test("no system audio omits the flag", () => {
    expect(captureArgs({ kind: "display", displayId: 1 }, { out: "o", fps: 24 })).not.toContain("--system-audio");
  });
});

describe("parsePick", () => {
  test("window pick becomes a window query by id", () => expect(parsePick('{"window":4242}')).toEqual({ window: "4242" }));
  test("area pick becomes area + display flags", () =>
    expect(parsePick('{"displayId":7,"x":1,"y":2,"w":30,"h":40}')).toEqual({ area: "1,2,30,40", display: "7" }));
  test("cancelled pick is an error", () => expect(() => parsePick("")).toThrow("cancelled"));
});
