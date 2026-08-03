// Generates the macOS menu-bar tray icon as a *template* image.
//
// macOS menu-bar icons must be small, monochrome, alpha-masked "template"
// images so the system can tint them for light/dark menu bars. A full-color
// 512×512 icon.png renders wrong (over-sized / invisible). We rasterize a black
// mic silhouette at 18px and 36px(@2x); the "Template" filename suffix makes
// Electron treat them as templates automatically.
//
//   resources/iconTemplate.png      (18×18)
//   resources/iconTemplate@2x.png   (36×36)
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Black VU-movement silhouette on transparent, matching the meter that is the
// app's signature. At 18px a full meter is mush, so this reduces it to the two
// marks that carry the idea: the scale arc and a deflected needle. Strokes are
// deliberately heavy — anything under ~7 units in this viewBox disappears once
// the menu bar downsamples it.
const svg = Buffer.from(`
<svg width="104" height="84" viewBox="0 0 104 84" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#000000" fill="none" stroke-linecap="round">
    <path d="M12 64 A 44 44 0 0 1 92 64" stroke-width="8"/>
    <line x1="52" y1="76" x2="70" y2="30" stroke-width="8"/>
  </g>
  <circle cx="52" cy="76" r="9" fill="#000000"/>
</svg>`)

for (const [size, name] of [[18, 'iconTemplate.png'], [36, 'iconTemplate@2x.png']]) {
  const out = join(root, 'resources', name)
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out)
  console.log(`Wrote ${out} (${size}×${size})`)
}
