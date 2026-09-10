import { bus, Ev } from '../core/bus'
import { store } from '../core/store'
import { iconFor } from './icons'
import { openPath } from './editor'
import { toast } from './toast'

interface Entry {
  name: string
  path: string
  isDirectory: boolean
  isSymbolicLink: boolean
}

const expanded = new Set<string>()
const childCache = new Map<string, Entry[]>()
let treeRoot: HTMLElement
let selectedPath: string | null = null

const $tree = () => document.getElementById('explorer-tree')!
const $rootName = () => document.getElementById('explorer-root-name')!

export function initExplorer(): void {
  treeRoot = $tree()

  document.querySelectorAll<HTMLButtonElement>('.side-actions button[data-cmd]').forEach((b) => {
    b.addEventListener('click', () => bus.emit('command:run', b.dataset.cmd))
  })

  bus.on('explorer:reveal', (p: string) => revealPath(p))
  bus.on(Ev.workspaceOpened, () => renderRoot())
  bus.on('explorer:refresh', () => refresh())

  treeRoot.addEventListener('contextmenu', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.tree-row')
    e.preventDefault()
    openContextMenu(e.clientX, e.clientY, row?.dataset.path || store.rootPath, row?.dataset.dir === '1')
  })
}

export async function openFolder(path?: string): Promise<void> {
  const chosen = path || (await window.xcode.dialog.openFolder())
  if (!chosen) return
  store.rootPath = chosen
  expanded.clear()
  childCache.clear()
  expanded.add(chosen)
  store.addRecent(chosen)
  await store.persistState({ lastFolder: chosen })
  bus.emit(Ev.workspaceOpened, chosen)
  await renderRoot()
}

async function children(dir: string): Promise<Entry[]> {
  if (childCache.has(dir)) return childCache.get(dir)!
  try {
    const list = (await window.xcode.fs.list(dir)) as Entry[]
    childCache.set(dir, list)
    return list
  } catch {
    return []
  }
}

export async function refresh(): Promise<void> {
  childCache.clear()
  await renderRoot()
}

async function renderRoot(): Promise<void> {
  if (!store.rootPath) return
  const name = store.rootPath.split(/[\\/]/).filter(Boolean).pop() || store.rootPath
  $rootName().textContent = name.toUpperCase()
  $rootName().title = store.rootPath
  treeRoot.innerHTML = ''
  const container = document.createElement('div')
  container.className = 'tree'
  treeRoot.appendChild(container)
  await renderLevel(container, store.rootPath, 0)
}

async function renderLevel(parent: HTMLElement, dir: string, depth: number): Promise<void> {
  const list = await children(dir)
  for (const entry of list) {
    const row = buildRow(entry, depth)
    parent.appendChild(row)
    if (entry.isDirectory && expanded.has(entry.path)) {
      const sub = document.createElement('div')
      sub.className = 'tree-children'
      parent.appendChild(sub)
      await renderLevel(sub, entry.path, depth + 1)
    }
  }
}

function buildRow(entry: Entry, depth: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'tree-row' + (entry.path === selectedPath ? ' selected' : '')
  row.dataset.path = entry.path
  row.dataset.dir = entry.isDirectory ? '1' : '0'
  row.style.paddingLeft = 6 + depth * 12 + 'px'
  const isOpen = entry.isDirectory && expanded.has(entry.path)
  row.innerHTML =
    `<span class="twisty">${entry.isDirectory ? (isOpen ? '&#xE70D;' : '&#xE76C;') : ''}</span>` +
    `<span class="tree-icon">${iconFor(entry.name, entry.isDirectory, isOpen)}</span>` +
    `<span class="tree-name">${escapeHtml(entry.name)}</span>`

  row.addEventListener('click', async () => {
    selectedPath = entry.path
    markSelected()
    if (entry.isDirectory) {
      await toggleDir(entry.path)
    } else {
      await openPath(entry.path)
    }
  })
  return row
}

async function toggleDir(path: string): Promise<void> {
  if (expanded.has(path)) expanded.delete(path)
  else expanded.add(path)
  await renderRoot()
}

function markSelected(): void {
  treeRoot.querySelectorAll('.tree-row.selected').forEach((r) => r.classList.remove('selected'))
  if (selectedPath) {
    const el = treeRoot.querySelector(`.tree-row[data-path="${cssEscape(selectedPath)}"]`)
    el?.classList.add('selected')
  }
}

export function collapseAll(): void {
  const root = store.rootPath
  expanded.clear()
  if (root) expanded.add(root)
  void renderRoot()
}

