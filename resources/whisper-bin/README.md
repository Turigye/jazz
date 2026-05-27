# whisper.cpp binaries

Jazz transcribes audio by spawning the whisper.cpp CLI as a child process.
The engine probes for `whisper-cli.exe`, then `main.exe`, then `whisper.exe`.

## Installed build

- **Source:** whisper.cpp **v1.8.4** official release, `whisper-blas-bin-x64.zip`
- **Binary:** `whisper-cli.exe` (OpenBLAS-accelerated CPU build)
- **Runtime DLLs:** `whisper.dll`, `ggml.dll`, `ggml-base.dll`, `ggml-cpu.dll`,
  `ggml-blas.dll`, `libopenblas.dll`

These files are **gitignored** (~51 MB of redistributable binaries, not source).

## (Re)installing

From the project root:

```powershell
npm run setup:whisper
```

or directly:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/fetch-whisper.ps1
```

Pin a different release: `... -File scripts/fetch-whisper.ps1 -Version v1.8.4`

Download from: https://github.com/ggml-org/whisper.cpp/releases

> NVIDIA GPU acceleration (Phase 10) would use the `whisper-cublas-*-bin-x64.zip`
> asset from the same release instead.
