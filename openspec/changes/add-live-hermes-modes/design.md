## Decisions

1. **One Hermes call at a time, asks first.** The session keeps a FIFO of asks and the cadence. A single drain loop picks the next job: a queued ask, else an automatic suggestion if the cadence is due. Asks typed during a call wait their turn; automatic suggestions never jump ahead of an ask.
2. **Ask routing.** `applyKey` is unchanged; the session inspects the submitted line. `?` followed by text is an ask (not saved as a note); a bare `?` is ignored; every other line stays a note.
3. **Ask prompt.** The question, then the last 5 min of transcript, manual notes and context files in untrusted blocks, plus the role line. The reply is shown as `Q: <question>` then `A: <line>` rows (max 4 lines). Rows that start with `Q: `, `A: ` or three spaces render without the `- ` bullet.
4. **Roles.** A table `role -> instruction sentence`, used by the suggestion and ask prompts; the final notes prompt gets a one-line "The user's role was ...". Stored in `pluginOptions.role`; defaults to `meeting` when `--live`.
5. **Context files.** `--context` uses `parseArgs` `multiple: true`. `start` resolves each path and fails with a `LiveOptionsError` when one is missing or is not a file, before recording begins. Paths are stored in `pluginOptions.contextFiles`; `live` reads them when the TUI opens. Caps: 8000 chars per file, 20000 total; truncation and omitted files are stated in the prompt. Each file is its own `context_file` untrusted block (random delimiter, look-alike tags neutralised, same as transcript).
6. **Question detection.** `isQuestionLine` is true for a `them:` line whose text ends with `?` or starts with what/how/why/when/where/who/which/can you/could you/tell me/walk me through/describe/explain. `me:` lines never trigger.
7. **Cadence.** `SuggestionCadence.questionHeard()` marks a pending question; `due()` is then true without waiting for 60 s, provided no call is in flight, the retry delay passed, and at least 15 s of wall clock passed since the previous automatic call began. A call clears the mark.

## Risks

- Heuristic detection misfires on rhetorical questions; the 15 s debounce bounds the cost.
- Large context raises Hermes latency; caps bound it.
