import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Wire Monaco's web workers for Vite/Electron.
;(self as any).MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

const EXT_LANG: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  json: 'json', jsonc: 'json', json5: 'json',
  html: 'html', htm: 'html', xhtml: 'html',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  py: 'python', rb: 'ruby', php: 'php', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', kts: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  cs: 'csharp', swift: 'swift', m: 'objective-c',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  ps1: 'powershell', bat: 'bat', cmd: 'bat',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  lua: 'lua', dart: 'dart', r: 'r', pl: 'perl',
  dockerfile: 'dockerfile', xml: 'xml', svg: 'xml',
  vue: 'html', svelte: 'html', astro: 'html',
  clj: 'clojure', cljs: 'clojure', fs: 'fsharp', scala: 'scala',
  tf: 'hcl', hcl: 'hcl', proto: 'proto', ex: 'elixir', exs: 'elixir'
}

const FILENAME_LANG: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  '.gitignore': 'ignore',
  '.gitattributes': 'ignore',
  '.env': 'ini',
  '.npmrc': 'ini',
  '.editorconfig': 'ini'
}

export function languageForPath(path: string): string {
  const base = path.split(/[\\/]/).pop()!.toLowerCase()
  if (FILENAME_LANG[base]) return FILENAME_LANG[base]
  if (base.startsWith('.env')) return 'ini'
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot + 1) : ''
  return EXT_LANG[ext] || 'plaintext'
}

type CO = monaco.languages.typescript.CompilerOptions
let baseCompilerOptions: CO = {}

// Monaco's TS worker can't see node_modules, so module-resolution diagnostics are
// just noise for real projects — suppress those codes, keep genuine type errors.
const MODULE_NOISE_CODES = [
  2307, // Cannot find module 'X' or its corresponding type declarations
  2792, // Cannot find module 'X'. Did you mean to set 'moduleResolution' to 'node'?
  2688, // Cannot find type definition file for 'X'
  7016, // Could not find a declaration file for module 'X'
  2306, // File 'X' is not a module
  6142 // Module was resolved but '--jsx' is not set
]

export function configureLanguages(): void {
  const ts = monaco.languages.typescript
  baseCompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    allowJs: true,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
    skipLibCheck: true
  }
  ts.typescriptDefaults.setCompilerOptions(baseCompilerOptions)
  ts.javascriptDefaults.setCompilerOptions(baseCompilerOptions)
  const diag = { noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: MODULE_NOISE_CODES }
  ts.typescriptDefaults.setDiagnosticsOptions(diag)
  ts.javascriptDefaults.setDiagnosticsOptions({ ...diag, noSemanticValidation: true })

  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    schemas: [],
    trailingCommas: 'warning'
  })
}

/** Fold the workspace's tsconfig/jsconfig compilerOptions into the TS worker. */
export async function applyProjectTsconfig(root: string): Promise<void> {
  const ts = monaco.languages.typescript
  let raw = ''
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    try {
      raw = await window.xcode.fs.read(root.replace(/[\\/]$/, '') + '/' + name)
      break
    } catch {
      /* next */
    }
  }
  if (!raw) {
    ts.typescriptDefaults.setCompilerOptions(baseCompilerOptions)
    return
  }
  let cfg: any
  try {
    cfg = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1'))
  } catch {
    return
  }
  const co = cfg.compilerOptions || {}
  const merged: CO = { ...baseCompilerOptions }

  const jsxMap: Record<string, number> = {
    react: ts.JsxEmit.React,
    'react-jsx': ts.JsxEmit.ReactJSX,
    'react-jsxdev': ts.JsxEmit.ReactJSXDev,
    'react-native': ts.JsxEmit.ReactNative,
    preserve: ts.JsxEmit.Preserve
  }
  if (typeof co.jsx === 'string' && jsxMap[co.jsx] !== undefined) merged.jsx = jsxMap[co.jsx]
  if (typeof co.baseUrl === 'string') merged.baseUrl = co.baseUrl
  if (co.paths && typeof co.paths === 'object') merged.paths = co.paths
  if (typeof co.strict === 'boolean') merged.strict = co.strict
  if (typeof co.experimentalDecorators === 'boolean') merged.experimentalDecorators = co.experimentalDecorators
  if (typeof co.jsxImportSource === 'string') merged.jsxImportSource = co.jsxImportSource
  if (typeof co.target === 'string') {
    const t = (ts.ScriptTarget as any)[co.target.replace(/^es/i, 'ES').replace('esnext', 'ESNext')]
    if (t !== undefined) merged.target = t
  }
  if (Array.isArray(co.lib)) merged.lib = co.lib

  ts.typescriptDefaults.setCompilerOptions(merged)
  ts.javascriptDefaults.setCompilerOptions(merged)
}

let emmetReady = false
export async function enableEmmet(): Promise<void> {
  if (emmetReady) return
  emmetReady = true
  try {
    const { emmetHTML, emmetCSS, emmetJSX } = await import('emmet-monaco-es')
    emmetHTML(monaco, ['html', 'xml', 'php', 'handlebars', 'markdown'])
    emmetCSS(monaco, ['css', 'scss', 'less'])
    emmetJSX(monaco, ['javascript', 'typescript'])
  } catch (err) {
    console.warn('[xcode] emmet failed to load', err)
  }
}

export { monaco }
