# Jazz — offline voice dictation for macOS

Hold two keys and talk. Jazz transcribes on your own machine and types the result
into whatever app already has your cursor — editor, browser, terminal, anywhere.

No cloud. No account. No API key. The speech model sits on your disk and runs on
your GPU, so the app works with the network switched off entirely.

<p align="center">
  <img src="resources/icon-master.png" width="128" alt="" />
</p>

## Install

Download the latest `.dmg` from **[Releases](https://github.com/Turigye/jazz/releases/latest)**,
drag Jazz to Applications, and open it.

The build is signed with a Developer ID certificate and notarized by Apple, so it
opens without a security warning — no right-click → Open, no `xattr` incantation.

**Requirements**

- macOS 12 or later, Apple Silicon (M1 and up)
- ~600 MB free for the default speech model
- Microphone and Accessibility permissions, requested on first run

Accessibility is what lets the global hotkey work while another app is focused.
macOS asks for it itself; Jazz never sees your password.

## Use

| Action | Default |
| --- | --- |
| Push to talk — hold, speak, release | <kbd>⌃</kbd> <kbd>⌘</kbd> |
| Toggle listening — tap on, tap off | <kbd>⌃</kbd> <kbd>⌥</kbd> |
| Start or stop | Click the floating meter |

Both are rebindable in Settings → Hotkeys. Modifier-only combinations work best,
because they can't type a stray character into whatever you're focused on.

A single dictation can run up to five minutes. On an M2 Pro with the default
model, a minute of speech comes back in about five seconds.

## What's in the interface

The floating meter is a real VU movement, not a level bar. Deflection is linear
in amplitude rather than decibels — which is why the numbers on a VU face bunch
up at the quiet end — and the needle is modelled as a damped spring, so it
overshoots a transient by a few percent and settles back. It runs on the actual
RMS of your microphone.

Settings covers transcripts, model choice, hotkeys, a personal dictionary for
names and jargon, and snippets that expand as you speak.

## Speech models

Chosen at setup, changeable any time. Everything downloads once and stays local.

| Model | Download | Latency | Word error |
| --- | ---: | ---: | ---: |
| Tiny | 75 MB | 300 ms | 9.0% |
| Base | 142 MB | 700 ms | 6.0% |
| Small, quantized | 190 MB | 900 ms | 4.5% |
| **Large v3 Turbo, Q5** — default | 547 MB | 1100 ms | 2.8% |
| Large v3 Turbo | 1549 MB | 250 ms | 2.5% |

## Build from source

```bash
npm install
npm run setup:whisper:unix     # builds whisper.cpp with Metal
npm run dev                    # Electron + Vite, hot reload
npm run dist                   # packaged .dmg in dist-installer/
```

A local `npm run dist` signs with whatever certificate is in your keychain, and
records it in a gitignored `.signing-identity.json`. If that identity ever
changes the build **fails on purpose** — macOS ties Accessibility, Automation
and Microphone grants to the code signature, so a silent identity change would
revoke every permission the app has and leave the Settings toggle looking
enabled while doing nothing. Details, and how to change identity deliberately,
in **[docs/RELEASING_MACOS.md](docs/RELEASING_MACOS.md)**.

Release builds go through GitHub Actions, which signs with a Developer ID
certificate, notarizes, staples the ticket, and refuses to publish anything
Gatekeeper would reject.

## How it works

```
hotkey ──► capture (hidden window, Web Audio, 16 kHz mono)
             │  live RMS ──► the meter
             ▼
        whisper.cpp on Metal, model held in RAM by a local server
             ▼
        post-process ──► filler words, dictionary, snippets
             ▼
        paste into the focused app
```

The transcript is saved before injection is attempted, so a paste failure never
loses your words — they stay on the clipboard and in Recent transcripts.

## Project layout

```
src/main/        Electron main — hotkeys, pipeline, STT, injection, permissions
src/renderer/    Overlay meter, settings, first-run wizard, hidden recorder
src/shared/      Types and constants shared across processes
site/            The product website (static, deploys to Pages)
docs/            Architecture, macOS release process, testing notes
```

More in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Other platforms

Windows and Linux builds live on the [`master`](https://github.com/Turigye/jazz/tree/master)
and [`linux`](https://github.com/Turigye/jazz/tree/linux) branches. They predate
this interface and have not been brought onto it yet — treat them as the older
line rather than the same app on another OS.

## Privacy

Audio is captured, transcribed and discarded on your machine. There is no
server to send it to. Transcripts are stored locally so you can re-inject them,
and can be cleared from Settings. The app makes no network requests at all
after the one-time model download — the UI's typefaces are bundled rather than
fetched, specifically so that stays true.
