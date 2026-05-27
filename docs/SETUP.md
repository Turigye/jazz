# Building Jazz from source

You only need to do this if you're producing installers for users to download.
End users just **double-click the resulting installer / AppImage**.

## Windows (NVIDIA GPU bundled — works on machines without an NVIDIA card too)

```powershell
git clone https://github.com/Turigye/jazz.git
cd jazz
npm install
npm run setup:whisper     # fetches the prebuilt whisper.cpp + CUDA 12 DLLs
npm run make:icon
npm run dist              # → dist-installer/Jazz Setup 1.0.0.exe
```

The Windows installer bundles the CUDA 12 runtime (~640 MB). On a machine
without an NVIDIA GPU, whisper-server auto-falls-back to CPU. The user can
also flip **Settings → General → Use GPU acceleration** off explicitly.

## Linux (one command)

```bash
git clone https://github.com/Turigye/jazz.git
cd jazz
chmod +x scripts/*.sh
./scripts/dist-linux.sh   # installs deps, builds whisper.cpp, packages
# → dist-installer/Jazz-1.0.0.AppImage
# → dist-installer/jazz_1.0.0_amd64.deb
```

End users on Linux just download the `.AppImage`, mark it executable
(`chmod +x`), and run. No build tools required for them.

### Intel Iris Xe / non-NVIDIA Linux laptops

whisper.cpp built without `WHISPER_CUDA=1` is a **CPU-only** binary. Modern
Intel chips (AVX2) run `small.en-q5_1` (~190 MB) at ~1 sec for 5 seconds of
audio, and `large-v3-turbo-q5_0` (~547 MB) at maybe 2-3 sec. Useable. The
**GPU toggle in Settings has no effect** on a CPU-only build — leaving it on
or off is a no-op when no CUDA runtime is present.

If you have an NVIDIA Linux machine and want GPU acceleration:

```bash
# Install CUDA toolkit first (NVIDIA's instructions), then:
WHISPER_CUDA=1 ./scripts/dist-linux.sh
```

## macOS (one command, Metal-accelerated)

You'll need a Mac.

```bash
git clone https://github.com/Turigye/jazz.git
cd jazz
chmod +x scripts/*.sh
./scripts/dist-mac.sh     # → dist-installer/Jazz-1.0.0.dmg
```

Apple Silicon and Intel Macs both work. whisper.cpp uses **Metal** by default
on macOS — no extra config.

### Signing + notarization (only for distributing to non-technical users)

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
export CSC_LINK="/path/to/DeveloperID.p12"
export CSC_KEY_PASSWORD="…"
./scripts/dist-mac.sh
```

Without signing, recipients see a Gatekeeper warning on first launch and have
to right-click → Open the .app once. That's fine for personal use.

## Hardware behavior summary

| Machine | Default mode | Notes |
|---|---|---|
| Windows + NVIDIA | GPU (CUDA) | ~200ms transcription |
| Windows w/o NVIDIA | CPU (auto-fallback) | bundled CUDA DLLs are dead weight (~640 MB) but app works |
| Linux + NVIDIA (built with `WHISPER_CUDA=1`) | GPU (CUDA) | ~200ms |
| Linux Intel/AMD | CPU | small.en-q5_1 ≈ 1s/5s audio |
| macOS Apple Silicon | GPU (Metal) | Very fast, ~150ms |
| macOS Intel | CPU + Metal where supported | Fine |
