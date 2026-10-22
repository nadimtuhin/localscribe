<div align="center">

```
██╗      ██████╗  ██████╗ █████╗ ██╗     ███████╗ ██████╗██████╗ ██╗██████╗ ███████╗
██║     ██╔═══██╗██╔════╝██╔══██╗██║     ██╔════╝██╔════╝██╔══██╗██║██╔══██╗██╔════╝
██║     ██║   ██║██║     ███████║██║     ███████╗██║     ██████╔╝██║██████╔╝█████╗  
██║     ██║   ██║██║     ██╔══██║██║     ╚════██║██║     ██╔══██╗██║██╔══██╗██╔══╝  
███████╗╚██████╔╝╚██████╗██║  ██║███████╗███████║╚██████╗██║  ██║██║██████╔╝███████╗
╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═════╝ ╚══════╝
```

# **LOCALSCRIBE**
### **The Zero-Cloud Screen Recorder, Live Whisper HUD & AI Meeting Intelligence for macOS**

<p align="center">
  <strong>No virtual audio drivers. No cloud bots. No data leakage. 100% on-device native engineering.</strong>
</p>

<p align="center">
  <a href="https://github.com/nadimtuhin/localscribe"><img src="https://img.shields.io/badge/Platform-macOS%2013%2B-black?style=for-the-badge&logo=apple" alt="macOS" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Runtime-Bun-F472B6?style=for-the-badge&logo=bun" alt="Bun" /></a>
  <a href="https://developer.apple.com/documentation/screencapturekit"><img src="https://img.shields.io/badge/Engine-ScreenCaptureKit%20%2B%20Swift-FA7343?style=for-the-badge&logo=swift" alt="Swift" /></a>
  <a href="https://github.com/ggerganov/whisper.cpp"><img src="https://img.shields.io/badge/STT-whisper.cpp-00E5FF?style=for-the-badge" alt="Whisper" /></a>
  <a href="https://localscribe-48f.pages.dev"><img src="https://img.shields.io/badge/Live%20Site-Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare" alt="Cloudflare" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-FFDE00?style=for-the-badge" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="#-the-problem--the-localscribe-solution"><b>Why Localscribe?</b></a> •
  <a href="#-quick-start"><b>Quick Start</b></a> •
  <a href="#-feature-arsenal"><b>Feature Arsenal</b></a> •
  <a href="#-interactive-tui-live-assist"><b>Live HUD</b></a> •
  <a href="#-menu-bar-companion-localscribebar"><b>Menu Bar App</b></a> •
  <a href="#-cli-reference"><b>CLI Reference</b></a> •
  <a href="https://localscribe-48f.pages.dev"><b>Homepage ↗</b></a>
</p>

</div>

---

## ⚡ The Problem & The Localscribe Solution

| Capability | Cloud Bots (Otter, Fireflies) | Traditional Desktop (Loom, Granola) | OBS Studio | **Localscribe** |
| :--- | :---: | :---: | :---: | :---: |
| **Privacy / 100% On-Device** | ❌ Sent to cloud servers | ❌ Synced to cloud | ✅ Local disk | **✅ 100% Local / Zero Leaks** |
| **System Audio Capture** | ❌ Bot joins call | ⚠️ Requires virtual drivers | ⚠️ Complex audio routing | **✅ Native ScreenCaptureKit (Zero drivers)** |
| **Microphone Isolation** | ❌ Combined track | ⚠️ Mixed audio stream | ✅ Multi-track | **✅ Separate tracks + auto-mux** |
| **Realtime Dual-Speaker HUD** | ❌ Post-call only | ❌ None | ❌ None | **✅ Live TUI (`me:` vs `them:`)** |
| **Inline Realtime AI Assist** | ❌ None | ❌ Post-call only | ❌ None | **✅ Live `?question` in terminal** |
| **Timestamped AI Notes** | ⚠️ Cloud summary | ⚠️ Web UI | ❌ None | **✅ Local Markdown `[mm:ss]` stamped** |
| **Menu Bar Companion** | ❌ None | ⚠️ Heavy Electron app | ❌ Heavy desktop window | **✅ Native Swift MenuBarExtra** |
| **Multi-Language Whisper** | ⚠️ Generic cloud model | ⚠️ English-first | ❌ None | **✅ Bangla large-v3-turbo, Hindi, Urdu, etc.** |

---

## 🚀 Quick Start

### 1. Prerequisites (macOS 13+ Ventura / Sonoma / Sequoia)

