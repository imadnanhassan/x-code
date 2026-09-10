// Generates build/icon.ico (Windows) + build/icon.png (Linux/macOS source)
// from an inline SVG. Run: npm run gen:icon
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'build')
mkdirSync(outDir, { recursive: true })

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8ab4ff"/>
      <stop offset="1" stop-color="#5b8def"/>
    </linearGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0b1020" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="40" y="40" width="432" height="432" rx="104" fill="url(#g)" filter="url(#s)"/>
  <g stroke="#0f1220" stroke-width="52" stroke-linecap="round">
    <line x1="168" y1="168" x2="344" y2="344"/>
    <line x1="344" y1="168" x2="168" y2="344"/>
  </g>
</svg>`

function renderPng(size) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' })
  return r.render().asPng()
}

// Source PNG for Linux/macOS and as ICO input
const png512 = renderPng(512)
writeFileSync(resolve(outDir, 'icon.png'), png512)

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoBuffers = icoSizes.map(renderPng)
const ico = await pngToIco(icoBuffers)
writeFileSync(resolve(outDir, 'icon.ico'), ico)

console.log('wrote build/icon.png (512) and build/icon.ico (' + icoSizes.join(',') + ')')
