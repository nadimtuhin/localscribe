import { describe, expect, test } from "bun:test";
import { isLanguageToken, LanguageError, languageInstruction, parseLanguage } from "./language.ts";

describe("isLanguageToken", () => {
  test("identifies valid language tokens and auto", () => {
    expect(isLanguageToken("en")).toBe(true);
    expect(isLanguageToken("Bangla")).toBe(true);
    expect(isLanguageToken("auto")).toBe(true);
    expect(isLanguageToken("klingon")).toBe(false);
  });
});

describe("parseLanguage", () => {
  test("maps names and codes, case-insensitive, to whisper codes", () => {
    const cases: [string, string][] = [
      ["english", "en"], ["EN", "en"], ["Bangla", "bn"], ["bengali", "bn"], ["bn", "bn"],
      ["hindi", "hi"], ["HI", "hi"], ["Urdu", "ur"], ["arabic", "ar"], ["ar", "ar"], ["Spanish", "es"], ["es", "es"], ["auto", "auto"],
    ];
    for (const [name, code] of cases) expect(parseLanguage(name)).toBe(code);
  });

  test("handles multiple languages and arrays", () => {
    expect(parseLanguage("en bn")).toBe("en,bn");
    expect(parseLanguage("en,bn")).toBe("en,bn");
    expect(parseLanguage("english, bangla")).toBe("en,bn");
    expect(parseLanguage(["en", "bn"])).toBe("en,bn");
    expect(parseLanguage("en, en")).toBe("en");
    expect(parseLanguage("")).toBe("en");
    expect(parseLanguage("en auto")).toBe("auto");
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
    expect(languageInstruction("xyz")).toBe("The conversation is in xyz. Reply in xyz.");
  });

  test("auto asks for the language of the conversation", () => {
    expect(languageInstruction("auto")).toBe("Reply in the language of the conversation.");
  });

  test("formats bilingual instruction for multi-language codes", () => {
    expect(languageInstruction("en,bn")).toBe("The conversation is bilingual in English and Bangla. Reply in the languages of the conversation.");
    expect(languageInstruction("en,hi,bn")).toBe("The conversation is bilingual in English, Hindi and Bangla. Reply in the languages of the conversation.");
  });
});
