import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { defaultRecordingsDir, optimizeLogPath, optimizeQueuePath, renameRecordingFiles, slugify, stateFilePath, timestampedFilename, uniqueBase, withAudioExtension, withRecordingExtension } from "./paths.ts";

describe("default locations", () => {
  test("recordings go to Movies/localscribe under the given home", () => {
    expect(defaultRecordingsDir("/Users/ada")).toBe("/Users/ada/Movies/localscribe");
  });

  test("the state file lives in .localscribe under the given home", () => {
    expect(stateFilePath("/Users/ada")).toBe("/Users/ada/.localscribe/state.json");
  });

  test("the optimize queue and log files live in .localscribe under the given home", () => {
    expect(optimizeQueuePath("/Users/ada")).toBe("/Users/ada/.localscribe/optimize-queue.json");
    expect(optimizeLogPath("/Users/ada")).toBe("/Users/ada/.localscribe/optimize-worker.log");
  });

  test("both default to the current user's home", () => {
    const home = homedir();
    expect(defaultRecordingsDir()).toBe(`${home}/Movies/localscribe`);
    expect(stateFilePath()).toBe(`${home}/.localscribe/state.json`);
    expect(optimizeQueuePath()).toBe(`${home}/.localscribe/optimize-queue.json`);
    expect(optimizeLogPath()).toBe(`${home}/.localscribe/optimize-worker.log`);
  });
});

describe("slugify", () => {
  test("lowercases and collapses punctuation and whitespace", () => {
    expect(slugify("  Hello, World! -- Let's Go -- ")).toBe("hello-world-let-s-go");
  });

  test("supports unicode letters", () => {
    expect(slugify("বাংলা কথা")).toBe("বাংলা-কথা");
  });

  test("caps length at 50 chars", () => {
    expect(slugify("a".repeat(100))).toHaveLength(50);
  });
});

describe("timestampedFilename with name", () => {
  test("includes slugified name when given", () => {
    expect(timestampedFilename(new Date(2026, 0, 5, 7, 3, 9), "Team Sync")).toBe("2026-01-05_07-03-09_team-sync.mp4");
  });

  test("supports m4a extension", () => {
    expect(timestampedFilename(new Date(2026, 0, 5, 7, 3, 9), "Voice Memo", "m4a")).toBe("2026-01-05_07-03-09_voice-memo.m4a");
    expect(timestampedFilename(new Date(2026, 0, 5, 7, 3, 9), undefined, "m4a")).toBe("2026-01-05_07-03-09.m4a");
  });

  test("omits slug when name is empty or only punctuation", () => {
    expect(timestampedFilename(new Date(2026, 0, 5, 7, 3, 9), "   ")).toBe("2026-01-05_07-03-09.mp4");
  });
});

describe("withAudioExtension", () => {
  test("preserves .m4a", () => {
    expect(withAudioExtension("/r/audio.m4a")).toBe("/r/audio.m4a");
  });
  test("preserves .mp4", () => {
    expect(withAudioExtension("/r/video.mp4")).toBe("/r/video.mp4");
  });
  test("defaults extensionless paths to .m4a", () => {
    expect(withAudioExtension("/r/audio")).toBe("/r/audio.m4a");
  });
  test("replaces other extension with .m4a", () => {
    expect(withAudioExtension("/r/audio.wav")).toBe("/r/audio.m4a");
  });
});

describe("withRecordingExtension", () => {
  test("defaults to .mp4 for video and .m4a for audio-only", () => {
    expect(withRecordingExtension("/r/demo", false)).toBe("/r/demo.mp4");
    expect(withRecordingExtension("/r/demo", true)).toBe("/r/demo.m4a");
    expect(withRecordingExtension("/r/demo.mp4", true)).toBe("/r/demo.mp4");
    expect(withRecordingExtension("/r/demo.m4a", true)).toBe("/r/demo.m4a");
  });
});

describe("uniqueBase", () => {
  test("returns unchanged if base already ends in slug", () => {
    expect(uniqueBase("/r/2026-01-05_07-03-09_team-sync", "team-sync")).toBe("/r/2026-01-05_07-03-09_team-sync");
  });

  test("returns unchanged when base already has a slug and name is not explicit", () => {
    expect(uniqueBase("/r/2026-01-05_07-03-09_old-slug", "new-slug", false)).toBe("/r/2026-01-05_07-03-09_old-slug");
  });

  test("appends slug when explicit even if old slug present", () => {
    expect(uniqueBase("/r/2026-01-05_07-03-09_old-slug", "new-slug", true, () => false)).toBe("/r/2026-01-05_07-03-09_old-slug_new-slug");
  });

  test("increments counter on collision", () => {
    let call = 0;
    const exists = () => call++ < 2; // collides twice
    expect(uniqueBase("/r/2026-01-05_07-03-09", "sync", false, exists)).toBe("/r/2026-01-05_07-03-09_sync-2");
  });
});

describe("renameRecordingFiles", () => {
  test("returns empty array when oldBase equals newBase", () => {
    expect(renameRecordingFiles("/r/same", "/r/same")).toEqual([]);
  });

  test("renames existing recording files to newBase including .m4a", () => {
    const existing = new Set(["/r/old.m4a", "/r/old.transcript.md", "/r/old.notes.md"]);
    const renamed: [string, string][] = [];
    const result = renameRecordingFiles(
      "/r/old",
      "/r/new",
      (path) => existing.has(path),
      (from, to) => renamed.push([from, to]),
    );
    expect(result).toEqual(["/r/new.m4a", "/r/new.transcript.md", "/r/new.notes.md"]);
    expect(renamed).toEqual([
      ["/r/old.m4a", "/r/new.m4a"],
      ["/r/old.transcript.md", "/r/new.transcript.md"],
      ["/r/old.notes.md", "/r/new.notes.md"],
    ]);
  });
});
