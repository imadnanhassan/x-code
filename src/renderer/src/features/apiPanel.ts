import { bus, Ev } from '../core/bus'
import { store } from '../core/store'
import { openPath, gotoLine } from './editor'
import { walkForQuickOpen } from './explorer'
import { toast } from './toast'
import {
  parseAll,
  send,
  newRequestFile,
  loadNamedEnvironments,
  getActiveEnvName,
  setActiveEnvironment,
  ensureEnvFile,
  type Req
} from './apiClient'

interface ApiHistoryEntry {
  id: string
  method: string
  url: string
  ok: boolean
  status?: number
  timeMs?: number
  size?: number
  at: number
}

type Tab = 'collections' | 'environments' | 'history'
let activeTab: Tab = 'collections'
let visible = false
let refreshTimer: number | undefined

const $view = () => document.querySelector('.side-view[data-view="api"]') as HTMLElement
const $body = () => $view().querySelector('.api-tab-body') as HTMLElement
const $head = () => $view().querySelector('.side-head') as HTMLElement

export function initApiPanel(): void {
  $head().innerHTML =
    `<span class="side-title">API CLIENT</span>` +
    `<div class="side-actions">` +
    `<button data-a="new" title="New Request File">&#xE7C3;</button>` +
    `<button data-a="refresh" title="Refresh">&#xE72C;</button>` +
    `</div>`
  $head().querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((b) => {
    b.addEventListener('click', () => onHeadAction(b.dataset.a!))
  })

  $view().querySelectorAll<HTMLButtonElement>('.api-tab').forEach((b) => {
    b.addEventListener('click', () => {
      activeTab = b.dataset.tab as Tab
      syncTabs()
      void render()
    })
  })

  bus.on('sidebar:view', (v: string) => {
    visible = v === 'api'
    if (visible) void render()
  })
  bus.on(Ev.workspaceOpened, () => { if (visible) void render() })
  bus.on(Ev.fileSaved, () => { if (visible && activeTab === 'collections') scheduleRender() })
  bus.on('apiHistory:changed', () => { if (visible && activeTab === 'history') void render() })
  bus.on('apiEnv:changed', () => { if (visible && activeTab === 'environments') void render() })

  syncTabs()
}

function scheduleRender(): void {
  if (refreshTimer) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => void render(), 400)
}

function syncTabs(): void {
  $view().querySelectorAll<HTMLButtonElement>('.api-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === activeTab)
  })
}

function onHeadAction(a: string): void {
  if (a === 'new') void newRequestFile()
  if (a === 'refresh') void render()
}

async function render(): Promise<void> {
  if (activeTab === 'collections') return renderCollections()
  if (activeTab === 'environments') return renderEnvironments()
  return renderHistory()
}

/* ---------------- collections ---------------- */

async function renderCollections(): Promise<void> {
  const body = $body()
  if (!store.rootPath) {
    body.innerHTML = `<div class="empty-hint"><p>Open a folder to browse saved requests.</p></div>`
    return
  }
  body.innerHTML = `<div class="empty-hint"><p>Scanning workspace…</p></div>`

  const all = await walkForQuickOpen()
  const files = all.filter((f) => /\.(http|rest)$/i.test(f))
  if (!files.length) {
    body.innerHTML =
      `<div class="empty-hint"><p>No <code>.http</code> or <code>.rest</code> files yet.</p>` +
      `<button class="btn-primary" id="api-new-file">New Request File</button></div>`
    body.querySelector('#api-new-file')!.addEventListener('click', () => void newRequestFile())
    return
  }

  const groups = await Promise.all(
    files.map(async (file) => {
      try {
        const text = await window.xcode.fs.read(file)
        return { file, reqs: parseAll(text) }
      } catch {
        return { file, reqs: [] as Req[] }
      }
    })
  )

  body.innerHTML = ''
  for (const { file, reqs } of groups) {
    if (!reqs.length) continue
    const name = file.split(/[\\/]/).pop() || file
    const group = document.createElement('div')
    group.className = 'api-group'
    group.innerHTML = `<div class="api-group-h"><span>${escapeHtml(name)}</span><span class="api-count">${reqs.length}</span></div>`
    for (const r of reqs) {
      const row = document.createElement('div')
      row.className = 'api-row'
      row.title = r.url
      row.innerHTML =
        `<span class="api-method api-m-${r.method.toLowerCase()}">${r.method}</span>` +
        `<span class="api-name">${escapeHtml(r.name || r.url)}</span>` +
        `<button class="api-send" title="Send">&#x25B6;</button>`
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.api-send')) return
        void openPath(file).then(() => gotoLine(r.startLine))
      })
      row.querySelector('.api-send')!.addEventListener('click', (e) => {
        e.stopPropagation()
        void send(r)
      })
      group.appendChild(row)
    }
    body.appendChild(group)
  }
  if (!body.children.length) {
    body.innerHTML = `<div class="empty-hint"><p>Found <code>.http</code> files, but no requests parsed inside them.</p></div>`
  }
}

