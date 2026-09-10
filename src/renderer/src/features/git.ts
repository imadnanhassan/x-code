import { bus, Ev } from '../core/bus'
import { store } from '../core/store'
import { openPath } from './editor'
import { fileIcon } from './icons'
import { toast } from './toast'

interface GitFile {
  path: string
  index: string
  worktree: string
  staged: boolean
  untracked: boolean
}
interface GitStatus {
  repo: boolean
  root?: string
  branch?: string
  upstream?: string
  ahead: number
  behind: number
  files: GitFile[]
}

let last: GitStatus = { repo: false, ahead: 0, behind: 0, files: [] }
let refreshTimer: number | undefined
let poll: number | undefined
let busy = false

const $view = () => document.querySelector('.side-view[data-view="git"]') as HTMLElement
const $body = () => $view().querySelector('.side-body') as HTMLElement
const $head = () => $view().querySelector('.side-head') as HTMLElement
const $branch = () => document.getElementById('sb-branch') as HTMLElement
const $actBtn = () => document.querySelector('.act-btn[data-view="git"]') as HTMLElement

export function initGit(): void {
  $head().innerHTML =
    `<span class="side-title">SOURCE CONTROL</span>` +
    `<div class="side-actions">` +
    `<button data-g="commit" title="Commit">&#xE73E;</button>` +
    `<button data-g="pull" title="Pull">&#xE74B;</button>` +
    `<button data-g="push" title="Push">&#xE74A;</button>` +
    `<button data-g="refresh" title="Refresh">&#xE72C;</button>` +
    `</div>`
  $head().querySelectorAll<HTMLButtonElement>('button[data-g]').forEach((b) => {
    b.addEventListener('click', () => onAction(b.dataset.g!))
  })

  $branch().addEventListener('click', () => bus.emit('command:run', 'view.git'))

  bus.on(Ev.workspaceOpened, () => refresh(true))
  bus.on(Ev.fileSaved, () => scheduleRefresh())
  bus.on('fs:changed', () => scheduleRefresh())
  bus.on('fs:renamed', () => scheduleRefresh())
  bus.on('fs:deleted', () => scheduleRefresh())
  bus.on('git:refresh', () => refresh(true))
  bus.on('git:action', (k: string) => void onAction(k))
  window.addEventListener('focus', () => scheduleRefresh())

  bus.on('sidebar:view', (v: string) => {
    if (v === 'git') {
      refresh(true)
      poll = window.setInterval(() => refresh(false), 4000)
    } else if (poll) {
      window.clearInterval(poll)
      poll = undefined
    }
  })

  render(false)
  if (store.rootPath) void refresh(true)
}

function scheduleRefresh(): void {
  if (refreshTimer) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => refresh(false), 400)
}

export async function refresh(showEmpty = false): Promise<void> {
  if (!store.rootPath) {
    last = { repo: false, ahead: 0, behind: 0, files: [] }
    render(showEmpty)
    return
  }
  try {
    last = (await window.xcode.git.status(store.rootPath)) as GitStatus
  } catch {
    last = { repo: false, ahead: 0, behind: 0, files: [] }
  }
  render(showEmpty)
  updateBranch()
  updateBadge()
  bus.emit('git:decorations', decorationMap())
}

function decorationMap(): Map<string, { i: string; w: string }> {
  // Keys are forward-slash absolute paths (git root is already forward-slash);
  // explorer normalises its own paths the same way before lookup.
  const m = new Map<string, { i: string; w: string }>()
  if (!last.repo || !last.root) return m
  const root = last.root.replace(/\\/g, '/').replace(/\/$/, '')
  for (const f of last.files) {
    m.set(root + '/' + f.path, { i: f.index, w: f.worktree })
  }
  return m
}

