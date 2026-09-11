/**
 * File/folder icons rendered as inline SVG strings — inspired by the reference
 * screenshot's tinted, language-coloured tree. Settings -> Appearance -> Icon
 * Theme switches between this full colour set and a monochrome outline style
 * that just uses the surrounding text colour (currentColor), same idea as an
 * editor's file-icon-theme picker.
 */
import { store } from '../core/store'

interface LangIcon {
  color: string
  label: string
}

const EXT_MAP: Record<string, LangIcon> = {
  js: { color: '#f7df1e', label: 'JS' },
  mjs: { color: '#f7df1e', label: 'JS' },
  cjs: { color: '#f7df1e', label: 'JS' },
  jsx: { color: '#61dafb', label: 'JSX' },
  ts: { color: '#3178c6', label: 'TS' },
  tsx: { color: '#3178c6', label: 'TSX' },
  'd.ts': { color: '#3178c6', label: 'TS' },
  json: { color: '#f7df1e', label: '{}' },
  jsonc: { color: '#f7df1e', label: '{}' },
  json5: { color: '#f7df1e', label: '{}' },
  html: { color: '#e34c26', label: '<>' },
  htm: { color: '#e34c26', label: '<>' },
  css: { color: '#42a5f5', label: 'CSS' },
  scss: { color: '#c6538c', label: 'SASS' },
  sass: { color: '#c6538c', label: 'SASS' },
  less: { color: '#1d365d', label: 'LESS' },
  vue: { color: '#42b883', label: 'VUE' },
  svelte: { color: '#ff3e00', label: 'SV' },
  astro: { color: '#ff5d01', label: 'A' },
  md: { color: '#42a5f5', label: 'MD' },
  mdx: { color: '#f9ac00', label: 'MDX' },
  markdown: { color: '#42a5f5', label: 'MD' },
  txt: { color: '#9e9e9e', label: 'TXT' },
  py: { color: '#3572a5', label: 'PY' },
  rb: { color: '#cc342d', label: 'RB' },
  php: { color: '#8892bf', label: 'PHP' },
  go: { color: '#00add8', label: 'GO' },
  rs: { color: '#f74c00', label: 'RS' },
  java: { color: '#f89820', label: 'JAV' },
  kt: { color: '#a97bff', label: 'KT' },
  c: { color: '#5c6bc0', label: 'C' },
  h: { color: '#5c6bc0', label: 'H' },
  cpp: { color: '#5c6bc0', label: 'C++' },
  cc: { color: '#5c6bc0', label: 'C++' },
  hpp: { color: '#5c6bc0', label: 'H++' },
  cs: { color: '#68217a', label: 'C#' },
  swift: { color: '#ff5b35', label: 'SW' },
  sh: { color: '#89e051', label: 'SH' },
  bash: { color: '#89e051', label: 'SH' },
  zsh: { color: '#89e051', label: 'SH' },
  fish: { color: '#89e051', label: 'SH' },
  ps1: { color: '#012456', label: 'PS' },
  bat: { color: '#c1f12e', label: 'BAT' },
  cmd: { color: '#c1f12e', label: 'CMD' },
  yml: { color: '#cb171e', label: 'YML' },
  yaml: { color: '#cb171e', label: 'YML' },
  toml: { color: '#9c4221', label: 'TML' },
  ini: { color: '#6d8086', label: 'INI' },
  cfg: { color: '#6d8086', label: 'CFG' },
  conf: { color: '#6d8086', label: 'CNF' },
  env: { color: '#ecd53f', label: 'ENV' },
  sql: { color: '#e38c00', label: 'SQL' },
  prisma: { color: '#5a67d8', label: 'PR' },
  graphql: { color: '#e10098', label: 'GQL' },
  gql: { color: '#e10098', label: 'GQL' },
  lua: { color: '#000080', label: 'LUA' },
  dart: { color: '#00b4ab', label: 'DRT' },
  r: { color: '#276dc3', label: 'R' },
  ex: { color: '#6e4a7e', label: 'EX' },
  exs: { color: '#6e4a7e', label: 'EX' },
  clj: { color: '#5881d8', label: 'CLJ' },
  elm: { color: '#60b5cc', label: 'ELM' },
  tf: { color: '#7b42bc', label: 'TF' },
  dockerfile: { color: '#2496ed', label: 'DK' },
  xml: { color: '#ff6600', label: 'XML' },
  svg: { color: '#ffb13b', label: 'SVG' },
  png: { color: '#a074c4', label: 'IMG' },
  jpg: { color: '#a074c4', label: 'IMG' },
  jpeg: { color: '#a074c4', label: 'IMG' },
  gif: { color: '#a074c4', label: 'IMG' },
  webp: { color: '#a074c4', label: 'IMG' },
  ico: { color: '#a074c4', label: 'ICO' },
  woff: { color: '#e2b93d', label: 'FNT' },
  woff2: { color: '#e2b93d', label: 'FNT' },
  ttf: { color: '#e2b93d', label: 'FNT' },
  otf: { color: '#e2b93d', label: 'FNT' },
  lock: { color: '#787878', label: 'LCK' },
  csv: { color: '#43a047', label: 'CSV' },
  pdf: { color: '#e5252a', label: 'PDF' },
  zip: { color: '#a0a0a0', label: 'ZIP' },
  wasm: { color: '#654ff0', label: 'WA' }
}