```bash
# 1. Install Bun runtime
curl -fsSL https://bun.sh/install | bash

# 2. Install FFmpeg
brew install ffmpeg

# 3. Ensure Xcode command-line tools are installed (compiles native Swift helpers)
xcode-select --install

# 4. (Optional) Install whisper-cli for local transcription
brew install whisper-cpp

# 5. (Optional) Install Hermes CLI for AI meeting notes
# https://hermes-agent.nousresearch.com/docs
```

### 2. Global Installation via npm

```bash
npm install -g localscribe
```

*Or install from source:*

```bash
git clone https://github.com/nadimtuhin/localscribe.git
cd localscribe
bun install
bun test
```

---

## 🛠️ Feature Arsenal

### 1. 🎥 Native ScreenCaptureKit Engine
- **Full Display:** Record primary or secondary monitors (`--display 1`).
- **Target Single Window:** Record a window by exact name or substring (`--window "Safari"`).
- **Interactive Click-to-Pick Window:** Click any app on screen with graphical highlight (`--window pick`).
- **Interactive Drag-to-Select Area:** Drag a rectangle across your desktop to capture only what you want (`--area pick`).

### 2. 🔊 Lossless System Audio + Microphone Isolation
- **No Virtual Audio Devices:** No BlackHole, Soundflower, or kernel extensions. Localscribe taps ScreenCaptureKit's system audio buffer directly.
- **Isolated Tracks:** Internal system sound and microphone audio are recorded on dedicated tracks, volume-normalized, and muxed into clean AAC MP4 upon stopping.

### 3. 🧠 On-Device Whisper Speech-to-Text
- Runs locally with `whisper.cpp` (`whisper-cli`).
- Automatic language model routing:
  - English: `ggml-base.en.bin`
  - Bangla: `ggml-large-v3-turbo-q5_0.bin` (ensures accurate Bengali Unicode script)
  - Hindi, Urdu, Spanish, Arabic, etc.: `ggml-small.bin`
  - Auto-detection: `--lang auto`

### 4. 📝 Timestamped Meeting Intelligence
- Powered by Hermes in an isolated sandbox.
- Turns conversation transcripts into structured notes:
  - `## Title` (Auto-generated concise slug)
  - `## Summary`
  - `## Key points`
  - `## Decisions` (Stamped with `[mm:ss]` transcript clock)
  - `## Action items` (Interactive checkbox syntax `- [ ]`)
  - `## Suggestions`

---

## 📟 Interactive TUI Live Assist

Start a meeting or interview recording with `--live`:

```bash
localscribe start --name "Staff SWE Technical Interview" --live --role candidate --context resume.pdf
```

The interactive terminal takes over with a live dual-speaker feed and AI co-pilot:

```
┌────────────────────────────────────────────────────────────────────────┐
│  LOCALSCRIBE LIVE ASSIST — [ROLE: CANDIDATE]                           │
├────────────────────────────────────────────────────────────────────────┤
│ [01:14] them: How do you handle cache invalidation during deployments? │
│ [01:22] me:   We use versioned cache tags with instant soft-purges.    │
│ [01:38] them: What happens if the distributed Redis replica desyncs?   │
│                                                                        │
│ ── Suggestions (Hermes) ────────────────────────────────────────────── │
│  • Mention dual-write buffer with 600s TTL tested on staging.          │
│  • Reference automated failover election with zero lost writes.        │
├────────────────────────────────────────────────────────────────────────┤
│ ? what was our failover election timeout again?                        │
└────────────────────────────────────────────────────────────────────────┘
```

- Type any plain text to create a time-stamped note saved to `<recording>.manual.md`.
- Type `?question` to query Hermes with the recent transcript + background documents.
- Press `Ctrl+C` to cleanly exit the HUD while the recording continues in the background.

---

## 🍏 Menu Bar Companion: LocalscribeBar

Localscribe includes a menu-bar companion written in pure Swift and SwiftUI.

```bash
# Build the production release binary
bun run bar

# Run in background
./native/LocalscribeBar/.build/release/LocalscribeBar &
```

- **Flashing Recording Dot:** Pulses `record.circle.fill` and `record.circle` at a 500ms cadence while recording alongside an elapsed timer (`REC 02m45s`).
- **One-Tap Actions:** Start Recording, Stop Recording, and quick access to generated notes.
- **Set Conversation Name:** Prompt modal to name your recording or leave blank for automatic Hermes summarization.
- **Hardware Source Pickers:** Seamlessly switch between displays, active windows, and microphones.
- **Realtime Toggles:** Toggle Transcribe, Notes, Live HUD, and Screen Annotation (`--draw`).

