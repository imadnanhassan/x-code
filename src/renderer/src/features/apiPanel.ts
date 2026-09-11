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
  defaultCollectionPath,
  appendRequestToCollection,
  type Req,
  type NewReq
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
let renderToken = 0

const $view = () => document.querySelector('.side-view[data-view="api"]') as HTMLElement
const $body = () => $view().querySelector('.api-tab-body') as HTMLElement
const $head = () => $view().querySelector('.side-head') as HTMLElement

export function initApiPanel(): void {
  $head().innerHTML =
    `<span class="side-title">API CLIENT</span>` +
    `<div class="side-actions">` +
    `<button data-a="newReq" title="New Request">&#xE710;</button>` +
    `<button data-a="newFile" title="New Request File (.http)">&#xE7C3;</button>` +
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
  if (a === 'newReq') openNewRequestModal()
  if (a === 'newFile') void newRequestFile()
  if (a === 'refresh') void render()
}

async function render(): Promise<void> {
  const token = ++renderToken
  const tab = activeTab
  if (tab === 'collections') await renderCollections(token)
  else if (tab === 'environments') await renderEnvironments(token)
  else await renderHistory(token)
}

/** True once a newer render (a different tab, or a re-triggered same-tab render) has started. */
function stale(token: number): boolean {
  return token !== renderToken
}

/* ---------------- collections ---------------- */

async function renderCollections(token: number): Promise<void> {
  const body = $body()
  if (!store.rootPath) {
    body.innerHTML = `<div class="empty-hint"><p>Open a folder to browse saved requests.</p></div>`
    return
  }
  body.innerHTML = `<div class="empty-hint"><p>Scanning workspace…</p></div>`

  const all = await walkForQuickOpen()
  if (stale(token)) return
  const files = all.filter((f) => /\.(http|rest)$/i.test(f))
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
  if (stale(token)) return

  const projectName = store.rootPath.split(/[\\/]/).filter(Boolean).pop() || 'Project'
  const defaultFile = defaultCollectionPath()

  body.innerHTML = ''
  const addBtn = document.createElement('button')
  addBtn.className = 'btn-primary api-add-btn'
  addBtn.textContent = '+ New Request'
  addBtn.addEventListener('click', () => openNewRequestModal())
  body.appendChild(addBtn)

  let any = false
  for (const { file, reqs } of groups) {
    if (!reqs.length) continue
    any = true
    const name = file === defaultFile ? projectName : file.split(/[\\/]/).pop() || file
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
  if (!any) {
    const hint = document.createElement('div')
    hint.className = 'empty-hint'
    hint.innerHTML = `<p>No requests yet for <b>${escapeHtml(projectName)}</b>. Click "+ New Request" above, or use the <code>.http</code> file directly.</p>`
    body.appendChild(hint)
  }
}

/* ---------------- environments ---------------- */

async function renderEnvironments(token: number): Promise<void> {
  const body = $body()
  if (!store.rootPath) {
    body.innerHTML = `<div class="empty-hint"><p>Open a folder to manage environments.</p></div>`
    return
  }
  const envs = await loadNamedEnvironments()
  if (stale(token)) return
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

async function renderHistory(token: number): Promise<void> {
  const body = $body()
  const list = await window.xcode.apiHistory.list()
  if (stale(token)) return
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

/* ---------------- new request form ---------------- */

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

function openNewRequestModal(): void {
  if (!store.rootPath) {
    toast('Open a folder first', 'warn')
    return
  }
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal wide">
      <div class="modal-title">New Request</div>
      <div class="req-form">
        <input class="modal-input req-name" type="text" placeholder="Request name (optional)" spellcheck="false">
        <div class="req-line">
          <select class="req-method">${METHODS.map((m) => `<option${m === 'GET' ? ' selected' : ''}>${m}</option>`).join('')}</select>
          <input class="modal-input req-url" type="text" placeholder="https://api.example.com/users  or  {{baseUrl}}/users" spellcheck="false">
        </div>
        <div class="req-headers">
          <div class="req-headers-h"><span>Headers</span><button type="button" class="btn ghost btn-sm req-add-header">+ Add Header</button></div>
          <div class="req-headers-list"></div>
        </div>
        <textarea class="req-body" rows="7" placeholder="Request body (optional — e.g. JSON)" spellcheck="false"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" data-act="cancel">Cancel</button>
        <button class="btn primary" data-act="save">Save Request</button>
      </div>
    </div>`
  document.body.appendChild(overlay)

  const headersList = overlay.querySelector('.req-headers-list')!
  function addHeaderRow(k = '', v = ''): void {
    const row = document.createElement('div')
    row.className = 'req-header-row'
    row.innerHTML =
      `<input type="text" class="req-h-key" placeholder="Header" value="${escapeHtml(k)}" spellcheck="false">` +
      `<input type="text" class="req-h-val" placeholder="Value" value="${escapeHtml(v)}" spellcheck="false">` +
      `<button type="button" class="req-h-remove" title="Remove">&times;</button>`
    row.querySelector('.req-h-remove')!.addEventListener('click', () => row.remove())
    headersList.appendChild(row)
  }
  addHeaderRow('Content-Type', 'application/json')
  overlay.querySelector('.req-add-header')!.addEventListener('click', () => addHeaderRow())

  const urlInput = overlay.querySelector<HTMLInputElement>('.req-url')!
  urlInput.focus()

  const done = (): void => overlay.remove()
  overlay.addEventListener('click', (e) => { if (e.target === overlay) done() })
  overlay.querySelector('[data-act="cancel"]')!.addEventListener('click', done)
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') done() })

  overlay.querySelector('[data-act="save"]')!.addEventListener('click', () => {
    const url = urlInput.value.trim()
    if (!url) {
      toast('Enter a URL', 'warn')
      urlInput.focus()
      return
    }
    const method = (overlay.querySelector('.req-method') as HTMLSelectElement).value
    const name = (overlay.querySelector('.req-name') as HTMLInputElement).value.trim()
    const body = (overlay.querySelector('.req-body') as HTMLTextAreaElement).value
    const headers: Record<string, string> = {}
    overlay.querySelectorAll('.req-header-row').forEach((row) => {
      const k = (row.querySelector('.req-h-key') as HTMLInputElement).value.trim()
      const v = (row.querySelector('.req-h-val') as HTMLInputElement).value
      if (k) headers[k] = v
    })
    void (async () => {
      const file = await appendRequestToCollection({ name, method, url, headers, body })
      done()
      if (file) {
        toast('Request saved', 'ok')
        if (activeTab === 'collections') void render()
      } else {
        toast('Failed to save request', 'error')
      }
    })()
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
