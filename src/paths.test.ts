import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { defaultRecordingsDir, renameRecordingFiles, slugify, stateFilePath, timestampedFilename, uniqueBase } from "./paths.ts";

describe("default locations", () => {
  test("recordings go to Movies/localscribe under the given home", () => {
    expect(defaultRecordingsDir("/Users/ada")).toBe("/Users/ada/Movies/localscribe");
  });

  test("the state file lives in .localscribe under the given home", () => {
    expect(stateFilePath("/Users/ada")).toBe("/Users/ada/.localscribe/state.json");
  });

  test("both default to the current user's home", () => {
    const home = homedir();
    expect(defaultRecordingsDir()).toBe(`${home}/Movies/localscribe`);
    expect(stateFilePath()).toBe(`${home}/.localscribe/state.json`);
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

  test("omits slug when name is empty or only punctuation", () => {
    expect(timestampedFilename(new Date(2026, 0, 5, 7, 3, 9), "   ")).toBe("2026-01-05_07-03-09.mp4");
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

  test("renames existing recording files to newBase", () => {
    const existing = new Set(["/r/old.mp4", "/r/old.transcript.md", "/r/old.notes.md"]);
    const renamed: [string, string][] = [];
    const result = renameRecordingFiles(
      "/r/old",
      "/r/new",
      (path) => existing.has(path),
      (from, to) => renamed.push([from, to]),
    );
    expect(result).toEqual(["/r/new.mp4", "/r/new.transcript.md", "/r/new.notes.md"]);
    expect(renamed).toEqual([
      ["/r/old.mp4", "/r/new.mp4"],
      ["/r/old.transcript.md", "/r/new.transcript.md"],
      ["/r/old.notes.md", "/r/new.notes.md"],
    ]);
  });
});
