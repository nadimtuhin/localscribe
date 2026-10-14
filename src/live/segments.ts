export type Speaker = "me" | "them";

export const SEGMENT_SECONDS = 6;
const SPEAKER_ORDER: Record<Speaker, number> = { me: 0, them: 1 };
const WAV_HEADER_BYTES = 44;
const BYTES_PER_SECOND = 16_000 * 2; // 16 kHz mono s16

export const buildMicSegmentArgs = ({ micDevice, dir }: { micDevice: number; dir: string }) => [
  "-nostdin", "-hide_banner", "-f", "avfoundation", "-i", `:${micDevice}`, "-ac", "1", "-ar", "16000",
  "-f", "segment", "-segment_time", String(SEGMENT_SECONDS), "-segment_format", "wav", "-segment_start_number", "1", `${dir}/me_%05d.wav`,
];

export function parseSegmentName(name: string): { who: Speaker; seq: number } | null {
  const match = /^(me|them)_(\d+)\.wav$/.exec(name);
  return match ? { who: match[1] as Speaker, seq: Number(match[2]) } : null;
}

// A segment is closed once a later one of the same speaker exists; `flush` also releases the open ones.
export function readySegments(names: string[], done: Set<string>, flush: boolean): string[] {
  const parsed = names.flatMap((name) => {
    const segment = parseSegmentName(name);
    return segment ? [{ name, ...segment }] : [];
  });
  const lastSeq = (who: Speaker) => Math.max(-1, ...parsed.filter((s) => s.who === who).map((s) => s.seq));
  const last = { me: lastSeq("me"), them: lastSeq("them") };
  return parsed
    .filter((s) => !done.has(s.name) && (flush || s.seq < last[s.who]))
    .sort((a, b) => a.seq - b.seq || SPEAKER_ORDER[a.who] - SPEAKER_ORDER[b.who])
    .map((s) => s.name);
}

// Times are relative to the recording start. mtime is when the segment closed.
export function segmentSpan(file: { mtimeMs: number; bytes: number }, recordingStartMs: number) {
  const durationMs = (Math.max(0, file.bytes - WAV_HEADER_BYTES) / BYTES_PER_SECOND) * 1000;
  const endMs = file.mtimeMs - recordingStartMs;
  return { startMs: Math.max(0, endMs - durationMs), endMs };
}
