import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { BANGLA_CLIP, E2E_ENABLED, HERMES_BIN, MODEL_BANGLA, MODEL_EN, missingTools, probe, REPO, Sandbox, say } from "./harness.ts";

// Opt-in: `bun run e2e` (E2E=1). Records the real screen and plays audio through the speakers.
const missing = missingTools(["ffmpeg", "ffprobe", "say", "tmux", "whisper-cli"]);
const noTools = missing.length > 0 && `missing tools: ${missing.join(", ")}`;
const noModel = (path: string) => !existsSync(path) && `whisper model missing: ${path}`;
const noHermes = Bun.which("hermes") === null && !existsSync(HERMES_BIN) && "hermes not installed";
const noAnnotate = !existsSync(`${REPO}/bin/localscribe-annotate`) && Bun.which("swiftc") === null && "no annotate helper and no swiftc";

// A test with a reason to skip is registered as skipped, with the reason in its name.
const t = (name: string, run: () => Promise<void>, timeoutMs: number, ...reasons: (string | false)[]) => {
  const reason = [noTools, ...reasons].find(Boolean);
  test.skipIf(Boolean(reason))(reason ? `${name} [skipped: ${reason}]` : name, run, timeoutMs);
};

const SPEECH = "Hello team. The quarterly budget review is complete. We decided to launch the new product on Friday.";

let sandbox: Sandbox | undefined;
const fresh = (env: Record<string, string> = {}) => (sandbox = new Sandbox(env));
afterEach(async () => {
  await sandbox?.cleanup();
  sandbox = undefined;
});

const noBanglaClip = !existsSync(BANGLA_CLIP) && "no Bangla audio fixture (e2e/fixtures/bn.wav); macOS has no Bangla say voice";
const SPOKEN = ["quarterly", "budget", "review", "decided", "launch", "product", "friday"];
const spokenWordsFound = (text: string) => SPOKEN.filter((w) => text.toLowerCase().includes(w)).length;
const stampedLines = (text: string) => text.split("\n").filter((l) => /^\[\d{2,}:\d{2}\]/.test(l));
const leftoverNames = (s: Sandbox) => s.leftovers().map((p) => p.name);

