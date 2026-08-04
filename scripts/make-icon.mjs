// Generates platform icons from the master artwork.
//   - resources/icon.ico  (Windows tray + installer)
//   - resources/icon.png  (Linux 512×512, and the source CI rasterises .icns from)
//
// The master is resources/icon-master.png: a 1024×1024 render of the VU meter
// with transparent corners, the artwork inset to 824×824 the way Apple centres
// an icon shape so it doesn't outsize its neighbours in the Dock.
//
// resources/icon.svg is the older vector drawing. It is kept as a fallback for
// a clean checkout that lacks the master, but the PNG wins when present —
// the photographic bezel and lamp cannot be reproduced in flat vector.
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const masterPath = join(root, 'resources', 'icon-master.png')
const usingMaster = existsSync(masterPath)
const source = readFileSync(usingMaster ? masterPath : join(root, 'resources', 'icon.svg'))
// `density` only affects SVG rasterisation and is ignored for a PNG input.
const opts = usingMaster ? {} : { density: 768 }
console.log(`Source: ${usingMaster ? 'icon-master.png (1024 render)' : 'icon.svg (vector fallback)'}`)

// ── Windows ICO (multi-resolution) ────────────────────────────────────────────
const icoSizes = [256, 128, 64, 48, 32, 16]
const icoPngs = await Promise.all(
  icoSizes.map((s) => sharp(source, opts).resize(s, s).png().toBuffer())
)
const ico = await pngToIco(icoPngs)
const icoPath = join(root, 'resources', 'icon.ico')
writeFileSync(icoPath, ico)
console.log(`Wrote ${icoPath} (${(ico.length / 1024).toFixed(1)} KB, sizes: ${icoSizes.join('/')})`)

// ── Linux PNG + macOS .icns source ───────────────────────────────────────────
// Written at 1024 rather than 512: CI upscales this file to build the .icns,
// and upscaling a 512 source produced a soft 1024 slice.
const pngPath = join(root, 'resources', 'icon.png')
await sharp(source, opts).resize(1024, 1024).png().toFile(pngPath)
const fs = await import('fs/promises')
const pngStat = await fs.stat(pngPath)
console.log(`Wrote ${pngPath} (${(pngStat.size / 1024).toFixed(1)} KB, 1024×1024)`)
