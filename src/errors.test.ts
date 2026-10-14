import { describe, expect, test } from "bun:test";
import { SelectionError } from "./capture/selection.ts";
import { LiveOptionsError } from "./live/options.ts";
import { RecorderError } from "./recorder.ts";
import { WhisperModelError } from "./transcription/core.ts";
import { LanguageError } from "./transcription/language.ts";

describe("user-facing errors", () => {
  const errors = { SelectionError, LiveOptionsError, RecorderError, WhisperModelError, LanguageError };

  for (const [name, ErrorClass] of Object.entries(errors)) {
    test(`${name} is an Error that carries its message and its own name`, () => {
      const error = new ErrorClass("something specific");
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("something specific");
      expect(error.name).toBe(name);
    });
  }
});
