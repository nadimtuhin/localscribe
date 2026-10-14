import { describe, expect, test } from "bun:test";
import { buildArgs, buildMuxArgs, parseMicrophones, parseScreens } from "./ffmpeg.ts";
import { timestampedFilename, withMp4Extension } from "./paths.ts";

describe("timestampedFilename", () => {
  test("formats local time with zero padding", () => {
    expect(timestampedFilename(new Date(2026, 0, 5, 7, 3, 9))).toBe("2026-01-05_07-03-09.mp4");
  });
});

describe("parseScreens", () => {
  const output = `[AVFoundation indev @ 0x1] AVFoundation video devices:
[AVFoundation indev @ 0x1] [0] FaceTime HD Camera
[AVFoundation indev @ 0x1] [1] Capture screen 0
[AVFoundation indev @ 0x1] [2] Capture screen 1
[AVFoundation indev @ 0x1] AVFoundation audio devices:
[AVFoundation indev @ 0x1] [0] MacBook Pro Microphone`;

  test("returns only screens with their device indices", () => {
    expect(parseScreens(output)).toEqual([
      { device: 1, name: "Capture screen 0" },
      { device: 2, name: "Capture screen 1" },
    ]);
  });

  test("returns empty when no screens", () => {
    expect(parseScreens("AVFoundation audio devices:\n[0] Mic")).toEqual([]);
  });
});

describe("buildArgs", () => {
  const args = buildArgs({ screenDevice: 1, fps: 24, file: "/tmp/x.mp4" });
  test("captures the screen device without audio", () => {
    expect(args).toContain("1:none");
  });
  test("uses requested fps and writes to file last", () => {
    expect(args[args.indexOf("-framerate") + 1]).toBe("24");
    expect(args.at(-1)).toBe("/tmp/x.mp4");
  });
});

describe("parseMicrophones", () => {
  test("returns audio devices with their own indices", () => {
    const output = `[x] AVFoundation video devices:
[x] [0] FaceTime HD Camera
[x] [1] Capture screen 0
[x] AVFoundation audio devices:
[x] [0] MacBook Pro Microphone
[x] [1] AirPods Pro`;
    expect(parseMicrophones(output)).toEqual([
      { device: 0, name: "MacBook Pro Microphone" },
      { device: 1, name: "AirPods Pro" },
    ]);
  });
});

describe("buildArgs with mic", () => {
  test("pairs screen and mic devices and encodes aac", () => {
    const args = buildArgs({ screenDevice: 1, micDevice: 0, fps: 30, file: "/tmp/x.mp4" });
    expect(args).toContain("1:0");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
  });
});

describe("buildMuxArgs", () => {
  const base = { video: "v.mp4", systemAudio: "s.m4a", out: "o.mp4" };

  test("mixes mic and system audio into one track when video has mic", () => {
    const args = buildMuxArgs({ ...base, videoHasMic: true });
    expect(args.join(" ")).toContain("[0:a][1:a]amix=inputs=2");
    expect(args).toEqual(expect.arrayContaining(["-map", "[mixed]", "-c:v", "copy"]));
  });

  test("uses system audio as the only track when no mic", () => {
    const args = buildMuxArgs({ ...base, videoHasMic: false });
    expect(args.join(" ")).toContain("-map 0:v -map 1:a -c copy");
    expect(args.at(-1)).toBe("o.mp4");
  });
});

describe("withMp4Extension", () => {
  test("keeps .mp4 paths", () => expect(withMp4Extension("/a/demo.mp4")).toBe("/a/demo.mp4"));
  test("appends .mp4 when missing", () => expect(withMp4Extension("/a/demo")).toBe("/a/demo.mp4"));
  test("replaces another video extension", () => expect(withMp4Extension("/a/demo.mov")).toBe("/a/demo.mp4"));
});

describe("buildMuxArgs keeps full video", () => {
  test("does not cut video to the system audio length", () => {
    const args = buildMuxArgs({ video: "v.mp4", systemAudio: "s.m4a", out: "o.mp4", videoHasMic: false });
    expect(args).not.toContain("-shortest");
  });
});
