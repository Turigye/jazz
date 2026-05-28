# Jazz for Linux

Offline voice dictation for Linux. Like Wispr Flow, but local, free, and private.

This `linux` branch contains the Linux installer path and the Linux-specific floating orb fix. The Windows-stable code remains on `master`; macOS packaging lives on `mac`.

## What This Branch Is For

Use this branch to test and ship Linux builds:

- AppImage for quick testing
- `.deb` installer for apt-based distributions
- Linux-specific overlay/orb behavior
- X11-focused input and window handling

## Install A Linux Test Build

If a release artifact is available, download either:

- `Jazz-*.AppImage` - run directly, no install
- `jazz_*_amd64.deb` - install with apt/dpkg

AppImage:

```bash
chmod +x Jazz-*.AppImage
./Jazz-*.AppImage
```

Debian/Ubuntu `.deb`:

```bash
sudo apt install ./jazz_*_amd64.deb
jazz
```

## Linux Development Setup

Recommended for Ubuntu/Debian-style systems:

```bash
git clone -b linux https://github.com/Turigye/jazz.git
cd jazz
chmod +x scripts/*.sh
./scripts/dist-linux.sh
```

The script installs system packages, installs npm dependencies, builds whisper.cpp, and creates Linux installers.

For NVIDIA CUDA builds:

```bash
WHISPER_CUDA=1 ./scripts/dist-linux.sh
```

For CPU builds, run the script without `WHISPER_CUDA`.

## Manual Development Run

```bash
npm install
npm run setup:whisper
npm run dev
```

If a native module rebuild is needed:

```bash
npm run rebuild:native
```

## Build Linux Installers

```bash
npm run make:icon
npm run build
npm run dist
```

Expected output under `dist-installer/`:

- `Jazz-*.AppImage`
- `jazz_*_amd64.deb`

## Linux Orb Test Checklist

Before calling a Linux build good, test this specifically:

1. Start with only one Jazz instance running.
2. Hover around the orb edges: cursor should not show resize handles.
3. Click the orb once: recording should toggle.
4. Click and hold the orb for at least 6 seconds without moving: it should not drift upward, grow, or swallow clicks away from the orb.
5. Drag the orb and release: it should follow the cursor, stop immediately on release, and remain compact.
6. Click below and around the orb: transparent space must not block other apps.
7. Dictate into Cursor, a browser text box, and a terminal-safe text field.

## Linux Notes

- X11 is the primary tested path.
- Wayland behavior can vary by desktop environment because global input and injection are restricted differently.
- The Linux orb intentionally avoids extra shadow or transparent padding around the visible button.
- Fractional scaling must not cause the overlay window to grow.

## Documentation

- [`docs/SETUP.md`](docs/SETUP.md) - Platform setup and packaging notes
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - Technical architecture
- [`docs/ROADMAP.md`](docs/ROADMAP.md) - Planned work

## Privacy

Jazz runs locally. No cloud transcription, no telemetry, and no external API key is required.
