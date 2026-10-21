# LOCALSCRIBE

```
██╗      ██████╗  ██████╗ █████╗ ██╗     ███████╗ ██████╗██████╗ ██╗██████╗ ███████╗
██║     ██╔═══██╗██╔════╝██╔══██╗██║     ██╔════╝██╔════╝██╔══██╗██║██╔══██╗██╔════╝
██║     ██║   ██║██║     ███████║██║     ███████╗██║     ██████╔╝██║██████╔╝█████╗  
██║     ██║   ██║██║     ██╔══██║██║     ╚════██║██║     ██╔══██╗██║██╔══██╗██╔══╝  
███████╗╚██████╔╝╚██████╗██║  ██║███████╗███████║╚██████╗██║  ██║██║██████╔╝███████╗
╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═════╝ ╚══════╝
```

> **The local-first screen recorder, lossless audio capture, Whisper transcription, live assist HUD, and AI meeting intelligence for macOS.**
>
> **No virtual audio drivers. No cloud leaks. 100% on-device.**

[![macOS](https://img.shields.io/badge/platform-macOS%2013%2B-black?style=for-the-badge&logo=apple)](https://github.com/nadimtuhin/localscribe)
[![Runtime](https://img.shields.io/badge/runtime-Bun-F472B6?style=for-the-badge&logo=bun)](https://bun.sh)
[![Swift](https://img.shields.io/badge/engine-ScreenCaptureKit%20%2B%20Swift-FA7343?style=for-the-badge&logo=swift)](https://developer.apple.com/documentation/screencapturekit)
[![Whisper](https://img.shields.io/badge/STT-whisper.cpp-00E5FF?style=for-the-badge)](https://github.com/ggerganov/whisper.cpp)
[![License](https://img.shields.io/badge/license-MIT-FFDE00?style=for-the-badge)](LICENSE)

---

## ⚡ What is Localscribe?

Most meeting recorders and screen capture tools require invasive cloud bots, flaky virtual audio devices (BlackHole, Soundflower), or stream private audio to third-party APIs.

**Localscribe** replaces that entire stack with native macOS engineering:
1. **ScreenCaptureKit Engine:** Hardware-accelerated screen capture for entire displays, single windows, or interactively drag-selected regions.
2. **Lossless Dual-Track Audio:** Taps ScreenCaptureKit's system audio pipeline directly while recording microphone input on an isolated track. Zero device switching.
3. **Local Whisper Speech-to-Text:** Automatic on-device transcription via `whisper.cpp`. Native support for English, Bangla (`large-v3-turbo`), Hindi, Urdu, Spanish, Arabic, and auto-detection.
4. **Live Assist TUI HUD:** Realtime dual-speaker transcript stream (`me:` vs `them:`) in your terminal. Ask Hermes questions in real time with `?question`.
5. **Timestamped AI Meeting Notes:** Generates structured Markdown notes with Summary, Decisions, and Action Items stamped with transcript offsets `[mm:ss]`.
6. **Native Menu Bar App (`LocalscribeBar`):** Swift/SwiftUI menu companion with a 500ms flashing recording indicator, elapsed timer, source selector, and conversation naming.
7. **Screen Annotation Overlay:** Transparent Metal-backed drawing canvas over your recordings with zero latency.

---

## 🚀 Quick Start

### Prerequisites

```bash
# 1. Install Bun runtime
curl -fsSL https://bun.sh/install | bash

# 2. Install FFmpeg
brew install ffmpeg

# 3. Ensure Xcode command-line tools are installed (for native Swift helpers)
xcode-select --install

# 4. (Optional) Install whisper-cli for local transcription
brew install whisper-cpp

# 5. (Optional) Install Hermes CLI for AI meeting notes
# https://hermes-agent.nousresearch.com/docs
```

### Installation

```bash
# Clone the repository
git clone https://github.com/nadimtuhin/localscribe.git
cd localscribe

# Install dependencies and run tests
bun install
bun test
```

---

## 🖥️ Command-Line Interface

```
localscribe - local screen recorder

Usage:
  localscribe start [--name <name>] [--out file.mp4] [--screen N] [--fps 30] [--mic N] [--no-mic] [--no-system-audio]
                   [--window <id|name>] [--area x,y,w,h] [--display N] [--engine sck|ffmpeg]
                   [--transcribe] [--live] [--notes] [--draw] [-d|--detach]
                   [--lang <language>]
                   [--role candidate|interviewer|meeting] [--context <file>]...
  localscribe live        (reattach the live view to a recording started with --live -d)
  localscribe stop
  localscribe status [--json]
  localscribe list
  localscribe devices [--json]
  localscribe captions
  localscribe notes <mp4|transcript.md> [--lang <language>] [--name <name>]
```

### Typical Workflows

#### 1. Quick Screen Recording
```bash
localscribe start --name "Feature Demo"
# ... record your screen ...
localscribe stop
# Output saved to ~/Movies/localscribe/YYYY-MM-DD_HH-MM-SS_feature-demo.mp4
```

#### 2. Meeting Recording + Local Transcription + AI Notes
```bash
localscribe start --name "Weekly Sprint Sync" --notes
# Transcribes audio locally with whisper.cpp and generates <name>.notes.md with Hermes
localscribe stop
```

#### 3. Realtime Live Assist HUD (Interactive Interview / Meeting)
```bash
localscribe start --name "Client Interview" --live --role candidate --context resume.pdf
# Opens interactive dual-speaker HUD in your terminal
# Type "?what did we agree on database latency?" anytime to consult Hermes
```

#### 4. Record a Specific Application Window or Area
```bash
# Interactively click a window to record:
localscribe start --window pick

# Interactively drag an area on screen:
localscribe start --area pick

# Target a specific window by title substring:
localscribe start --window "Safari"
```

---

## 🍏 Menu Bar Companion: LocalscribeBar

Localscribe includes a native menu bar app written in pure Swift and SwiftUI.

```bash
# Build release binary
bun run bar

# Run in background
./native/LocalscribeBar/.build/release/LocalscribeBar &
```

### Features:
- **Flashing Status Dot:** Alternates between `record.circle.fill` and `record.circle` every 500ms while recording alongside the elapsed timer (`REC 04m12s`).
- **One-Tap Actions:** Start, Stop, prompt for conversation name, open recordings directory, or inspect last generated notes.
- **Hardware Pickers:** Select display, window, or microphone source directly from the menu.
- **Toggles:** Toggle Transcription, Notes, Live Assist HUD, and Screen Annotation on the fly.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          LOCALSCRIBE CLI                               │
│              (TypeScript + Bun Runtime / Process Runner)               │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│  SCREEN CAPTURE     │   │    AUDIO ROUTING    │   │  WHISPER LIVE ENGINE│
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

## 🌐 Landing Page

Localscribe includes a neo-brutalist light-themed documentation and showcase site:
- **Live URL:** [https://localscribe-48f.pages.dev/](https://localscribe-48f.pages.dev/)
- **Source:** `site/index.html`

---

## 🧪 Testing & Verification

Localscribe enforces strict test isolation and 100% statement and function coverage.

```bash
# Run test suite with coverage enforcement
bun run coverage

# Run native Swift package tests
bun run bar:test

# Run end-to-end integration suite (requires display & audio hardware)
bun run e2e
```

---

## 📄 License

[MIT](LICENSE) © 2026 [Omar Faruque Tuhin (Nadim Tuhin)](https://nadimtuhin.com)
