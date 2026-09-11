import { monaco } from './monaco'
import { store } from '../core/store'
import { bus, Ev } from '../core/bus'
import { getEditor, current, openPath } from './editor'
import { toast } from './toast'

let fileEnvKeys: Record<string, string> = {}
let namedEnvKeys: Record<string, string> = {}
let envKeys: Record<string, string> = {}

function recomputeEnv(): void {
  envKeys = { ...fileEnvKeys, ...namedEnvKeys }
}

const $host = () => document.getElementById('editor-host')!
const $pane = () => document.getElementById('api-response') as HTMLElement

/* ---------------- .http language ---------------- */

function registerHttpLanguage(): void {
  if (monaco.languages.getLanguages().some((l) => l.id === 'http')) return
  monaco.languages.register({ id: 'http', extensions: ['.http', '.rest'], aliases: ['HTTP', 'http'] })
  monaco.languages.setMonarchTokensProvider('http', {
    tokenizer: {
      root: [
        [/^#{1,}.*$/, 'comment'],
        [/^\s*\/\/.*$/, 'comment'],
        [/^@[\w-]+/, 'variable'],
        [/\{\{[^}]+\}\}/, 'variable.predefined'],
        [/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/, 'keyword'],
        [/^[A-Za-z-]+(?=:)/, 'type'],
        [/https?:\/\/[^\s]+/, 'string.link'],
        [/".*?"/, 'string']
      ]
    }
  })
  monaco.languages.setLanguageConfiguration('http', {
    comments: { lineComment: '#' }
  })
}

/* ---------------- request parsing ---------------- */

export interface Req {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  startLine: number
  name?: string
}

function subst(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, k) => vars[k] ?? process.env?.[k] ?? `{{${k}}}`)
}

export function parseAll(text: string): Req[] {
  const lines = text.split(/\r?\n/)
  // Scoped to this file only — @var definitions must not leak into other open
  // .http files (parseAll runs per-file, from CodeLens and from the Collections
  // scan, and previously mutated the shared envKeys permanently).
  const vars: Record<string, string> = { ...envKeys }
  for (const l of lines) {
    const m = l.match(/^@([\w-]+)\s*=\s*(.+)$/)
    if (m) vars[m[1]] = m[2].trim()
  }

  const reqs: Req[] = []
  let i = 0
  let pendingTitle: string | undefined
  while (i < lines.length) {
    const titleMatch = lines[i].match(/^#{3,}\s*(.*)$/)
    if (titleMatch) {
      pendingTitle = titleMatch[1].trim() || undefined
      i++
      continue
    }
    const rl = lines[i].match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/i)
    if (!rl) {
      i++
      continue
    }
    const req: Req = { method: rl[1].toUpperCase(), url: subst(rl[2], vars), headers: {}, body: '', startLine: i + 1, name: pendingTitle }
    pendingTitle = undefined
    i++
    while (i < lines.length && lines[i].trim() && !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i.test(lines[i])) {
      const h = lines[i].match(/^([A-Za-z-]+):\s*(.*)$/)
      if (h) req.headers[h[1]] = subst(h[2], vars)
      i++
    }
    // blank line then body until next ### or request or EOF
    if (i < lines.length && !lines[i].trim()) i++
    const bodyLines: string[] = []
    while (i < lines.length && !/^#{3,}/.test(lines[i]) && !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i.test(lines[i])) {
      bodyLines.push(lines[i])
      i++
    }
    req.body = subst(bodyLines.join('\n').trim(), vars)
    reqs.push(req)
  }
  return reqs
}

/* ---------------- send + render ---------------- */

