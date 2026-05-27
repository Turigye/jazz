<#
.SYNOPSIS
  Downloads the whisper.cpp Windows x64 (OpenBLAS) binaries into resources/whisper-bin.

.DESCRIPTION
  Jazz transcribes by spawning the whisper.cpp CLI. These redistributable
  binaries are gitignored (they are large and not source), so this script
  fetches them from the official whisper.cpp GitHub release.

.EXAMPLE
  npm run setup:whisper
  # or directly:
  powershell -ExecutionPolicy Bypass -File scripts/fetch-whisper.ps1
#>
param(
  [string]$Version = 'v1.8.4'
)

$ErrorActionPreference = 'Stop'
$asset = "whisper-cublas-12.4.0-bin-x64.zip"
$url = "https://github.com/ggml-org/whisper.cpp/releases/download/$Version/$asset"
$root = Split-Path -Parent $PSScriptRoot
$dst = Join-Path $root 'resources\whisper-bin'
$tmp = Join-Path $env:TEMP "jazz-whisper-$Version"

# Files whisper-server.exe needs for CUDA 12 inference. We bundle the cuBLAS
# DLLs (huge — ~550 MB combined) so the app works on any machine with a CUDA-
# capable NVIDIA driver, without requiring users to install the CUDA Toolkit.
# CPU fallback DLLs included so the same binary still runs when --no-gpu is set.
$keep = @(
  # whisper.cpp binaries
  'whisper-cli.exe', 'whisper-server.exe', 'main.exe', 'whisper.dll',
  # ggml backends
  'ggml.dll', 'ggml-base.dll', 'ggml-cpu.dll', 'ggml-cuda.dll',
  # CUDA 12 runtime
  'cudart64_12.dll', 'cublas64_12.dll', 'cublasLt64_12.dll'
  # Intentionally NOT bundling nvrtc* (kernel runtime compiler) — whisper.cpp uses
  # the precompiled kernels in ggml-cuda.dll and doesn't need NVRTC at inference time.
)

Write-Host "Downloading whisper.cpp $Version ($asset)..."
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp $asset
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath "$tmp\extracted" -Force

$release = Join-Path $tmp 'extracted\Release'
New-Item -ItemType Directory -Force $dst | Out-Null

# Clean stale binaries from any previous build (e.g. BLAS leftovers when
# switching to CUDA). Keep README.md and any non-binary configs.
Get-ChildItem $dst -File | Where-Object { $_.Extension -in '.exe', '.dll' } | Remove-Item -Force

foreach ($f in $keep) {
  Copy-Item (Join-Path $release $f) (Join-Path $dst $f) -Force
}

Remove-Item $tmp -Recurse -Force

$cli = Join-Path $dst 'whisper-cli.exe'
if (Test-Path $cli) {
  $mb = [math]::Round((Get-ChildItem $dst -File | Measure-Object Length -Sum).Sum / 1MB, 1)
  Write-Host "Installed whisper.cpp binaries to $dst ($mb MB)"
} else {
  throw "whisper-cli.exe missing after install"
}
