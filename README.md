# Jazz for Windows

Offline voice dictation for Windows. Like Wispr Flow, but local, free, and private.

This `master` branch is the Windows-stable line. Keep platform-specific Linux and macOS work on their own branches so the Windows build stays clean.

## What Jazz Does

Hold `Ctrl+Win`, speak naturally, and Jazz types into whatever Windows app has focus: Cursor, VS Code, ChatGPT, Claude, Slack, Discord, Notepad, your browser, or any normal text field.

No API keys. No subscriptions. No audio leaves your machine.

## Install Windows Build

1. Open the latest Windows installer from [Releases](https://github.com/Turigye/jazz/releases/latest).
2. Download the `.exe` installer.
3. Double-click it and follow the installer.
4. If Windows SmartScreen appears, choose **More info** -> **Run anyway**. The build is unsigned.

## Use Jazz

- Hold `Ctrl+Win` for push-to-talk dictation.
- Use `Ctrl+Alt` for hands-free toggle mode.
- Speak, release the hotkey, and Jazz injects the text into the focused app.
- Open settings from the tray icon to adjust model, hotkeys, vocabulary, snippets, and GPU mode.

## Windows Development Setup

Requirements:

- Windows 10/11 x64
- Node.js 20+
- PowerShell
- Visual Studio Build Tools, if native modules need rebuilding

```bash
git clone https://github.com/Turigye/jazz.git
cd jazz
npm install
npm run setup:whisper
npm run dev
```

## Build Windows Installer

```bash
npm run make:icon
npm run build
npm run dist
```

Installer output is written under `dist-installer/`.

## Windows Notes

- NVIDIA CUDA is bundled where available and falls back to CPU automatically.
- The Windows orb behavior is considered stable on this branch.
- Do not merge Linux-only or macOS-only orb/window experiments into `master` unless they have been tested on Windows.

## Related Branches

- `linux` - Linux installer, AppImage, `.deb`, and Linux-specific orb fixes.
- `mac` - macOS DMG workflow and tester instructions.

## Documentation

- [`docs/SETUP.md`](docs/SETUP.md) - Build and signing notes
- [`docs/ROADMAP.md`](docs/ROADMAP.md) - Planned work
- [`docs/PRD.md`](docs/PRD.md) - Product requirements
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - Technical architecture
- [`docs/PLAN.md`](docs/PLAN.md) - Execution plan
- [`docs/RESEARCH.md`](docs/RESEARCH.md) - Research notes

## Privacy

Jazz is designed to be private:

- Audio is processed on-device using local models.
- No telemetry, analytics, or cloud transcription.
- Audio buffers are temporary and are not written to permanent storage.