export async function send(req: Req): Promise<void> {
  showPane(true)
  $pane().querySelector('.ar-status')!.textContent = 'Sending…'
  $pane().querySelector('.ar-meta')!.textContent = `${req.method} ${req.url}`
  $pane().querySelector('.ar-body')!.innerHTML = ''

  const res = await window.xcode.http.send({
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body || undefined
  })

  void window.xcode.apiHistory.record({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method: req.method,
    url: req.url,
    ok: res.ok,
    status: res.status,
    timeMs: res.timeMs,
    size: res.size,
    at: Date.now()
  })
  bus.emit('apiHistory:changed')

  const statusEl = $pane().querySelector('.ar-status') as HTMLElement
  if (!res.ok) {
    statusEl.textContent = 'Error'
    statusEl.className = 'ar-status ar-fail'
    $pane().querySelector('.ar-body')!.innerHTML = `<pre class="ar-err">${escapeHtml(res.error || 'request failed')}</pre>`
    return
  }
  const cls = res.status < 300 ? 'ar-ok' : res.status < 400 ? 'ar-warn' : 'ar-fail'
  statusEl.textContent = `${res.status} ${res.statusText || ''}`.trim()
  statusEl.className = 'ar-status ' + cls
  $pane().querySelector('.ar-meta')!.textContent = `${res.timeMs} ms · ${fmtBytes(res.size || 0)}`

  const ct = (res.headers?.['content-type'] || '').toLowerCase()
  let bodyHtml = ''
  if (ct.includes('json')) {
    try {
      bodyHtml = `<pre class="ar-json">${escapeHtml(JSON.stringify(JSON.parse(res.body), null, 2))}</pre>`
    } catch {
      bodyHtml = `<pre>${escapeHtml(res.body)}</pre>`
    }
  } else {
    bodyHtml = `<pre>${escapeHtml((res.body || '').slice(0, 200000))}</pre>`
  }
  const hdrs = Object.entries(res.headers || {})
    .map(([k, v]) => `<div><span class="arh-k">${escapeHtml(k)}</span>: ${escapeHtml(String(v))}</div>`)
    .join('')
  $pane().querySelector('.ar-body')!.innerHTML =
    `<details class="ar-headers"><summary>Headers (${Object.keys(res.headers || {}).length})</summary>${hdrs}</details>` +
    bodyHtml
}

function showPane(v: boolean): void {
  $pane().hidden = !v
  $host().classList.toggle('ar-open', v)
  getEditor()?.layout()
}

/* ---------------- init ---------------- */

export function initApiClient(): void {
  registerHttpLanguage()
  $pane().querySelector('#ar-close')!.addEventListener('click', () => showPane(false))

  monaco.languages.registerCodeLensProvider('http', {
    provideCodeLenses(model) {
      const reqs = parseAll(model.getValue())
      return {
        lenses: reqs.map((r, idx) => ({
          range: new monaco.Range(r.startLine, 1, r.startLine, 1),
          command: { id: 'xcode.sendHttp', title: '▶ Send Request', arguments: [model.uri.toString(), idx] }
        })),
        dispose() {}
      }
    },
    resolveCodeLens: (_m, l) => l
  })

  monaco.editor.registerCommand('xcode.sendHttp', (_a: unknown, uriStr: string, idx: number) => {
    const model = monaco.editor.getModel(monaco.Uri.parse(uriStr))
    if (!model) return
    const reqs = parseAll(model.getValue())
    if (reqs[idx]) void send(reqs[idx])
  })

  bus.on(Ev.workspaceOpened, () => {
    void loadEnv()
    void applyActiveEnv()
  })
  void loadEnv()
  void applyActiveEnv()
}

/** Restores whichever named environment was last selected for this workspace. */
async function applyActiveEnv(): Promise<void> {
  const name = getActiveEnvName()
  namedEnvKeys = {}
  if (name) {
    const envs = await loadNamedEnvironments()
    namedEnvKeys = envs[name] || {}
  }
  recomputeEnv()
}

