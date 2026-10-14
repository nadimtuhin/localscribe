## Decisions

1. **One capture helper, three targets.** `localscribe-capture --display <id> | --window <id> | --area x,y,w,h [--display <id>] --out <video.mp4> [--system-audio <sys.m4a>]`. Uses `SCContentFilter(display:excludingWindows:)`, `SCContentFilter(desktopIndependentWindow:)`, and `SCStreamConfiguration.sourceRect` for areas. Writes H.264 via AVAssetWriter at the display's native pixel size × `scaleFactor`. Same SIGINT/finish-once rules as today's `sysaudio`.
2. **Mic stays in ffmpeg** (audio-only avfoundation input → `<base>.mic.m4a`), so mic choice keeps working the same way. Final mux: SCK video + system audio + mic → `<base>.mp4` (amix as today).
3. **Clock alignment:** all three parts start within one `start` call; the helper anchors at host-clock now (same technique as the current sysaudio fix). Verify with a clap test: sound and visual within 100ms.
4. **`devices --json`** shape (the GUI depends on it):
   ```json
   { "displays": [{ "id": 1, "name": "Built-in", "width": 1512, "height": 982, "scale": 2 }],
     "windows":  [{ "id": 4242, "app": "Safari", "title": "GitHub" }],
     "microphones": [{ "device": 0, "name": "MacBook Pro Microphone" }] }
   ```
   Displays and windows come from the helper (`localscribe-capture --list --json`); mics from the existing ffmpeg parser.
5. **GUI is a thin client.** SwiftUI `MenuBarExtra`; runs `localscribe devices --json`, `start …`, `stop`, `status`. Area picking: borderless full-screen transparent window, drag a rectangle, Esc cancels, returns points. Window picking: list from `devices` with app icons (click-to-highlight is a follow-up).
6. **Engine flag:** `--engine sck|ffmpeg`, default `sck` once the parity smoke passes; until then default `ffmpeg`.

## Risks

- ScreenCaptureKit window capture of minimized/off-screen windows yields black frames; document it.
- The GUI app needs its own Screen Recording permission (different bundle than the terminal).
- Two Swift build targets increase setup; the CLI auto-builds the helper as today, and the GUI is built with `swift build -c release` on demand.
