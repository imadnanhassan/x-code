// Generates build/icon.ico + build/icon.png (app / installer / taskbar)
// and site/favicon.png + site/icon.png (website) from one inline SVG.
// Run: npm run gen:icon
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(resolve(root, 'build'), { recursive: true })
mkdirSync(resolve(root, 'site'), { recursive: true })

// Rounded-square badge, orange gradient, white "</>" — matches the in-app logo.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff7a45"/>
      <stop offset=".55" stop-color="#f0491e"/>
      <stop offset="1" stop-color="#d83c12"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".28"/>
      <stop offset=".5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="ds" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#5a1c0a" flood-opacity=".35"/>
    </filter>
  </defs>

  <g filter="url(#ds)">
    <rect x="46" y="46" width="420" height="420" rx="108" fill="url(#bg)"/>
    <rect x="46" y="46" width="420" height="420" rx="108" fill="url(#shine)"/>
    <rect x="47.5" y="47.5" width="417" height="417" rx="106.5" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="3"/>
  </g>

  <g fill="none" stroke="#ffffff" stroke-width="42" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="196,168 132,256 196,344"/>
    <polyline points="316,168 380,256 316,344"/>
    <line x1="292" y1="150" x2="220" y2="362"/>
  </g>
</svg>`

function png(size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' })
    .render()
    .asPng()
}

const png512 = png(512)
writeFileSync(resolve(root, 'build/icon.png'), png512)
writeFileSync(resolve(root, 'site/icon.png'), png512)
writeFileSync(resolve(root, 'site/favicon.png'), png(64))

const sizes = [16, 24, 32, 48, 64, 128, 256]
writeFileSync(resolve(root, 'build/icon.ico'), await pngToIco(sizes.map(png)))

console.log('wrote build/icon.{png,ico}, site/icon.png, site/favicon.png (ico: ' + sizes.join(',') + ')')
