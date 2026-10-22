import { createOptimizeCommand, type OptimizeDeps } from "./optimize.ts";
import type { Command } from "./shared.ts";

export function createQueueCommand(deps?: OptimizeDeps): Command {
  const optimize = createOptimizeCommand(deps);
  return async ({ positionals, values }) =>
    optimize({ positionals, values: { ...values, status: values.clear ? false : true } });
}

export const queueCommand = createQueueCommand();
