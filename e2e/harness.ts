import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const E2E_ENABLED = process.env.E2E === "1";
export const REPO = resolve(import.meta.dir, "..");
const REAL_HOME = homedir();
export const MODELS = join(REAL_HOME, ".hermes/models/whisper");
export const MODEL_EN = join(MODELS, "ggml-base.en.bin");
export const MODEL_MULTI = join(MODELS, "ggml-small.bin");
export const MODEL_BANGLA = join(MODELS, "ggml-large-v3-turbo-q5_0.bin");
export const BANGLA_CLIP = join(import.meta.dir, "fixtures/bn.wav");
export const HERMES_BIN = join(REAL_HOME, ".local/bin/hermes");

// Processes a recording can leave behind; the bun live-worker is matched by its command line.
const HELPERS = ["ffmpeg", "sysaudio", "livesys", "localscribe-annotate", "whisper-cli"] as const;
const WORKER_PATTERN = "cli.ts live-worker";

export const missingTools = (tools: string[]) => tools.filter((tool) => Bun.which(tool) === null);

const pgrep = (args: string[]): number[] =>
  Bun.spawnSync(["pgrep", ...args]).stdout.toString().split("\n").filter(Boolean).map(Number);

const helperPids = () => [
  ...HELPERS.flatMap((name) => pgrep(["-x", name]).map((pid) => ({ pid, name }))),
  ...pgrep(["-f", WORKER_PATTERN]).map((pid) => ({ pid, name: "live-worker" })),
];

export interface Run { code: number; stdout: string; stderr: string }

// One isolated HOME + output dir per test. Processes that existed before the test are never touched.
export class Sandbox {
  readonly root = mkdtempSync(join(tmpdir(), "localscribe-e2e-"));
  readonly home = join(this.root, "home");
  readonly outDir = join(this.root, "out");
  private readonly baseline = new Set(helperPids().map((p) => p.pid));
  readonly env: Record<string, string>;

  constructor(env: Record<string, string> = {}) {
    mkdirSync(this.home, { recursive: true });
    mkdirSync(this.outDir, { recursive: true });
    // mise shims read config from $HOME and refuse to run under a fake one, so drop them from PATH.
    // Ensure native Homebrew on Apple Silicon precedes /usr/local/bin so modern ffmpeg is preferred.
    const rawDirs = (process.env.PATH ?? "").split(":").filter((dir) => !dir.includes("/mise/shims"));
    const path = ["/opt/homebrew/bin", ...rawDirs.filter((d) => d !== "/opt/homebrew/bin")].join(":");
    this.env = { ...(process.env as Record<string, string>), HOME: this.home, PATH: path, ...env };
    // Models resolve from $HOME, so default model selection is exercised through a read-only link.
    mkdirSync(join(this.home, ".hermes/models"), { recursive: true });
    symlinkSync(MODELS, join(this.home, ".hermes/models/whisper"));
    this.shim("whisper-cli", `echo "$@" >> '${this.whisperLog}'\nexec '${Bun.which("whisper-cli")}' "$@"`);
  }

  readonly whisperLog = join(this.root, "whisper-args.log");
  // Model file names whisper-cli was invoked with, in order.
  whisperModels = () => this.read(this.whisperLog).split("\n").flatMap((line) => line.match(/-m (\S+)/)?.[1] ?? []).map((m) => m.split("/").pop());

  notesFile = (prefix: string) => {
    try {
      const names = readdirSync(this.outDir);
      const found = names.find((n) => n.startsWith(prefix) && n.endsWith(".notes.md"));
      return found ? join(this.outDir, found) : join(this.outDir, `${prefix}.notes.md`);
    } catch {
      return join(this.outDir, `${prefix}.notes.md`);
    }
  };

  private shim(name: string, body: string) {
    const dir = join(this.root, "shim");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
    if (!this.env.PATH!.startsWith(`${dir}:`)) this.env.PATH = `${dir}:${this.env.PATH}`;
  }

  out = (name: string) => join(this.outDir, `${name}.mp4`);
  base = (name: string) => join(this.outDir, name);
  read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");

  // Hermes derives its install paths from $HOME and rewrites its own wrapper scripts, so it must run
  // with the real HOME. A PATH shim does that while localscribe itself keeps the sandboxed one.
  exposeHermes() {
    this.shim("hermes", `HOME='${REAL_HOME}' exec '${HERMES_BIN}' "$@"`);
  }

  async run(args: string[], timeoutMs = 120_000): Promise<Run> {
    const proc = Bun.spawn([process.execPath, "src/cli.ts", ...args], { cwd: REPO, env: this.env, stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: timeoutMs, killSignal: "SIGKILL" });
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { code, stdout, stderr };
  }

  leftovers = () => helperPids().filter((p) => !this.baseline.has(p.pid));

  async cleanup() {
    await this.run(["stop"], 60_000).catch(() => undefined);
    for (const { pid } of this.leftovers()) {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
    await Bun.sleep(300);
    rmSync(this.root, { recursive: true, force: true });
  }
}

export function say(text: string, voice?: string, rate = 150) {
  return Bun.spawn(["say", ...(voice ? ["-v", voice] : []), "-r", String(rate), text], { stdout: "ignore", stderr: "ignore" });
}

export interface Probe { streams: { codec_type: string }[]; format: { duration: string } }
export function probe(file: string): Probe {
  const out = Bun.spawnSync(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", file]).stdout.toString();
  return JSON.parse(out);
}

export const hasVoice = (voice: string) => Bun.spawnSync(["say", "-v", "?"]).stdout.toString().split("\n").some((l) => l.startsWith(`${voice} `));