const FILENAME_MAP: Record<string, LangIcon> = {
  'package.json': { color: '#8bc34a', label: 'NPM' },
  'package-lock.json': { color: '#787878', label: 'LCK' },
  'pnpm-lock.yaml': { color: '#f9ad00', label: 'LCK' },
  'yarn.lock': { color: '#2c8ebb', label: 'LCK' },
  'bun.lockb': { color: '#f472b6', label: 'LCK' },
  'tsconfig.json': { color: '#3178c6', label: 'TS' },
  'dockerfile': { color: '#2496ed', label: 'DK' },
  '.gitignore': { color: '#f14e32', label: 'GIT' },
  '.gitattributes': { color: '#f14e32', label: 'GIT' },
  '.editorconfig': { color: '#e0e0e0', label: 'EC' },
  '.npmrc': { color: '#cb3837', label: 'NPM' },
  '.nvmrc': { color: '#5fa04e', label: 'NVM' },
  'readme.md': { color: '#42a5f5', label: 'i' },
  'license': { color: '#e6b800', label: 'LIC' },
  'license.md': { color: '#e6b800', label: 'LIC' },
  '.prettierrc': { color: '#f7b93e', label: 'P' },
  'vite.config.ts': { color: '#646cff', label: 'VT' },
  'vite.config.js': { color: '#646cff', label: 'VT' }
}

const FOLDER_COLORS: Record<string, string> = {
  src: '#8bc34a',
  app: '#8bc34a',
  lib: '#64b5f6',
  components: '#f06292',
  component: '#f06292',
  ui: '#f06292',
  hooks: '#4db6ac',
  utils: '#4dd0e1',
  helpers: '#4dd0e1',
  assets: '#ba68c8',
  public: '#ba68c8',
  static: '#ba68c8',
  images: '#ba68c8',
  img: '#ba68c8',
  icons: '#ffb300',
  fonts: '#e2b93d',
  styles: '#42a5f5',
  css: '#42a5f5',
  scss: '#c6538c',
  api: '#66bb6a',
  server: '#26a69a',
  routes: '#ff8a65',
  pages: '#ff8a65',
  views: '#ff8a65',
  layouts: '#ff8a65',
  middleware: '#7e57c2',
  plugins: '#7e57c2',
  db: '#26c6da',
  database: '#26c6da',
  models: '#26c6da',
  migrations: '#26c6da',
  prisma: '#5a67d8',
  graphql: '#e10098',
  config: '#90a4ae',
  constants: '#90a4ae',
  scripts: '#c1f12e',
  test: '#fbc02d',
  tests: '#fbc02d',
  __tests__: '#fbc02d',
  spec: '#fbc02d',
  e2e: '#fbc02d',
  cypress: '#fbc02d',
  playwright: '#fbc02d',
  dist: '#78909c',
  build: '#78909c',
  out: '#78909c',
  release: '#78909c',
  coverage: '#78909c',
  node_modules: '#66605c',
  // monorepo / workspace layout
  apps: '#66bb6a',
  packages: '#81c784',
  admin: '#ffa726',
  mobile: '#ba68c8',
  web: '#4fc3f7',
  functions: '#ff8a65',
  workers: '#f6821f',
  docs: '#42a5f5',
  doc: '#42a5f5',
  store: '#764abc',
  stores: '#764abc',
  redux: '#764abc',
  context: '#61dafb',
  contexts: '#61dafb',
  types: '#3178c6',
  locales: '#26a69a',
  i18n: '#26a69a',
  translations: '#26a69a',
  workflows: '#8b949e',
  actions: '#8b949e',
  storybook: '#ff4785',
  '.storybook': '#ff4785',
  '.git': '#f14e32',
  '.github': '#8b949e',
  '.vscode': '#42a5f5',
  '.idea': '#fc801d',
  '.husky': '#4fc3f7',
  '.changeset': '#546e7a',
  '.wrangler': '#f6821f',
  '.tanstack': '#ef4444'
}

