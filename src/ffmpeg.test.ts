import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildMicArgs, buildSckMuxArgs, ensureToolPath, withToolPaths } from "./ffmpeg.ts";

describe("buildMicArgs", () => {
  const args = buildMicArgs({ micDevice: 2, file: "/r/a.mic.m4a" });
  test("records only the audio device, no video", () => {
    expect(args).toContain("none:2");
    expect(args).not.toContain("libx264");
  });
  test("encodes aac and writes the file last", () => {
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args.at(-1)).toBe("/r/a.mic.m4a");
  });
});

describe("buildSckMuxArgs", () => {
  test("one audio part is copied next to the video", () => {
    const args = buildSckMuxArgs({ video: "v.mp4", audio: ["s.m4a"], out: "o.mp4" });
    expect(args.join(" ")).toContain("-i v.mp4 -i s.m4a");
    expect(args.join(" ")).toContain("-map 0:v -map 1:a -c copy");
    expect(args.at(-1)).toBe("o.mp4");
  });
  test("two audio parts are mixed, video untouched", () => {
    const args = buildSckMuxArgs({ video: "v.mp4", audio: ["s.m4a", "m.m4a"], out: "o.mp4" });
    expect(args.join(" ")).toContain("[1:a][2:a]amix=inputs=2:duration=longest:normalize=0[mixed]");
    expect(args).toEqual(expect.arrayContaining(["-map", "[mixed]", "-c:v", "copy"]));
  });
  test("keeps the whole video", () => {
    expect(buildSckMuxArgs({ video: "v.mp4", audio: ["s.m4a", "m.m4a"], out: "o.mp4" })).not.toContain("-shortest");
  });
});

describe("withToolPaths", () => {
  test("appends Homebrew dirs a Finder-launched app does not have", () => {
    expect(withToolPaths("/usr/bin:/bin")).toBe("/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin");
  });
  test("does not duplicate dirs already present", () => {
    expect(withToolPaths("/opt/homebrew/bin:/usr/bin")).toBe("/opt/homebrew/bin:/usr/bin:/usr/local/bin");
  });
  test("handles an unset PATH", () => {
    expect(withToolPaths(undefined)).toBe("/opt/homebrew/bin:/usr/local/bin");
  });
});

describe("ensureToolPath", () => {
  let original: string | undefined;
  beforeEach(() => { original = process.env.PATH; });
  afterEach(() => { process.env.PATH = original; });

  test("adds the Homebrew dirs to this process's PATH", () => {
    process.env.PATH = "/usr/bin:/bin";
    ensureToolPath();
    expect(process.env.PATH).toBe("/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin");
  });
});
