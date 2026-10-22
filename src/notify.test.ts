import { describe, expect, test } from "bun:test";
import { NOTIFY, notifySaved, type NotifyDeps } from "./notify.ts";
import type { ProcessRunner } from "./runner.ts";

describe("notifySaved", () => {
  test("spawns the notification helper with app title and saved file", () => {
    const spawned: { command: string[]; logFile: string }[] = [];
    const runner = {
      spawnDetached: (command: string[], logFile: string) => {
        spawned.push({ command, logFile });
        return 123;
      },
    } as unknown as ProcessRunner;

    const logged: string[] = [];
    const deps: NotifyDeps = {
      runner,
      ensureHelper: (_r, def) => {
        expect(def).toEqual(NOTIFY);
        return "/bin/localscribe-notify";
      },
      log: (t) => logged.push(t),
    };

    notifySaved("/recordings/test.mp4", deps);
    expect(spawned.length).toBe(1);
    expect(spawned[0].command).toEqual(["/bin/localscribe-notify", "Localscribe", "/recordings/test.mp4"]);
    expect(spawned[0].logFile).toContain("notify.log");
    expect(logged).toEqual([]);
  });

  test("catches Error during helper resolution or spawn and logs a warning", () => {
    const logged: string[] = [];
    const deps: NotifyDeps = {
      runner: {} as ProcessRunner,
      ensureHelper: () => {
        throw new Error("swiftc missing");
      },
      log: (t) => logged.push(t),
    };

    notifySaved("/recordings/test.mp4", deps);
    expect(logged).toEqual(["notification skipped: swiftc missing"]);
  });

  test("catches non-Error thrown and logs string representation", () => {
    const logged: string[] = [];
    const deps: NotifyDeps = {
      runner: {} as ProcessRunner,
      ensureHelper: () => {
        throw "something went wrong";
      },
      log: (t) => logged.push(t),
    };

    notifySaved("/recordings/test.mp4", deps);
    expect(logged).toEqual(["notification skipped: something went wrong"]);
  });
});
