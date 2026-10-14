## Why

Live suggestions are generic and only arrive every 60 s. The user wants to ask Hermes a question mid-conversation, tell it which side they are on (candidate, interviewer, meeting), give it background documents, and get a suggestion as soon as the other side asks something.

## What Changes

- Inline ask: in `localscribe live`, an input line starting with `?` is a question to Hermes, not a note. The answer shows in the Hermes pane (`Q:`/`A:`) and is appended to `<base>.suggestions.md`.
- `start --role candidate|interviewer|meeting` (default `meeting`) selects the system instructions for every Hermes call and adds a role line to the final notes prompt.
- `start --context <path>` (repeatable) gives Hermes background files; missing file fails `start` before recording.
- Faster cadence: a new `them` line that looks like a question triggers a suggestion, debounced to 15 s between automatic calls, besides the 60 s timer.

## Capabilities

### Modified Capabilities
- `live-assist`: ask, role, context files, question-triggered cadence.

## Impact

- `src/live/{session,prompt,cadence,suggest,render}.ts`, new `src/live/{context,options}.ts`, `src/commands/{live,shared}.ts`, `src/plugins/{index,types,notes}.ts`, `src/notes/{prompt,generate}.ts`, `src/untrusted.ts`.
- Context file text (size-capped) leaves the machine to Hermes on every call; the `live` startup status already says Hermes may reach a cloud model.