async function loadEnv(): Promise<void> {
  fileEnvKeys = {}
  if (store.rootPath) {
    try {
      const list = (await window.xcode.fs.list(store.rootPath)) as any[]
      for (const f of list.filter((e) => !e.isDirectory && /^\.env(\.|$)/.test(e.name))) {
        try {
          const txt = await window.xcode.fs.read(f.path)
          for (const l of txt.split(/\r?\n/)) {
            const m = l.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*)$/)
            if (m) fileEnvKeys[m[1]] = m[2].replace(/^["']|["']$/g, '')
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* none */
    }
  }
  recomputeEnv()
}

/* ---------------- named environments (.xcode/http-env.json) ---------------- */

function envFilePath(): string | null {
  if (!store.rootPath) return null
  return store.rootPath + (store.rootPath.includes('\\') ? '\\.xcode\\http-env.json' : '/.xcode/http-env.json')
}

export async function loadNamedEnvironments(): Promise<Record<string, Record<string, string>>> {
  const file = envFilePath()
  if (!file) return {}
  try {
    const txt = await window.xcode.fs.read(file)
    const parsed = JSON.parse(txt)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function getActiveEnvName(): string {
  if (!store.rootPath) return ''
  return store.state.apiActiveEnv?.[store.rootPath] || ''
}

export async function setActiveEnvironment(name: string): Promise<void> {
  namedEnvKeys = {}
  if (name) {
    const envs = await loadNamedEnvironments()
    namedEnvKeys = envs[name] || {}
  }
  recomputeEnv()
  if (store.rootPath) {
    await store.persistState({ apiActiveEnv: { ...store.state.apiActiveEnv, [store.rootPath]: name } })
  }
  bus.emit('apiEnv:changed')
}

/** Path to the per-project default collection — grouped in the sidebar under the project's own name. */
export function defaultCollectionPath(): string | null {
  if (!store.rootPath) return null
  return store.rootPath + (store.rootPath.includes('\\') ? '\\.xcode\\requests.http' : '/.xcode/requests.http')
}

export interface NewReq {
  name: string
  method: string
  url: string
  headers: Record<string, string>
  body: string
}

/** Appends one request, formatted as a `.http` block, to the project's default collection file. */
export async function appendRequestToCollection(req: NewReq): Promise<string | null> {
  const file = defaultCollectionPath()
  if (!file) return null
  let existing = ''
  try {
    existing = await window.xcode.fs.read(file)
  } catch {
    /* new file */
  }
  const lines = [`### ${req.name || `${req.method} ${req.url}`}`, `${req.method} ${req.url}`]
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.trim()) lines.push(`${k.trim()}: ${v}`)
  }
  if (req.body.trim()) {
    lines.push('')
    lines.push(req.body.trim())
  }
  const sep = existing.trim() ? '\n\n' : ''
  await window.xcode.fs.write(file, existing.replace(/\s+$/, '') + sep + lines.join('\n') + '\n')
  return file
}

export async function ensureEnvFile(): Promise<string | null> {
  const file = envFilePath()
  if (!file) return null
  try {
    await window.xcode.fs.read(file)
  } catch {
    await window.xcode.fs.write(
      file,
      JSON.stringify(
        {
          dev: { baseUrl: 'http://localhost:3000' },
          prod: { baseUrl: 'https://api.example.com' }
        },
        null,
        2
      )
    )
  }
  return file
}

export async function newRequestFile(): Promise<void> {
  if (!store.rootPath) {
    toast('Open a folder first', 'warn')
    return
  }
  const file = store.rootPath + (store.rootPath.includes('\\') ? '\\' : '/') + 'requests.http'
  try {
    await window.xcode.fs.read(file)
  } catch {
    await window.xcode.fs.write(
      file,
      '### Example request\nGET https://api.github.com/repos/imadnanhassan/x-code\nAccept: application/vnd.github+json\n\n### POST with a JSON body\n# POST https://httpbin.org/post\n# Content-Type: application/json\n#\n# { "hello": "world" }\n'
    )
  }
  await openPath(file)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
function fmtBytes(n: number): string {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(2) + ' MB'
}
