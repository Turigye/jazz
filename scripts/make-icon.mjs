// Generates platform icons from resources/icon.svg.
//   - resources/icon.ico  (Windows tray + installer)
//   - resources/icon.png  (Linux 512×512)
// macOS .icns must be produced on a Mac with `iconutil` (see scripts/make-icns-mac.sh).
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'resources', 'icon.svg'))

// ── Windows ICO (multi-resolution) ────────────────────────────────────────────
const icoSizes = [256, 128, 64, 48, 32, 16]
const icoPngs = await Promise.all(
  icoSizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer())
)
const ico = await pngToIco(icoPngs)
const icoPath = join(root, 'resources', 'icon.ico')
writeFileSync(icoPath, ico)
console.log(`Wrote ${icoPath} (${(ico.length / 1024).toFixed(1)} KB, sizes: ${icoSizes.join('/')})`)

// ── Linux PNG (single 512×512) ───────────────────────────────────────────────
const pngPath = join(root, 'resources', 'icon.png')
await sharp(svg, { density: 768 }).resize(512, 512).png().toFile(pngPath)
const fs = await import('fs/promises')
const pngStat = await fs.stat(pngPath)
console.log(`Wrote ${pngPath} (${(pngStat.size / 1024).toFixed(1)} KB, 512×512)`)
