export class LanguageError extends Error {}

export type LanguageCode = string; // a whisper language code, or "auto"

const LANGUAGES: Record<string, { name: string; aliases: string[] }> = {
  en: { name: "English", aliases: ["english"] },
  bn: { name: "Bangla", aliases: ["bangla", "bengali"] },
  hi: { name: "Hindi", aliases: ["hindi"] },
  ur: { name: "Urdu", aliases: ["urdu"] },
  ar: { name: "Arabic", aliases: ["arabic"] },
  es: { name: "Spanish", aliases: ["spanish"] },
};

export const DEFAULT_LANGUAGE: LanguageCode = "en";

// Throws before recording starts, so a typo costs nothing.
export function parseLanguage(name: string): LanguageCode {
  const key = name.trim().toLowerCase();
  if (key === "auto") return "auto";
  const match = Object.entries(LANGUAGES).find(([code, { aliases }]) => code === key || aliases.includes(key));
  if (!match) throw new LanguageError(`--lang expects a language name or code such as english, bangla, hindi, urdu, arabic, spanish (or en, bn, hi) or auto, got "${name}"`);
  return match[0];
}

export function languageInstruction(code: LanguageCode): string {
  if (code === "auto") return "Reply in the language of the conversation.";
  const name = LANGUAGES[code]?.name ?? code;
  return `The conversation is in ${name}. Reply in ${name}.`;
}