/* ---------------- environments ---------------- */

async function renderEnvironments(): Promise<void> {
  const body = $body()
  if (!store.rootPath) {
    body.innerHTML = `<div class="empty-hint"><p>Open a folder to manage environments.</p></div>`
    return
  }
  const envs = await loadNamedEnvironments()
  const names = Object.keys(envs)
  const active = getActiveEnvName()

  if (!names.length) {
    body.innerHTML =
      `<div class="empty-hint"><p>No environments yet. Create <code>.xcode/http-env.json</code> with named variable sets (e.g. <code>dev</code>, <code>prod</code>) and reference them as <code>{{baseUrl}}</code> in your requests.</p>` +
      `<button class="btn-primary" id="api-create-env">Create Environments File</button></div>`
    body.querySelector('#api-create-env')!.addEventListener('click', async () => {
      const file = await ensureEnvFile()
      if (file) { await openPath(file); void render() }
    })
    return
  }

  body.innerHTML = `<div class="api-env-list"></div>`
  const list = body.querySelector('.api-env-list')!

  const none = document.createElement('div')
  none.className = 'api-row api-env-row' + (active === '' ? ' active' : '')
  none.innerHTML = `<span class="api-env-dot"></span><span class="api-name">None</span>`
  none.addEventListener('click', () => { void setActiveEnvironment(''); toast('No environment active', 'info', 1200) })
  list.appendChild(none)

  for (const name of names) {
    const row = document.createElement('div')
    row.className = 'api-row api-env-row' + (name === active ? ' active' : '')
    const keys = Object.keys(envs[name]).join(', ')
    row.title = keys
    row.innerHTML = `<span class="api-env-dot"></span><span class="api-name">${escapeHtml(name)}</span>`
    row.addEventListener('click', () => { void setActiveEnvironment(name); toast(`Environment: ${name}`, 'ok', 1200) })
    list.appendChild(row)
  }

  const editRow = document.createElement('button')
  editRow.className = 'btn ghost api-edit-env'
  editRow.textContent = 'Edit http-env.json'
  editRow.addEventListener('click', async () => {
    const file = await ensureEnvFile()
    if (file) await openPath(file)
  })
  body.appendChild(editRow)
}

/* ---------------- history ---------------- */

async function renderHistory(): Promise<void> {
  const body = $body()
  const list = await window.xcode.apiHistory.list()
  if (!list.length) {
    body.innerHTML = `<div class="empty-hint"><p>No requests sent yet.</p></div>`
    return
  }
  body.innerHTML = `<button class="btn ghost api-clear-history">Clear History</button><div class="api-history-list"></div>`
  const listEl = body.querySelector('.api-history-list')!
  for (const h of list as ApiHistoryEntry[]) {
    const row = document.createElement('div')
    row.className = 'api-row api-history-row'
    const cls = !h.ok ? 'api-m-fail' : (h.status || 0) < 300 ? 'api-m-ok' : (h.status || 0) < 400 ? 'api-m-warn' : 'api-m-fail'
    row.innerHTML =
      `<span class="api-method api-m-${h.method.toLowerCase()}">${h.method}</span>` +
      `<span class="api-name">${escapeHtml(h.url)}</span>` +
      `<span class="api-hist-status ${cls}">${h.ok ? h.status ?? '' : 'err'}</span>` +
      `<span class="api-hist-time">${relTime(h.at)}</span>`
    row.title = `${h.timeMs ?? '?'} ms`
    listEl.appendChild(row)
  }
  body.querySelector('.api-clear-history')!.addEventListener('click', async () => {
    if (!window.confirm('Clear all API request history?')) return
    await window.xcode.apiHistory.clear()
    void render()
  })
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
