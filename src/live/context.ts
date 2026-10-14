export const MAX_CONTEXT_FILE_CHARS = 8_000;
export const MAX_CONTEXT_TOTAL_CHARS = 20_000;

export interface ContextFile { path: string; text: string }

// Keeps every Hermes call small: first 8k chars of each file, 20k overall, and says what was cut.
export function capContext(files: ContextFile[]): ContextFile[] {
  let left = MAX_CONTEXT_TOTAL_CHARS;
  return files.map(({ path, text }) => {
    const allowed = Math.min(MAX_CONTEXT_FILE_CHARS, left);
    if (allowed <= 0) return { path, text: `[omitted: context limit of ${MAX_CONTEXT_TOTAL_CHARS} characters reached]` };
    if (text.length <= allowed) {
      left -= text.length;
      return { path, text };
    }
    left -= allowed;
    return { path, text: `${text.slice(0, allowed)}\n[truncated at ${allowed} characters]` };
  });
}

export function loadContextFiles(paths: string[], read: (path: string) => string): ContextFile[] {
  return paths.map((path) => {
    try {
      return { path, text: read(path) };
    } catch (error) {
      throw new Error(`cannot read context file ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
