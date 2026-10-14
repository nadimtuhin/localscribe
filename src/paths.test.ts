import { describe, expect, test } from "bun:test";
import { defaultRecordingsDir, stateFilePath } from "./paths.ts";

describe("default locations", () => {
  test("recordings go to Movies/localscribe under the given home", () => {
    expect(defaultRecordingsDir("/Users/ada")).toBe("/Users/ada/Movies/localscribe");
  });

  test("the state file lives in .localscribe under the given home", () => {
    expect(stateFilePath("/Users/ada")).toBe("/Users/ada/.localscribe/state.json");
  });

  test("both default to the current user's home", () => {
    const home = process.env.HOME!;
    expect(defaultRecordingsDir()).toBe(`${home}/Movies/localscribe`);
    expect(stateFilePath()).toBe(`${home}/.localscribe/state.json`);
  });
});
