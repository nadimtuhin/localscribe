export interface CaptureOptions {
  screenDevice: number; // avfoundation video device index; "Capture screen 0" is often [1] after the camera
  micDevice?: number; // avfoundation audio device index; omit to record video only
  fps: number;
  file: string;
}

export function buildArgs({ screenDevice, micDevice, fps, file }: CaptureOptions): string[] {
  const audioInput = micDevice === undefined ? "none" : String(micDevice);
  const audioCodec = micDevice === undefined ? [] : ["-c:a", "aac", "-b:a", "160k"];
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "avfoundation", "-capture_cursor", "1", "-framerate", String(fps),
    "-i", `${screenDevice}:${audioInput}`,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    ...audioCodec,
    // Fragmented mp4 stays playable even if ffmpeg dies before finalizing.
    "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
    file,
  ];
}

export interface MuxOptions {
  video: string; // part file from the capture step
  videoHasMic: boolean;
  systemAudio: string;
  out: string;
}

// Combines the captured video (optionally carrying mic audio) with the system-audio part.
export function buildMuxArgs({ video, videoHasMic, systemAudio, out }: MuxOptions): string[] {
  const inputs = ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-i", systemAudio];
  if (videoHasMic) {
    return [
      ...inputs,
      "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:normalize=0[mixed]",
      "-map", "0:v", "-map", "[mixed]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      out,
    ];
  }
  return [...inputs, "-map", "0:v", "-map", "1:a", "-c", "copy", out];
}

export interface Device { device: number; name: string }

// Parses `ffmpeg -f avfoundation -list_devices true -i ""` stderr into its two sections.
// Audio indices restart at 0, so each section is scanned separately.
function splitDeviceList(listOutput: string) {
  const [video = "", audio = ""] = listOutput.split("AVFoundation audio devices");
  return { video, audio };
}

function parseDevices(section: string): Device[] {
  return [...section.matchAll(/\] \[(\d+)\] (.+)/g)].map((match) => ({
    device: Number(match[1]),
    name: match[2]!.trim(),
  }));
}

export const parseScreens = (listOutput: string): Device[] =>
  parseDevices(splitDeviceList(listOutput).video).filter((d) => d.name.startsWith("Capture screen"));

export const parseMicrophones = (listOutput: string): Device[] => parseDevices(splitDeviceList(listOutput).audio);

export interface MicOptions { micDevice: number; file: string }

// SCK engine: ffmpeg only records the microphone; video and system audio come from the capture helper.
export const buildMicArgs = ({ micDevice, file }: MicOptions): string[] => [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "avfoundation", "-i", `none:${micDevice}`,
  "-c:a", "aac", "-b:a", "160k",
  file,
];

export interface SckMuxOptions {
  video: string; // video-only part from the capture helper
  audio: string[]; // system and/or mic parts that exist and are non-empty (1 or 2)
  out: string;
}

export function buildSckMuxArgs({ video, audio, out }: SckMuxOptions): string[] {
  const inputs = ["-hide_banner", "-loglevel", "error", "-y", "-i", video, ...audio.flatMap((path) => ["-i", path])];
  if (audio.length === 1) return [...inputs, "-map", "0:v", "-map", "1:a", "-c", "copy", out];
  return [
    ...inputs,
    "-filter_complex", "[1:a][2:a]amix=inputs=2:duration=longest:normalize=0[mixed]",
    "-map", "0:v", "-map", "[mixed]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    out,
  ];
}

const TOOL_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

// A GUI launched from Finder gets a minimal PATH without Homebrew, so ffmpeg would not be found.
export function withToolPaths(path: string | undefined): string {
  const present = (path ?? "").split(":").filter(Boolean);
  return [...present, ...TOOL_DIRS.filter((dir) => !present.includes(dir))].join(":");
}

export const ensureToolPath = () => {
  process.env.PATH = withToolPaths(process.env.PATH);
};
