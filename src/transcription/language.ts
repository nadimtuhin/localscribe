export class LanguageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LanguageError";
  }
}

export type LanguageCode = string; // a whisper language code, or "auto", or comma-joined codes like "en,bn"

const LANGUAGES: Record<string, { name: string; aliases: string[] }> = {
  en: { name: "English", aliases: ["english"] },
  bn: { name: "Bangla", aliases: ["bangla", "bengali"] },
  hi: { name: "Hindi", aliases: ["hindi"] },
  ur: { name: "Urdu", aliases: ["urdu"] },
  ar: { name: "Arabic", aliases: ["arabic"] },
  es: { name: "Spanish", aliases: ["spanish"] },
};

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function isLanguageToken(raw: string): boolean {
  const key = raw.trim().toLowerCase();
  if (key === "auto") return true;
  return Object.entries(LANGUAGES).some(([code, { aliases }]) => code === key || aliases.includes(key));
}

function parseSingleLanguage(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (key === "auto") return "auto";
  const match = Object.entries(LANGUAGES).find(([code, { aliases }]) => code === key || aliases.includes(key));
  if (!match) throw new LanguageError(`--lang expects a language name or code such as english, bangla, hindi, urdu, arabic, spanish (or en, bn, hi) or auto, got "${raw}"`);
  return match[0];
}

// Throws before recording starts, so a typo costs nothing.
// Supports single language or multiple languages ("en,bn", "en bn", ["en", "bn"]).
export function parseLanguage(input: string | string[]): LanguageCode {
  const rawList = Array.isArray(input) ? input : input.split(/[,\s]+/);
  const tokens = rawList.map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 0) return DEFAULT_LANGUAGE;
  const codes = [...new Set(tokens.map(parseSingleLanguage))];
  if (codes.includes("auto")) return "auto";
  return codes.join(",");
}

export function languageInstruction(code: LanguageCode): string {
  if (code === "auto") return "Reply in the language of the conversation.";
  const codes = code.split(",");
  if (codes.length === 1) {
    const name = LANGUAGES[codes[0]!]?.name ?? codes[0]!;
    return `The conversation is in ${name}. Reply in ${name}.`;
  }
  const names = codes.map((c) => LANGUAGES[c]?.name ?? c);
  const joined = names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  return `The conversation is bilingual in ${joined}. Reply in the languages of the conversation.`;
}
