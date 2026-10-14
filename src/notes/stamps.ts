// A bullet, optionally a "[ ]"/"[x]" checkbox, then a [mm:ss] stamp.
const STAMPED_BULLET = /^(\s*[-*]\s+(?:\[[ xX]\]\s+)?)\[(\d+):(\d{2})\]\s*/;

// Hermes is asked to stamp each bullet with the transcript time it came from. A stamp it
// invented (past the recording, or not a clock value) is dropped; the bullet stays.
export function keepValidStamps(reply: string, limitMs: number): string {
  return reply
    .split("\n")
    .map((line) => {
      const match = STAMPED_BULLET.exec(line);
      if (!match) return line;
      const [whole, lead = "", minutes = "0", seconds = "0"] = match;
      const valid = Number(seconds) < 60 && (Number(minutes) * 60 + Number(seconds)) * 1000 <= limitMs;
      return valid ? line : `${lead}${line.slice(whole.length)}`;
    })
    .join("\n");
}
