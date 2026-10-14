## ADDED Requirements

### Requirement: Inline ask
In `localscribe live`, an input line starting with `?` followed by text SHALL be sent to Hermes as a question, together with the last 5 minutes of transcript, the manual notes and the context files. The answer SHALL show in the Hermes pane marked `Q:`/`A:` and be appended to `<base>.suggestions.md`. The line SHALL NOT be saved as a manual note. Other lines SHALL remain notes.

#### Scenario: Question goes to Hermes
- **WHEN** the user submits `?what did they say about budget`
- **THEN** one Hermes call runs with that question and the recent transcript, the pane shows `Q:` and `A:` rows, and `<base>.manual.md` is unchanged

#### Scenario: Asks have priority and never overlap
- **WHEN** an automatic suggestion is running and the user submits a question
- **THEN** no second Hermes call starts; the question runs next, before any further automatic suggestion

### Requirement: Role preset
`start --live` SHALL accept `--role candidate|interviewer|meeting` (default `meeting`), store it in the state `pluginOptions`, and use role-specific instructions in every live Hermes call and a role line in the final notes prompt. Any other value SHALL fail `start`.

#### Scenario: Candidate
- **WHEN** the role is `candidate`
- **THEN** the suggestion prompt asks for concise answer hints and talking points for the latest question asked by `them`

#### Scenario: Interviewer
- **WHEN** the role is `interviewer`
- **THEN** the prompt asks for follow-up questions, gaps and signal to probe

#### Scenario: Meeting
- **WHEN** the role is `meeting` or not given
- **THEN** the prompt asks for action items, decisions and missed points

### Requirement: Context files
`start --live` SHALL accept `--context <path>` any number of times. A missing path SHALL fail `start` with a clear error before recording begins. Each Hermes call SHALL include the files as delimited untrusted data (random delimiter), at most 8000 characters per file and 20000 in total, with truncation stated.

#### Scenario: Missing file
- **WHEN** `--context nope.md` names a file that does not exist
- **THEN** `start` exits 1 with an error naming the path and no recording starts

#### Scenario: Caps
- **WHEN** a context file is longer than 8000 characters
- **THEN** the prompt holds the first 8000 characters and says it was truncated

### Requirement: Question-triggered suggestions
A new `them` line that ends with `?` or starts with a question phrase SHALL trigger a suggestion without waiting for 60 s, with at least 15 s between automatic calls. The 60 s timer SHALL keep working.

#### Scenario: Debounce
- **WHEN** two questions from `them` arrive 5 s apart
- **THEN** only one automatic call runs in that window
