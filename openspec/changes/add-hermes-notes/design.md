## Decisions

1. **Input is the file contract, not the transcription code.** The notes plugin reads `<base>.transcript.md` only. It does not import anything from the transcription plugin, so both changes can be built in parallel; tests use a fixture transcript.
2. **Hermes call:** `hermes -z <prompt>` with the transcript embedded in the prompt (stdin support unverified; check `hermes --help` first and prefer stdin or a file reference if available). Timeout 120s. Model/provider not hard-coded; Hermes defaults apply. `LOCALSCRIBE_HERMES_ARGS` lets the user add e.g. `-m <model>`.
3. **Prompt** (pure `buildNotesPrompt(transcript, meta)`): asks for `## Summary`, `## Key points`, `## Decisions`, `## Action items` (checkboxes), `## Suggestions` (what to do next / improve), grounded only in the transcript, and to say "nothing found" rather than invent.
4. **Output:** `<base>.notes.md` = small header (recording file, date, duration) + Hermes reply verbatim.
5. **Large transcripts:** if over ~60k chars, chunk-and-summarise is out of scope; truncate with a visible note in the output.
6. **Live suggestions during recording** (every N minutes) are a non-goal for this change; listed as a follow-up.

## Pure, testable units

- `buildNotesPrompt`, `buildHermesArgs`, `formatNotesFile`, `truncateTranscript`

## Risks

- Hermes is a local CLI but may call a cloud model. Privacy note is printed on first use per recording.
- Hermes stdout may include non-answer chatter; verify with a real call and strip if needed.