/** Absolute path in the same separator style the file tree uses (so tabs dedupe). */
function absPath(rel: string): string {
  const fwd = (last.root || store.rootPath || '').replace(/\\/g, '/').replace(/\/$/, '') + '/' + rel
  return store.rootPath && store.rootPath.includes('\\') ? fwd.replace(/\//g, '\\') : fwd
}

/* ---------------- rendering ---------------- */

function render(showEmpty: boolean): void {
  const body = $body()
  if (!store.rootPath) {
    body.innerHTML = `<div class="empty-hint"><p>Open a folder to use Source Control.</p></div>`
    return
  }
  if (!last.repo) {
    body.innerHTML =
      `<div class="empty-hint"><p>This folder is not a Git repository.</p>` +
      `<button class="btn-primary" id="git-init">Initialize Repository</button></div>`
    body.querySelector('#git-init')!.addEventListener('click', onInit)
    return
  }

  const staged = last.files.filter((f) => f.staged)
  const changes = last.files.filter((f) => !f.staged)

  body.innerHTML = `
    <div class="git-commit">
      <textarea id="git-msg" rows="1" placeholder="Message (Ctrl+Enter to commit on '${escapeHtml(last.branch || '')}')" spellcheck="false"></textarea>
      <button class="btn primary" id="git-commit-btn">&#x2713; Commit</button>
    </div>
    ${last.upstream ? `<div class="git-sync">${last.behind ? `&#x2193; ${last.behind}` : ''} ${last.ahead ? `&#x2191; ${last.ahead}` : ''} ${!last.ahead && !last.behind ? 'up to date with ' + escapeHtml(last.upstream) : ''}</div>` : `<div class="git-sync muted">no upstream — Push to publish '${escapeHtml(last.branch || '')}'</div>`}
    <div class="git-groups"></div>
  `

  const groups = body.querySelector('.git-groups')!
  if (staged.length) groups.appendChild(groupEl('STAGED CHANGES', staged, true))
  if (changes.length) groups.appendChild(groupEl('CHANGES', changes, false))
  if (!staged.length && !changes.length && showEmpty) {
    groups.innerHTML = `<div class="git-clean">&#x2713; No changes</div>`
  }

  const ta = body.querySelector<HTMLTextAreaElement>('#git-msg')!
  ta.addEventListener('input', () => {
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  })
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void doCommit()
    }
  })
  body.querySelector('#git-commit-btn')!.addEventListener('click', () => void doCommit())
}

function groupEl(title: string, files: GitFile[], staged: boolean): HTMLElement {
  const g = document.createElement('div')
  g.className = 'git-group'
  g.innerHTML =
    `<div class="git-group-h"><span>${title}</span>` +
    `<span class="git-group-act">` +
    (staged
      ? `<button data-all="unstage" title="Unstage all">&#x2212;</button>`
      : `<button data-all="discard" title="Discard all">&#x21A9;</button><button data-all="stage" title="Stage all">&#x2b;</button>`) +
    `<span class="git-count">${files.length}</span></span></div>`

  g.querySelector('[data-all="stage"]')?.addEventListener('click', () => act('stage', files.map((f) => f.path)))
  g.querySelector('[data-all="unstage"]')?.addEventListener('click', () => act('unstage', files.map((f) => f.path)))
  g.querySelector('[data-all="discard"]')?.addEventListener('click', () => discardFlow(files))

  for (const f of files) {
    const row = document.createElement('div')
    row.className = 'git-row'
    const name = f.path.split('/').pop() || f.path
    const dir = f.path.split('/').slice(0, -1).join('/')
    const letter = statusLetter(f)
    row.innerHTML =
      `<span class="git-ic">${fileIcon(name)}</span>` +
      `<span class="git-name">${escapeHtml(name)}</span>` +
      `<span class="git-dir">${escapeHtml(dir)}</span>` +
      `<span class="git-row-act">` +
      (staged
        ? `<button data-a="unstage" title="Unstage">&#x2212;</button>`
        : `<button data-a="discard" title="Discard">&#x21A9;</button><button data-a="stage" title="Stage">&#x2b;</button>`) +
      `</span>` +
      `<span class="git-st git-st-${letter.toLowerCase()}" title="${letter}">${letter}</span>`
    row.querySelector('.git-name')!.addEventListener('click', () => {
      if (f.worktree !== 'D') openPath(absPath(f.path))
    })
    row.querySelector('[data-a="stage"]')?.addEventListener('click', (e) => { e.stopPropagation(); act('stage', [f.path]) })
    row.querySelector('[data-a="unstage"]')?.addEventListener('click', (e) => { e.stopPropagation(); act('unstage', [f.path]) })
    row.querySelector('[data-a="discard"]')?.addEventListener('click', (e) => { e.stopPropagation(); discardFlow([f]) })
    g.appendChild(row)
  }
  return g
}

function statusLetter(f: GitFile): string {
  if (f.untracked) return 'U'
  const s = (f.staged ? f.index : f.worktree) || f.index || f.worktree
  if (s === '?') return 'U'
  return s.trim() || 'M'
}

/* ---------------- actions ---------------- */

