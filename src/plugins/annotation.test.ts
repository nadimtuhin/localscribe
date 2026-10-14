import { describe, expect, test } from "bun:test";
import { HELP } from "../commands/shared.ts";
import { renderScreen } from "../live/render.ts";
import type { ProcessRunner } from "../runner.ts";
import { createAnnotationPlugin } from "./annotation.ts";
import { pluginOptionsFromFlags, plugins } from "./index.ts";
import type { StartedContext } from "./types.ts";

function setup() {
  const spawned: { command: string[]; logFile: string }[] = [];
  const runner = { spawnDetached: (command: string[], logFile: string) => (spawned.push({ command, logFile }), 777) } as unknown as ProcessRunner;
  return { spawned, plugin: createAnnotationPlugin({ runner, ensureHelper: () => "/bin/localscribe-annotate" }) };
}

describe("annotation plugin", () => {
  test("--draw sets PluginOptions.draw and enables it", () => {
    expect(pluginOptionsFromFlags({ draw: true }).draw).toBe(true);
    expect(pluginOptionsFromFlags({}).draw).toBe(false);
    const { plugin } = setup();
    expect(plugin.enabled({ draw: true })).toBe(true);
    expect(plugin.enabled({ notes: true })).toBe(false);
  });

  test("start spawns the helper with the recorder pid and registers it as a sidecar", async () => {
    const { plugin, spawned } = setup();
    const sidecars: [number, string][] = [];
    const ctx: StartedContext = { base: "/r/demo", options: { draw: true }, recorderPid: 4321, log: () => {}, addSidecar: (pid, exe) => void sidecars.push([pid, exe]) };
    await plugin.start!(ctx);
    expect(spawned).toEqual([{ command: ["/bin/localscribe-annotate", "--parent-pid", "4321"], logFile: "/r/demo.annotate.log" }]);
    expect(sidecars).toEqual([[777, "localscribe-annotate"]]);
  });

  test("registered after notes", () => {
    expect(plugins.map((p) => p.name).at(-1)).toBe("annotation");
  });

  test("help and live header mention drawing", () => {
    expect(HELP).toContain("--draw");
    expect(renderScreen({ captions: [], suggestions: [], status: "", input: "" }, { cols: 100, rows: 10 })).toContain("Ctrl+Opt+D draw");
  });
});
