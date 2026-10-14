import { describe, expect, test } from "bun:test";
import { LanguageError, languageInstruction, parseLanguage } from "./language.ts";

describe("parseLanguage", () => {
  test("maps names and codes, case-insensitive, to whisper codes", () => {
    const cases: [string, string][] = [
      ["english", "en"], ["EN", "en"], ["Bangla", "bn"], ["bengali", "bn"], ["bn", "bn"],
      ["hindi", "hi"], ["HI", "hi"], ["Urdu", "ur"], ["arabic", "ar"], ["ar", "ar"], ["Spanish", "es"], ["es", "es"], ["auto", "auto"],
    ];
    for (const [name, code] of cases) expect(parseLanguage(name)).toBe(code);
  });

  test("an unknown name fails with examples", () => {
    expect(() => parseLanguage("klingon")).toThrow(LanguageError);
    expect(() => parseLanguage("klingon")).toThrow(/--lang expects .*english.*bangla.*hindi.*auto.*got "klingon"/);
  });
});

describe("languageInstruction", () => {
  test("names the language and asks for replies in it", () => {
    expect(languageInstruction("hi")).toBe("The conversation is in Hindi. Reply in Hindi.");
    expect(languageInstruction("en")).toBe("The conversation is in English. Reply in English.");
  });

  test("auto asks for the language of the conversation", () => {
    expect(languageInstruction("auto")).toBe("Reply in the language of the conversation.");
  });
});