async function act(kind: 'stage' | 'unstage', files: string[]): Promise<void> {
  if (busy || !store.rootPath) return
  busy = true
  try {
    const r = kind === 'stage'
      ? await window.xcode.git.stage(store.rootPath, files)
      : await window.xcode.git.unstage(store.rootPath, files)
    if (!r.ok && r.message) toast(r.message, 'error')
  } finally {
    busy = false
    await refresh(true)
  }
}

async function discardFlow(files: GitFile[]): Promise<void> {
  if (!store.rootPath) return
  const names = files.map((f) => f.path.split('/').pop()).join(', ')
  if (!window.confirm(`Discard changes in ${files.length === 1 ? names : files.length + ' files'}? This cannot be undone.`)) return
  busy = true
  try {
    const tracked = files.filter((f) => !f.untracked).map((f) => f.path)
    const untracked = files.filter((f) => f.untracked).map((f) => f.path)
    const r = await window.xcode.git.discard(store.rootPath, tracked, untracked)
    if (!r.ok && r.message) toast(r.message, 'error')
  } finally {
    busy = false
    await refresh(true)
  }
}

async function doCommit(): Promise<void> {
  if (busy || !store.rootPath) return
  const ta = $body().querySelector<HTMLTextAreaElement>('#git-msg')
  const msg = (ta?.value || '').trim()
  if (!msg) {
    toast('Enter a commit message', 'warn')
    ta?.focus()
    return
  }
  const staged = last.files.filter((f) => f.staged)
  if (!staged.length) {
    if (!last.files.length) {
      toast('Nothing to commit', 'warn')
      return
    }
    if (!window.confirm('No staged changes. Stage all changes and commit?')) return
    busy = true
    try {
      await window.xcode.git.stageAll(store.rootPath)
    } finally {
      busy = false
    }
  }
  busy = true
  try {
    const r = await window.xcode.git.commit(store.rootPath, msg)
    if (r.ok) {
      toast('Committed', 'ok')
      if (ta) ta.value = ''
    } else {
      toast(r.message || 'Commit failed', 'error')
    }
  } finally {
    busy = false
    await refresh(true)
  }
}

async function onAction(kind: string): Promise<void> {
  if (!store.rootPath) return
  if (kind === 'refresh') return void refresh(true)
  if (kind === 'commit') return void doCommit()
  if (kind === 'init') return onInit()
  if (kind === 'push' || kind === 'pull') {
    busy = true
    toast(kind === 'push' ? 'Pushing…' : 'Pulling…', 'info', 1500)
    try {
      const r = kind === 'push'
        ? await window.xcode.git.push(store.rootPath)
        : await window.xcode.git.pull(store.rootPath)
      toast(r.ok ? (kind === 'push' ? 'Pushed' : 'Pulled') : (r.message || kind + ' failed'), r.ok ? 'ok' : 'error')
    } finally {
      busy = false
      await refresh(true)
    }
  }
}

async function onInit(): Promise<void> {
  if (!store.rootPath) return
  const r = await window.xcode.git.init(store.rootPath)
  if (r.ok) {
    toast('Initialized empty Git repository', 'ok')
    await refresh(true)
  } else {
    toast(r.message || 'git init failed', 'error')
  }
}

/* ---------------- status bar / badge ---------------- */

function updateBranch(): void {
  const el = $branch()
  if (!last.repo || !last.branch) {
    el.hidden = true
    return
  }
  el.hidden = false
  const sync = last.behind || last.ahead
    ? `  ${last.behind ? '\u2193' + last.behind : ''}${last.ahead ? '\u2191' + last.ahead : ''}`
    : ''
  el.textContent = `\uE0A0 ${last.branch}${sync}`
  el.title = `Git: ${last.branch}${last.upstream ? ' \u2192 ' + last.upstream : ' (no upstream)'}`
}

function updateBadge(): void {
  const btn = $actBtn()
  if (!btn) return
  let badge = btn.querySelector('.act-badge') as HTMLElement | null
  const n = last.repo ? last.files.length : 0
  if (n > 0) {
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'act-badge'
      btn.appendChild(badge)
    }
    badge.textContent = n > 99 ? '99+' : String(n)
  } else if (badge) {
    badge.remove()
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

export function gitStatusRel(absPath: string): { i: string; w: string } | undefined {
  if (!last.repo || !last.root || !absPath.startsWith(last.root)) return undefined
  const rel = absPath.slice(last.root.length).replace(/^[\\/]/, '').split('\\').join('/')
  const f = last.files.find((x) => x.path === rel)
  return f ? { i: f.index, w: f.worktree } : undefined
}