// Extra distinguishing marks drawn on top of the base folder colour, for the
// tooling/monorepo folders that a colour alone doesn't make recognisable at a
// glance. Original glyphs (not the actual GitHub/VS Code/etc. logos).
const FOLDER_GLYPHS: Record<string, string> = {
  '.github': `<circle cx="6" cy="7" r="1.1"/><circle cx="6" cy="11" r="1.1"/><circle cx="11" cy="9" r="1.1"/><path d="M6 8.1v1.8M6.9 7.4 10 8.6M6.9 10.6 10 9.4" stroke-width="0.8" fill="none"/>`,
  workflows: `<circle cx="6" cy="7" r="1.1"/><circle cx="6" cy="11" r="1.1"/><circle cx="11" cy="9" r="1.1"/><path d="M6 8.1v1.8M6.9 7.4 10 8.6M6.9 10.6 10 9.4" stroke-width="0.8" fill="none"/>`,
  actions: `<circle cx="6" cy="7" r="1.1"/><circle cx="6" cy="11" r="1.1"/><circle cx="11" cy="9" r="1.1"/><path d="M6 8.1v1.8M6.9 7.4 10 8.6M6.9 10.6 10 9.4" stroke-width="0.8" fill="none"/>`,
  '.husky': `<path d="M9.5 6c-1.8 0-3 1.3-3 3s1.3 2.8 2.6 2.2" stroke-width="1.1" fill="none" stroke-linecap="round"/><circle cx="9.3" cy="6" r="0.9"/>`,
  '.vscode': `<path d="M7.2 6.5 5 9l2.2 2.5M9.8 6.5 12 9l-2.2 2.5" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  '.wrangler': `<path d="M9.2 5.5 6.5 9.3h2l-.7 3.2 3.5-4.2h-2.1z"/>`,
  workers: `<path d="M9.2 5.5 6.5 9.3h2l-.7 3.2 3.5-4.2h-2.1z"/>`,
  node_modules: `<path d="M8.5 5.3 12 7v4l-3.5 1.7L5 11V7z" fill="none" stroke-width="0.9"/><path d="M5 7l3.5 1.7L12 7M8.5 8.7v4" stroke-width="0.9" fill="none"/>`,
  apps: `<rect x="5.3" y="5.3" width="2.4" height="2.4" rx="0.4"/><rect x="8.7" y="5.3" width="2.4" height="2.4" rx="0.4"/><rect x="5.3" y="8.7" width="2.4" height="2.4" rx="0.4"/><rect x="8.7" y="8.7" width="2.4" height="2.4" rx="0.4"/>`,
  packages: `<rect x="5.3" y="5.3" width="2.4" height="2.4" rx="0.4"/><rect x="8.7" y="5.3" width="2.4" height="2.4" rx="0.4"/><rect x="5.3" y="8.7" width="2.4" height="2.4" rx="0.4"/><rect x="8.7" y="8.7" width="2.4" height="2.4" rx="0.4"/>`,
  docs: `<path d="M5.5 6.5h6M5.5 9h6M5.5 11.5h4" stroke-width="1" stroke-linecap="round"/>`,
  doc: `<path d="M5.5 6.5h6M5.5 9h6M5.5 11.5h4" stroke-width="1" stroke-linecap="round"/>`,
  config: `<circle cx="8.5" cy="9" r="2" fill="none" stroke-width="1"/><circle cx="8.5" cy="9" r="0.6"/><path d="M8.5 6v.9M8.5 11.1v.9M5.8 9h.9M10.3 9h.9M6.6 6.9l.6.6M9.8 10.5l.6.6M6.6 11.1l.6-.6M9.8 7.5l.6-.6" stroke-width="0.7"/>`,
  scripts: `<path d="M5.5 6.5 8 9l-2.5 2.5" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 11.5h3" stroke-width="1.1" stroke-linecap="round"/>`,
  test: `<circle cx="8.5" cy="9" r="3" fill="none" stroke-width="0.9"/><path d="M7 9l1 1 2-2.2" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  tests: `<circle cx="8.5" cy="9" r="3" fill="none" stroke-width="0.9"/><path d="M7 9l1 1 2-2.2" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  __tests__: `<circle cx="8.5" cy="9" r="3" fill="none" stroke-width="0.9"/><path d="M7 9l1 1 2-2.2" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  e2e: `<circle cx="8.5" cy="9" r="3" fill="none" stroke-width="0.9"/><path d="M7 9l1 1 2-2.2" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
}

