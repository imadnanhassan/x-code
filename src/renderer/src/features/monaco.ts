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

export function configureLanguages(): void {
  const ts = monaco.languages.typescript
  const common = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    allowJs: true,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
    skipLibCheck: true
  }
  ts.typescriptDefaults.setCompilerOptions(common)
  ts.javascriptDefaults.setCompilerOptions(common)
  ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false })
  ts.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })

  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    schemas: [],
    trailingCommas: 'warning'
  })
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