---

## ⌨️ CLI Reference

```
localscribe - local screen recorder

Usage:
  localscribe start [--name <name>] [--out file.mp4] [--screen N] [--fps 30] [--mic N] [--no-mic] [--no-system-audio]
                   [--window <id|name>] [--area x,y,w,h] [--display N] [--engine sck|ffmpeg]
                   [--transcribe] [--live] [--notes] [--draw] [-d|--detach] [--notify]
                   [--lang <language>]
                   [--role candidate|interviewer|meeting] [--context <file>]...
  localscribe live        (reattach the live view to a recording started with --live -d)
  localscribe stop        [--notify]
  localscribe open        [target] [--notes] [--transcribe] [-R|--reveal]
  localscribe copy        [target] [--transcribe]
  localscribe last        [--json]
  localscribe status      [--json]
  localscribe list
  localscribe devices     [--json]
  localscribe captions
  localscribe notes <mp4|transcript.md> [--lang <language>] [--name <name>]
```

| Command | Key Flags | Description |
| :--- | :--- | :--- |
| `localscribe start` | `--name, --live, --notes, --transcribe, -d, --notify` | Starts screen + audio recording. Opens HUD or detaches to background with `-d`. |
| `localscribe stop` | `[--notify]` | Cleanly stops recorder, mixes audio parts, runs Whisper & Hermes notes hooks. Posts native banner with `--notify`. |
| `localscribe open` | `[target] [--notes] [--transcribe] [-R]` | Opens recording, notes, or transcript in default macOS app (or reveals in Finder with `-R`). |
| `localscribe copy` | `[target] [--transcribe]` | Copies AI meeting notes (or transcript with `--transcribe`) directly to macOS clipboard via `pbcopy`. |
| `localscribe last` | `[--json]` | Shows metadata, paths, and AI summary snippet for the most recent recording session. |
| `localscribe status` | `--json` | Checks active recording state, PID, file path, and elapsed duration. |
| `localscribe live` | `--role, --context` | Re-attaches interactive terminal HUD to a detached recording session. |
| `localscribe captions` | *(none)* | Live-streams transcribed lines with timestamps and speaker attribution to stdout. |
| `localscribe notes` | `<path> [--lang] [--name]` | Regenerates structured AI meeting notes from an existing video or transcript. |
| `localscribe devices` | `--json` | Inspects connected monitors, open macOS window IDs, and available microphones. |
| `localscribe list` | *(none)* | Lists finished recordings in `~/Movies/localscribe` sorted newest first. |

---

## 🏗️ Technical Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          LOCALSCRIBE CLI                               │
│              (TypeScript + Bun Runtime / Process Runner)               │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│   SCREEN CAPTURE    │   │    AUDIO ROUTING    │   │  WHISPER LIVE ENGINE│
│  Native Swift (SCK) │   │  System Audio (SCK) │   │  ffmpeg 16k mono wav│
│  Displays / Windows │   │  Mic Audio (ffmpeg) │   │  whisper.cpp worker │
└──────────┬──────────┘   └──────────┬──────────┘   └──────────┬──────────┘
           │                         │                         │
           └─────────────────────────┼─────────────────────────┘
                                     ▼
                      ┌─────────────────────────────┐
                      │    RECORDING COMPLETE       │
                      │  ffmpeg AAC + H.264 Muxer   │
                      └──────────────┬──────────────┘
                                     ▼
                      ┌─────────────────────────────┐
                      │    HERMES NOTES ENGINE      │
                      │  Hardened temp sandbox      │
                      │  Delimited untrusted block  │
                      │  Summary + Actions [mm:ss]  │
                      └─────────────────────────────┘
```

---

## 🧪 Testing & Verification

Localscribe enforces 100% statement and function coverage on all TypeScript sources and includes native Swift package test suites.

```bash
# Run complete test suite with coverage enforcement
bun run coverage

# Run native Swift menu bar unit tests
bun run bar:test

# Run hardware end-to-end suite
bun run e2e
```

---

## 🌐 Homepage & Showcase

Visit the official landing page deployed on Cloudflare Pages:
👉 **[https://localscribe-48f.pages.dev/](https://localscribe-48f.pages.dev/)**

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

Authored by **[Omar Faruque Tuhin (Nadim Tuhin)](https://nadimtuhin.com)**.