const DEFAULT_FOLDER = '#e0b25b'
const OPEN_FOLDER = '#a6e3a1'
const DEFAULT_FILE: LangIcon = { color: '#9aa0a6', label: '' }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function docSvg(color: string, label: string): string {
  const text = label
    ? `<text x="8" y="11.2" text-anchor="middle" font-size="5.4" font-weight="700" fill="${color}" font-family="ui-monospace,SFMono-Regular,monospace">${esc(label)}</text>`
    : ''
  return `<svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 1.5h4.4L13 6.1V13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V3A1.5 1.5 0 0 1 4 1.5Z" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-opacity="0.55" stroke-width="0.9"/>
    <path d="M8.3 1.6 13 6.2H9.3A1 1 0 0 1 8.3 5.2Z" fill="${color}" fill-opacity="0.45"/>
    ${text}
  </svg>`
}

function folderSvg(color: string, open: boolean, glyph?: string): string {
  const mark = glyph ? `<g fill="#fff" fill-opacity="0.95" stroke="#fff">${glyph}</g>` : ''
  if (open) {
    return `<svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 4.2A1.5 1.5 0 0 1 3 2.7h3.1l1.5 1.6H13a1.5 1.5 0 0 1 1.5 1.5v.7h-10A1.5 1.5 0 0 0 3 8.4l-1.5 4.9Z" fill="${color}" fill-opacity="0.35"/>
      <path d="M3.4 7.2h11.1a1 1 0 0 1 .96 1.28l-1.2 4.1a1.5 1.5 0 0 1-1.44 1.07H2.2a1 1 0 0 1-.96-1.28l1.2-4.1A1.5 1.5 0 0 1 3.4 7.2Z" fill="${color}" fill-opacity="0.9"/>
      ${mark}
    </svg>`
  }
  return `<svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.7 4A1.5 1.5 0 0 1 3.2 2.5h3l1.6 1.7h5A1.5 1.5 0 0 1 15.3 5.7v6.8a1.5 1.5 0 0 1-1.5 1.5H3.2a1.5 1.5 0 0 1-1.5-1.5Z" fill="${color}" fill-opacity="0.92"/>
    <path d="M1.7 5.6h13.6v1.1H1.7Z" fill="#000" fill-opacity="0.12"/>
    ${mark}
  </svg>`
}

function isMono(): boolean {
  return store.settings.iconTheme === 'mono'
}

export function folderIcon(name: string, open: boolean): string {
  if (isMono()) return folderSvg('currentColor', open)
  const key = name.toLowerCase()
  const color = FOLDER_COLORS[key] || (open ? OPEN_FOLDER : DEFAULT_FOLDER)
  return folderSvg(color, open, FOLDER_GLYPHS[key])
}

export function fileIcon(name: string): string {
  if (isMono()) return docSvg('currentColor', '')
  const lower = name.toLowerCase()
  if (FILENAME_MAP[lower]) {
    const f = FILENAME_MAP[lower]
    return docSvg(f.color, f.label)
  }
  if (lower.endsWith('.d.ts')) return docSvg(EXT_MAP['d.ts'].color, 'TS')
  // .env.local / .env.example / .env.production etc. — lastIndexOf('.') would
  // otherwise grab the trailing segment ("example", "local", ...) as a bogus
  // "extension" and fall through to the generic grey icon below.
  if (lower.startsWith('.env')) return docSvg(EXT_MAP.env.color, EXT_MAP.env.label)
  const dot = lower.lastIndexOf('.')
  const ext = dot > 0 ? lower.slice(dot + 1) : ''
  const info = EXT_MAP[ext] || (ext ? { color: DEFAULT_FILE.color, label: ext.slice(0, 3).toUpperCase() } : DEFAULT_FILE)
  return docSvg(info.color, info.label)
}

export function iconFor(name: string, isDir: boolean, open = false): string {
  return isDir ? folderIcon(name, open) : fileIcon(name)
}
