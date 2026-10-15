# e2e suite

Opt-in, real: records the screen, plays `say` through the speakers, runs whisper and Hermes.

    bun run e2e          # about 3 minutes; plain `bun test` never touches this directory

Needs: ffmpeg, ffprobe, tmux, whisper-cli, Screen Recording permission for your terminal, speaker volume up,
models in `~/.hermes/models/whisper/`. Missing tools or models skip the affected test with the reason in its name.
Hermes (case 4, and `ask` in case 5) uses your real Hermes install and may reach a cloud model.

Isolation: each test gets a temp `HOME` (so `~/.localscribe` and `~/Movies` are untouched) and `--out` in a temp dir.
Hermes runs through a PATH shim with the real `HOME`, because it rewrites its own wrapper scripts from `$HOME`.
After each test the helpers it started (ffmpeg, sysaudio, livesys, localscribe-annotate, whisper-cli, live-worker)
are killed by comparing against the PIDs that existed before the test.

Menu-bar app (not covered by e2e): `bun run bar` builds `native/LocalscribeBar`; run `native/LocalscribeBar/.build/release/LocalscribeBar &`
from a terminal that has Screen Recording permission. It shells out to `bun <repo>/src/cli.ts` (override with `LOCALSCRIBE_CLI`,
`LOCALSCRIBE_BUN`). Its pure logic is tested with `bun run bar:test`. On a notched MacBook with a crowded menu bar the item can
hide under the notch; Cmd-drag other items away.

Case 7 (`start --help` must not record) is `test.todo` until that bug is fixed.
