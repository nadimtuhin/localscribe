import { describe, expect, test } from "bun:test";
import { capContext, loadContextFiles, MAX_CONTEXT_FILE_CHARS, MAX_CONTEXT_TOTAL_CHARS } from "./context.ts";

describe("capContext", () => {
  test("short files pass through untouched", () => {
    expect(capContext([{ path: "/x/a.md", text: "hello" }])).toEqual([{ path: "/x/a.md", text: "hello" }]);
  });

  test("a file over the per-file cap is cut and says so", () => {
    const [file] = capContext([{ path: "a.md", text: "x".repeat(MAX_CONTEXT_FILE_CHARS + 50) }]);
    expect(file!.text.startsWith("x".repeat(MAX_CONTEXT_FILE_CHARS))).toBe(true);
    expect(file!.text).toContain(`[truncated at ${MAX_CONTEXT_FILE_CHARS} characters]`);
    expect(file!.text).not.toContain("x".repeat(MAX_CONTEXT_FILE_CHARS + 1));
  });

  test("the total cap trims the last files and notes omitted ones", () => {
    const big = (path: string) => ({ path, text: "y".repeat(MAX_CONTEXT_FILE_CHARS) });
    const files = capContext([big("a"), big("b"), big("c"), big("d")]);
    const kept = files.reduce((sum, f) => sum + f.text.replace(/\n?\[(?:truncated|omitted)[^\]]*\]$/, "").length, 0);
    expect(kept).toBeLessThanOrEqual(MAX_CONTEXT_TOTAL_CHARS);
    expect(files.at(-1)!.text).toMatch(/omitted|truncated/);
    expect(files.map((f) => f.path)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("loadContextFiles", () => {
  test("reads each path through the injected reader", () => {
    const files = loadContextFiles(["/x/a.md", "/x/b.md"], (path) => `text of ${path}`);
    expect(files).toEqual([{ path: "/x/a.md", text: "text of /x/a.md" }, { path: "/x/b.md", text: "text of /x/b.md" }]);
  });

  test("an unreadable file is a clear error naming the path", () => {
    const read = () => { throw new Error("ENOENT"); };
    expect(() => loadContextFiles(["/x/gone.md"], read)).toThrow(/gone\.md/);
  });
});