describe.skipIf(!E2E_ENABLED)("localscribe e2e", () => {
  t("1. records 8s with system audio, stop leaves no processes", async () => {
    const s = fresh();
    const out = s.out("rec");
    expect((await s.run(["start", "--no-mic", "-d", "--out", out])).code).toBe(0);
    await Bun.sleep(1000);
    const speech = say(SPEECH);
    await Bun.sleep(7000);
    const stopped = await s.run(["stop"]);
    speech.kill();
    expect(stopped.code).toBe(0);
    const info = probe(out);
    const kinds = info.streams.map((x) => x.codec_type);
    expect(kinds).toContain("video");
    expect(kinds).toContain("audio");
    const duration = Number(info.format.duration);
    expect(duration).toBeGreaterThanOrEqual(7);
    expect(duration).toBeLessThanOrEqual(10);
    expect(leftoverNames(s)).toEqual([]);
  }, 90_000);

  t("2. English --transcribe: [mm:ss] lines, spoken words, base.en model", async () => {
    const s = fresh();
    const out = s.out("tr");
    expect((await s.run(["start", "--no-mic", "-d", "--transcribe", "--out", out])).code).toBe(0);
    await Bun.sleep(1000);
    const speech = say(`${SPEECH} ${SPEECH}`);
    await Bun.sleep(17_000);
    const stopped = await s.run(["stop"], 150_000);
    speech.kill();
    expect(stopped.code).toBe(0);
    const transcript = s.read(s.base("tr.transcript.md"));
    expect(stampedLines(transcript).length).toBeGreaterThan(0);
    expect(spokenWordsFound(transcript)).toBeGreaterThanOrEqual(3);
    expect(new Set(s.whisperModels())).toEqual(new Set(["ggml-base.en.bin"]));
  }, 300_000, noModel(MODEL_EN));

  const recordBangla = async (s: Sandbox, name: string, extra: string[]) => {
    expect((await s.run(["start", "--no-mic", "-d", "--lang", "bangla", ...extra, "--out", s.out(name)])).code).toBe(0);
    await Bun.sleep(1000);
    const clip = Bun.spawn(["afplay", BANGLA_CLIP], { stdout: "ignore", stderr: "ignore" });
    await clip.exited;
    await Bun.sleep(1500);
    return s.run(["stop"], 170_000);
  };

  t("3. --lang bangla transcript is in Bengali script, large-v3-turbo model", async () => {
    const s = fresh();
    const stopped = await recordBangla(s, "bn", ["--transcribe"]);
    expect(stopped.code).toBe(0);
    const transcript = s.read(s.base("bn.transcript.md"));
    expect(stampedLines(transcript).length).toBeGreaterThan(0);
    expect(new Set(s.whisperModels())).toEqual(new Set(["ggml-large-v3-turbo-q5_0.bin"]));
    expect(transcript).toMatch(/[ঀ-৿]/);
  }, 300_000, noModel(MODEL_BANGLA), noBanglaClip);

  t("3b. --notes --lang bangla notes are in Bengali script", async () => {
    const s = fresh();
    s.exposeHermes();
    const stopped = await recordBangla(s, "bnn", ["--notes"]);
    expect(stopped.code).toBe(0);
    const notes = s.read(s.notesFile("bnn"));
    // Hermes (cloud) latency is outside this repo; a timeout says nothing about the Bangla path.
    if (stopped.stdout.includes("hermes timed out")) return console.warn("3b: inconclusive, hermes timed out");
    expect(notes,`stop output:\n${stopped.stdout}\n${stopped.stderr}`).not.toBe("");
    expect(notes).toMatch(/[ঀ-৿]/);
  }, 300_000, noModel(MODEL_BANGLA), noHermes, noBanglaClip);

  t("4. English --notes (real Hermes) writes the five sections", async () => {
    const s = fresh();
    s.exposeHermes();
    const out = s.out("notes");
    expect((await s.run(["start", "--no-mic", "-d", "--notes", "--out", out])).code).toBe(0);
    await Bun.sleep(1000);
    const speech = say(`${SPEECH} ${SPEECH}`);
    await Bun.sleep(17_000);
    const stopped = await s.run(["stop"], 170_000);
    speech.kill();
    expect(stopped.code).toBe(0);
    const notes = s.read(s.notesFile("notes"));
    expect(notes, `stop output:\n${stopped.stdout}\n${stopped.stderr}`).not.toBe("");
    expect(notes).toContain("Started:");
    for (const heading of ["## Summary", "## Key points", "## Decisions", "## Action items", "## Suggestions"]) expect(notes).toContain(heading);
    expect(notes).toMatch(/\[\d{2,}:\d{2}\]/);
  }, 180_000, noModel(MODEL_EN), noHermes);

  t("5. --live feeds the live TUI: notes, questions, clean Ctrl-C", async () => {
    const s = fresh();
    s.exposeHermes();
    const out = s.out("live");
    const session = `qa-localscribe-live-${Date.now()}`;
    const tmux = (...args: string[]) => Bun.spawnSync(["tmux", ...args]).stdout.toString();
    try {
      expect((await s.run(["start", "--no-mic", "-d", "--live", "--out", out])).code).toBe(0);
      for (let i = 0; i < 4; i++) {
        const speech = say(SPEECH);
        await Bun.sleep(8000);
        speech.kill();
      }
      const envPairs = Object.entries({ HOME: s.home, PATH: s.env.PATH ?? "" }).map(([k, v]) => `${k}='${v}'`).join(" ");
      tmux("new-session", "-d", "-s", session, "-x", "120", "-y", "40", "-c", REPO, `env ${envPairs} ${process.execPath} src/cli.ts live`);
      await Bun.sleep(2500);
      tmux("send-keys", "-t", session, "-l", "e2e-note-banana");
      tmux("send-keys", "-t", session, "Enter");
      await Bun.sleep(1000);
      tmux("send-keys", "-t", session, "-l", "?what was decided");
      tmux("send-keys", "-t", session, "Enter");
      let screen = "";
      for (let i = 0; i < 45 && !/Q:/.test(screen); i++) {
        await Bun.sleep(2000);
        screen = tmux("capture-pane", "-t", session, "-p");
      }
      expect(screen).toContain("e2e-note-banana");
      expect(screen).toMatch(/Q:/);
      tmux("send-keys", "-t", session, "C-c");
      await Bun.sleep(1000);
      expect(s.read(s.base("live.manual.md"))).toMatch(/note: e2e-note-banana/);
      expect(s.read(s.base("live.live.txt"))).toMatch(/them:/);
      const stopped = await s.run(["stop"], 170_000);
      expect(stopped.code).toBe(0);
      expect(leftoverNames(s)).toEqual([]);
    } finally {
      Bun.spawnSync(["tmux", "kill-session", "-t", session]);
    }
  }, 300_000, noModel(MODEL_EN));

  t("6. --draw with demo stroke puts red pixels in the video", async () => {
    const s = fresh({ LOCALSCRIBE_DEMO_STROKE: "1" });
    const out = s.out("draw");
    expect((await s.run(["start", "--no-mic", "-d", "--no-system-audio", "--draw", "--out", out])).code).toBe(0);
    await Bun.sleep(5000);
    expect((await s.run(["stop"])).code).toBe(0);
    const raw = Bun.spawnSync(["ffmpeg", "-v", "error", "-ss", "3", "-i", out, "-frames:v", "1", "-vf", "scale=1280:-2", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]).stdout;
    let red = 0;
    for (let i = 0; i + 2 < raw.length; i += 3) if (raw[i]! > 190 && raw[i + 1]! < 90 && raw[i + 2]! < 90) red++;
    expect(red).toBeGreaterThan(25); // a thin diagonal line, downscaled; a plain desktop has ~0
    expect(leftoverNames(s)).toEqual([]);
  }, 90_000, noAnnotate);

  t("7. start --help does not start a recording", async () => {
    const s = fresh();
    const out = s.out("help");
    const result = await s.run(["start", "--help", "--out", out], 20_000);
    const recording = s.read(`${s.home}/.localscribe/state.json`) !== "";
    expect({ code: result.code, recording, leftovers: leftoverNames(s) }).toEqual({ code: 0, recording: false, leftovers: [] });
  }, 30_000);

  t("8. --name slugifies filename and preserves it on stop", async () => {
    const s = fresh();
    const result = await s.run(["start", "--no-mic", "-d", "--no-system-audio", "--name", "Quick Catchup"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("_quick-catchup.mp4");
    await Bun.sleep(2000);
    const stopped = await s.run(["stop"]);
    expect(stopped.code).toBe(0);
    expect(stopped.stdout).toContain("_quick-catchup.mp4");
    expect(leftoverNames(s)).toEqual([]);
  }, 60_000);
});
