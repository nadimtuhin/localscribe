// Untrusted text (speech, typed notes) goes into prompts inside a block whose tag carries a fresh
// random suffix, so the text cannot close its own block. Look-alike tags are neutralised as well.
const NONCE_BYTES = 8;
const LOOKALIKE_TAG = /<\/?(?:transcript|manual_notes)[\w-]*\s*>/gi;

export const newNonce = () => Buffer.from(crypto.getRandomValues(new Uint8Array(NONCE_BYTES))).toString("hex");

export function untrustedBlock(name: "transcript" | "manual_notes", text: string, nonce = newNonce()): string {
  return `<${name}-${nonce}>\n${text.replace(LOOKALIKE_TAG, "[tag]")}\n</${name}-${nonce}>`;
}
