## Decisions

1. **Segment files instead of streaming.** `whisper-stream` only hears the mic and re-emits overlapping text (seen with `--step 3000`). Instead both sides are cut into non-overlapping 16 kHz mono WAV segments (~6 s) in `<base>.live/`, named `me_00001.wav` / `them_00001.wav`. Each segment is transcribed exactly once with `whisper-cli`, so duplicates cannot occur by construction; the worker also drops a line identical to the previous line of the same speaker (whisper repeat hallucination).
2. **Mic segmenter:** `ffmpeg -f avfoundation -i :<micDevice> -ac 1 -ar 16000 -f segment -segment_time 6 -segment_format wav <dir>/me_%05d.wav`. Sidecar exe `ffmpeg`. Skipped with `--no-mic`.
3. **System segmenter:** new `native/livesys.swift` (compiled on first use to `bin/livesys`, same pattern as `sysaudio`). ScreenCaptureKit with `sampleRate=16000, channelCount=1`; every 6 s of samples it writes `them_NNNNN.wav` via `.part` + rename. A separate file, so the screen/window-selection work on `sysaudio.swift` and `recorder.ts` does not conflict. Sidecar exe `livesys`. Skipped with `--no-system-audio`.
4. **Ready rule:** a segment is ready when a higher-numbered segment of the same speaker exists (it is closed), or when the worker is flushing at shutdown. Each file is processed once (a `done` set).
5. **Clock:** segment end = file mtime, start = end - duration, duration from file size (`(bytes-44)/32000` s). Line time = start - recording `startedAt` (read from the state file). Robust to helper start lag and silent gaps.
6. **Ordering:** two speakers finish out of order. `LiveMerger` holds lines and releases them sorted by time once every active speaker's processed progress has passed them, or after a 15 s hold cap (a silent speaker never blocks). `<base>.live.txt` is append-only and chronological: `[mm:ss] who: text`. Non-speech markers (`[BLANK_AUDIO]`, `(music)`) are dropped.
7. **Worker:** hidden command `localscribe live-worker <base>` (a sidecar, exe `bun`) polls the segment dir, transcribes, merges, appends. It exits when the recording is no longer active.
8. **Suggestions:** the TUI process owns the loop. A call fires when latest transcript time minus the last suggested mark is >= 60 s, no Hermes call is in flight, and (after a failure) 15 s have passed. Prompt: last 5 min of transcript plus manual notes in delimited untrusted-data blocks; reply is 1-3 short bullets. Invocation reuses `buildHermesArgs` (`--ignore-rules -t todo -z`), a temp cwd and a timeout. Failures set a dim status line only.
9. **Manual notes:** `[mm:ss] note: text` with the recording clock (now - startedAt), appended to `<base>.manual.md`.
10. **TUI:** raw ANSI plus stdin keypress handling, no dependencies. `renderScreen(state, size)` is a pure function returning the frame string; the controller only wires IO.
11. **Final notes:** `generateNotes` reads `<base>.manual.md` when present and the prompt gets a `<manual_notes>` block.

## Pure, injectable units

Segment readiness and timing, line formatting and merge, suggestion cadence (injected clock), suggestion prompt, manual-note stamping, screen rendering. Hermes goes through the existing `HermesRun` seam.

## Risks

- Segment boundaries can cut a word; accepted for a live view (the final transcript is post-hoc).
- Mic and Screen Recording permissions are required for the extra capture processes, same as the recorder.
- `base.en` is English only.
