import type { RecorderPlugin } from "./types.ts";

// Body lands in add-hermes-notes.
export const notes: RecorderPlugin = {
  name: "notes",
  enabled: (options) => options.notes === true,
};