async function revealPath(target: string): Promise<void> {
  if (!store.rootPath || !target.startsWith(store.rootPath)) return
  const rel = target.slice(store.rootPath.length).replace(/^[\\/]/, '')
  const parts = rel.split(/[\\/]/)
  let acc = store.rootPath
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc + '/' + parts[i]
    expanded.add(acc.replace(/\//g, pathSep()))
  }
  selectedPath = target
  await renderRoot()
  const el = treeRoot.querySelector(`.tree-row[data-path="${cssEscape(target)}"]`)
  el?.scrollIntoView({ block: 'center' })
}

function pathSep(): string {
  return store.rootPath && store.rootPath.includes('\\') ? '\\' : '/'
}

/* ---------- mutations ---------- */

export async function createFileFlow(dirHint?: string): Promise<void> {
  const dir = resolveDir(dirHint)
  if (!dir) return toast('Open a folder first', 'warn')
  const name = await prompt2('New file name', 'untitled.txt')
  if (!name) return
  try {
    const created = await window.xcode.fs.createFile(dir, name)
    childCache.delete(dir)
    expanded.add(dir)
    await renderRoot()
    await openPath(created)
  } catch (e: any) {
    toast(e?.message || 'Could not create file', 'error')
  }
}

export async function createFolderFlow(dirHint?: string): Promise<void> {
  const dir = resolveDir(dirHint)
  if (!dir) return toast('Open a folder first', 'warn')
  const name = await prompt2('New folder name', 'new-folder')
  if (!name) return
  try {
    await window.xcode.fs.createDir(dir, name)
    childCache.delete(dir)
    expanded.add(dir)
    await renderRoot()
  } catch (e: any) {
    toast(e?.message || 'Could not create folder', 'error')
  }
}

async function renameFlow(target: string): Promise<void> {
  const base = target.split(/[\\/]/).pop()!
  const next = await prompt2('Rename', base)
  if (!next || next === base) return
  const parent = target.slice(0, target.length - base.length)
  try {
    const newPath = await window.xcode.fs.rename(target, parent + next)
    childCache.clear()
    await renderRoot()
    bus.emit('fs:renamed', { from: target, to: newPath })
  } catch (e: any) {
    toast(e?.message || 'Rename failed', 'error')
  }
}

async function deleteFlow(target: string): Promise<void> {
  const base = target.split(/[\\/]/).pop()!
  if (!window.confirm(`Delete "${base}"? This cannot be undone.`)) return
  try {
    await window.xcode.fs.remove(target)
    childCache.clear()
    await renderRoot()
    bus.emit('fs:deleted', target)
  } catch (e: any) {
    toast(e?.message || 'Delete failed', 'error')
  }
}

function resolveDir(hint?: string): string | null {
  if (hint) return hint
  if (selectedPath) {
    const isDir = treeRoot.querySelector(`.tree-row[data-path="${cssEscape(selectedPath)}"]`)?.getAttribute('data-dir') === '1'
    if (isDir) return selectedPath
    return selectedPath.slice(0, selectedPath.length - (selectedPath.split(/[\\/]/).pop()!.length))
  }
  return store.rootPath
}

function openContextMenu(x: number, y: number, target: string | null | undefined, isDir: boolean): void {
  const items: any[] = []
  if (target) {
    if (isDir) {
      items.push({ label: 'New File', run: () => createFileFlow(target) })
      items.push({ label: 'New Folder', run: () => createFolderFlow(target) })
      items.push({ sep: true })
    }
    if (!isDir) items.push({ label: 'Open', run: () => openPath(target) })
    if (!isDir) items.push({ label: 'Open in Default App', run: () => window.xcode.os.openPath(target) })
    items.push({ label: 'Rename', run: () => renameFlow(target) })
    items.push({ label: 'Delete', run: () => deleteFlow(target) })
    items.push({ sep: true })
    if (isDir) items.push({ label: 'Open Terminal Here', run: () => { selectedPath = target; bus.emit('terminal:new-here') } })
    items.push({ label: 'Reveal in File Explorer', run: () => window.xcode.os.revealInFolder(target) })
    items.push({ label: 'Copy Path', run: () => navigator.clipboard.writeText(target) })
    items.push({
      label: 'Copy Relative Path',
      run: () =>
        navigator.clipboard.writeText(
          store.rootPath && target.startsWith(store.rootPath)
            ? target.slice(store.rootPath.length).replace(/^[\\/]/, '')
            : target
        )
    })
  } else {
    items.push({ label: 'New File', run: () => createFileFlow() })
    items.push({ label: 'New Folder', run: () => createFolderFlow() })
    items.push({ label: 'Refresh', run: () => refresh() })
  }
  bus.emit('ui:contextmenu', { x, y, items })
}

/* tiny modal prompt */
function prompt2(title: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${escapeHtml(title)}</div>
        <input class="modal-input" type="text" value="${escapeHtml(value)}" spellcheck="false" />
        <div class="modal-actions">
          <button class="btn ghost" data-act="cancel">Cancel</button>
          <button class="btn primary" data-act="ok">OK</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    const input = overlay.querySelector<HTMLInputElement>('.modal-input')!
    input.focus()
    const dot = value.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : value.length)
    const done = (val: string | null): void => {
      overlay.remove()
      resolve(val)
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(null)
    })
    overlay.querySelector('[data-act="cancel"]')!.addEventListener('click', () => done(null))
    overlay.querySelector('[data-act="ok"]')!.addEventListener('click', () => done(input.value.trim() || null))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value.trim() || null)
      if (e.key === 'Escape') done(null)
    })
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
function cssEscape(s: string): string {
  return s.replace(/["\\]/g, '\\$&')
}

export function currentSelection(): string | null {
  return selectedPath
}
export async function walkForQuickOpen(): Promise<string[]> {
  if (!store.rootPath) return []
  const out: string[] = []
  const IGNORE = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.cache', 'coverage', '.wrangler', '.turbo', '.vite'])
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 12 || out.length > 12000) return
    const list = await children(dir)
    for (const e of list) {
      if (e.isDirectory) {
        if (IGNORE.has(e.name)) continue
        await walk(e.path, depth + 1)
      } else {
        out.push(e.path)
      }
    }
  }
  await walk(store.rootPath, 0)
  return out
}
