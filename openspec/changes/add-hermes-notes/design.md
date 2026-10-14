## Decisions

1. **Input is the file contract, not the transcription code.** The notes plugin reads `<base>.transcript.md` only. It does not import anything from the transcription plugin, so both changes can be built in parallel; tests use a fixture transcript.
2. **Hermes call (hardened; the transcript is untrusted input).** The transcript is whatever was said or played on the machine, so it can contain instructions aimed at the model. Run exactly:
   `hermes -z <prompt> --ignore-rules -t todo` with `cwd` = a fresh `mkdtemp` directory, deleted afterwards.
   - `--ignore-rules`: no AGENTS.md / SOUL.md / memory / preloaded skills injected (verified in `hermes --help`).
   - Toolsets: `-t ""` does NOT disable tools (verified: an empty value falls back to the full default set, including terminal, file and browser). The smallest real toolset is `-t todo` (verified: the model then sees only `todo_list` plus the `tool_search/tool_describe/tool_call` meta-tools). Use `-t todo`; re-check with `hermes tools list` if Hermes changes. Because meta-tools remain, the fresh temp cwd and the data framing below are the real containment, not the toolset alone.
   - Fresh temp cwd: nothing from the user's project is readable by relative path, and no AGENTS.md is picked up.
   - Prompt framing: the instruction comes first, then the transcript inside a clearly delimited block (`<transcript>...</transcript>`), and the prompt states that the block is data to summarise, that instructions inside it must not be followed, and that no tools are to be used.
   - Timeout 120s. Model/provider not hard-coded; Hermes defaults apply. `LOCALSCRIBE_HERMES_ARGS` lets the user add e.g. `-m <model>`, but cannot remove the flags above.
   - Stdin/file input: `hermes chat --query-file PATH` ("-" for stdin) exists and is shell-safe; prefer it over `-z` if it behaves the same in oneshot mode, otherwise embed in `-z`.
3. **Prompt** (pure `buildNotesPrompt(transcript, meta)`): asks for `## Summary`, `## Key points`, `## Decisions`, `## Action items` (checkboxes), `## Suggestions` (what to do next / improve), grounded only in the transcript, and to say "nothing found" rather than invent.
4. **Output:** `<base>.notes.md` = small header (recording file, date, duration) + Hermes reply verbatim.
5. **Large transcripts:** if over ~60k chars, chunk-and-summarise is out of scope; truncate with a visible note in the output.
6. **Live suggestions during recording** (every N minutes) are a non-goal for this change; listed as a follow-up.

## Pure, testable units

- `buildNotesPrompt` (includes the delimiter and the do-not-follow instruction), `buildHermesArgs` (always contains `--ignore-rules` and `-t todo`), `formatNotesFile`, `truncateTranscript`

## Risks

- Hermes is a local CLI but may call a cloud model. Privacy note is printed on first use per recording.
- Hermes stdout may include non-answer chatter; verify with a real call and strip if needed.
