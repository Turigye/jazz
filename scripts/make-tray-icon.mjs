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

// Black mic silhouette on transparent — geometry lifted from resources/icon.svg
// (capsule + pickup arc + stem + base), minus the colored square and note.
// viewBox is cropped tight around the mic glyph (x80–176, y56–208 in 256-space)
// so the silhouette fills the menu-bar frame instead of floating small in it.
const svg = Buffer.from(`
<svg width="172" height="172" viewBox="42 46 172 172" xmlns="http://www.w3.org/2000/svg">
  <g fill="#000000" stroke="#000000">
    <rect x="104" y="56" width="48" height="86" rx="24" stroke="none"/>
    <path d="M80 122 a48 48 0 0 0 96 0" fill="none" stroke-width="12" stroke-linecap="round"/>
    <rect x="122" y="168" width="12" height="30" rx="6" stroke="none"/>
    <rect x="98" y="196" width="60" height="12" rx="6" stroke="none"/>
  </g>
</svg>`)

for (const [size, name] of [[18, 'iconTemplate.png'], [36, 'iconTemplate@2x.png']]) {
  const out = join(root, 'resources', name)
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out)
  console.log(`Wrote ${out} (${size}×${size})`)
}
