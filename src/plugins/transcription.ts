import type { RecorderPlugin } from "./types.ts";

// Body lands in add-transcription.
export const transcription: RecorderPlugin = {
  name: "transcription",
  enabled: (options) => options.transcribe === true || options.liveCaptions === true,
};
