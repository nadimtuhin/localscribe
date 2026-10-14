import { describe, expect, test } from "bun:test";
import { keepValidStamps } from "./stamps.ts";

const TWO_MINUTES = 120_000;

describe("keepValidStamps", () => {
  test("keeps stamps inside the recording on plain and checkbox bullets", () => {
    const reply = "## Key points\n- [00:05] opened\n- [01:59] closed\n## Action items\n- [ ] [01:10] send deck";
    expect(keepValidStamps(reply, TWO_MINUTES)).toBe(reply);
  });

  test("drops a stamp past the end of the recording but keeps the bullet", () => {
    expect(keepValidStamps("- [05:00] late claim\n- [ ] [99:99] nonsense", TWO_MINUTES)).toBe("- late claim\n- [ ] nonsense");
  });

  test("drops a stamp whose seconds are not a clock value", () => {
    expect(keepValidStamps("- [00:75] odd", TWO_MINUTES)).toBe("- odd");
  });

  test("allows a stamp exactly at the duration", () => {
    expect(keepValidStamps("- [02:00] at the end", TWO_MINUTES)).toBe("- [02:00] at the end");
  });

  test("leaves bullets without stamps, prose and bracketed text elsewhere alone", () => {
    const reply = "## Summary\nWe met at [09:99] sharp.\n- plain bullet\n- see [03:00] in the middle";
    expect(keepValidStamps(reply, TWO_MINUTES)).toBe(reply);
  });

  test("handles star bullets and indented sub-bullets", () => {
    expect(keepValidStamps("* [03:00] star\n  - [03:00] nested", TWO_MINUTES)).toBe("* star\n  - nested");
  });
});
