import { monaco, languageForPath, configureLanguages } from './monaco'
import { bus, Ev } from '../core/bus'
import { store } from '../core/store'
import { fileIcon } from './icons'
import { toast } from './toast'

interface Tab {
  id: string
  path: string | null
  title: string
  model: monaco.editor.ITextModel
  viewState: monaco.editor.ICodeEditorViewState | null
  dirty: boolean
  isUntitled: boolean
}

let editor!: monaco.editor.IStandaloneCodeEditor
let editorCreated = false
let tabs: Tab[] = []
let activeId: string | null = null
let untitledSeq = 1
let autoSaveTimer: number | undefined

const $tabbar = () => document.getElementById('tabbar')!
const $host = () => document.getElementById('editor-host')!
const $welcome = () => document.getElementById('welcome')!
const $mount = () => document.getElementById('monaco')!
const $breadcrumbs = () => document.getElementById('breadcrumbs')!

export function editorOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
  const s = store.settings
  return {
    fontFamily: s.fontFamily,
    fontSize: s.fontSize + s.zoom,
    lineHeight: Math.round((s.fontSize + s.zoom) * s.lineHeight),
    fontLigatures: s.fontLigatures,
    tabSize: s.tabSize,
    insertSpaces: s.insertSpaces,
    wordWrap: s.wordWrap,
    minimap: { enabled: s.minimap, renderCharacters: false },
    lineNumbers: s.lineNumbers,
    renderWhitespace: s.renderWhitespace,
    cursorBlinking: s.cursorBlinking,
    cursorStyle: s.cursorStyle,
    smoothScrolling: s.smoothScrolling,
    stickyScroll: { enabled: s.stickyScroll },
    bracketPairColorization: { enabled: s.bracketPairColorization },
    guides: { bracketPairs: s.bracketPairColorization, indentation: true },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 8, bottom: 8 },
    renderLineHighlight: 'all',
    roundedSelection: true,
    fixedOverflowWidgets: true,
    scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12, useShadows: false },
    suggestSelection: 'first',
    linkedEditing: true,
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoSurround: 'languageDefined',
    formatOnPaste: store.settings.formatOnPaste,
    mouseWheelZoom: true,
    colorDecorators: true,
    colorDecoratorsActivatedOn: 'clickAndHover',
    unicodeHighlight: { ambiguousCharacters: false },
    // memory-lean defaults
    codeLens: false,
    inlayHints: { enabled: 'off' },
    wordBasedSuggestions: 'currentDocument',
    occurrencesHighlight: 'singleFile',
    foldingMaximumRegions: 2000,
    stopRenderingLineAfter: 12000
  }
}

function applySaveCleanups(model: monaco.editor.ITextModel): void {
  const s = store.settings
  if (!s.trimTrailingWhitespace && !s.insertFinalNewline && !s.trimFinalNewlines) return
  let text = model.getValue()
  const before = text
  if (s.trimTrailingWhitespace) text = text.replace(/[ \t]+(\r?\n)/g, '$1').replace(/[ \t]+$/, '')
  if (s.trimFinalNewlines) text = text.replace(/(\r?\n)+$/, s.insertFinalNewline ? '$1' : '')
  if (s.insertFinalNewline && text.length && !/\n$/.test(text)) text += model.getEOL()
  if (text !== before) {
    model.applyEdits([{ range: model.getFullModelRange(), text }])
  }
}

export function initEditor(): void {
  configureLanguages()

  bus.on(Ev.settingsChanged, () => {
    if (editorCreated) editor.updateOptions(editorOptions())
  })
  window.addEventListener('blur', () => {
    if (store.settings.autoSave === 'onFocusChange') void saveAll(true)
  })

  renderTabs()
}

/** Monaco is instantiated on first use — while you're only browsing the tree
 *  the editor engine never spins up, keeping idle memory low. */
function ensureEditor(): void {
  if (editorCreated) return
  editorCreated = true
  editor = monaco.editor.create($mount(), {
    ...editorOptions(),
    model: null,
    theme: store.settings.theme
  })

  editor.onDidChangeCursorPosition(() => emitCursor())
  editor.onDidChangeModelContent(() => {
    const t = current()
    if (t && !t.dirty) {
      t.dirty = true
      renderTabs()
      bus.emit(Ev.fileDirty, t.path)
    }
    scheduleAutoSave()
  })
  editor.onDidChangeCursorSelection(() => emitCursor())
}

function emitCursor(): void {
  const pos = editor.getPosition()
  const sel = editor.getSelection()
  const model = editor.getModel()
  if (!pos || !model) return
  let selCount = 0
  if (sel && !sel.isEmpty()) selCount = model.getValueInRange(sel).length
  bus.emit(Ev.cursorMoved, {
    line: pos.lineNumber,
    column: pos.column,
    selection: selCount,
    language: model.getLanguageId(),
    eol: model.getEOL() === '\n' ? 'LF' : 'CRLF'
  })
}

export function getEditor(): monaco.editor.IStandaloneCodeEditor | undefined {
  return editorCreated ? editor : undefined
}

export function current(): Tab | undefined {
  return tabs.find((t) => t.id === activeId)
}

function showEditor(show: boolean): void {
  $welcome().hidden = show
  $mount().hidden = !show
  $breadcrumbs().hidden = !show
  if (show) editor.layout()
}

export async function openPath(path: string, opts: { preview?: boolean } = {}): Promise<void> {
  const existing = tabs.find((t) => t.path === path)
  if (existing) {
    activate(existing.id)
    return
  }
  ensureEditor()
  let content: string
  try {
    content = await window.xcode.fs.read(path)
  } catch (err: any) {
    const msg = String(err?.message || err)
    if (msg.includes('binary')) toast(`Can't open binary file: ${baseName(path)}`, 'warn')
    else if (msg.includes('too-large')) toast(`File too large to open: ${baseName(path)}`, 'warn')
    else toast(`Failed to open ${baseName(path)}`, 'error')
    return
  }
  const uri = monaco.Uri.file(path)
  let model = monaco.editor.getModel(uri)
  if (!model) {
    model = monaco.editor.createModel(content, languageForPath(path), uri)
  } else if (model.getValue() !== content) {
    model.setValue(content)
  }
  model.updateOptions({ tabSize: store.settings.tabSize, insertSpaces: store.settings.insertSpaces })

  const tab: Tab = {
    id: 'f:' + path,
    path,
    title: baseName(path),
    model,
    viewState: null,
    dirty: false,
    isUntitled: false
  }
  tabs.push(tab)
  activate(tab.id)
  bus.emit(Ev.fileOpened, path)
  persistOpen()
}

export function openUntitled(): void {
  ensureEditor()
  const name = `Untitled-${untitledSeq++}`
  const model = monaco.editor.createModel('', 'plaintext', monaco.Uri.parse(`untitled:/${name}`))
  const tab: Tab = {
    id: 'u:' + name,
    path: null,
    title: name,
    model,
    viewState: null,
    dirty: false,
    isUntitled: true
  }
  tabs.push(tab)
  activate(tab.id)
}

export function activate(id: string): void {
  if (activeId === id) {
    const t = current()
    if (t) editor.setModel(t.model)
    showEditor(true)
    editor.focus()
    return
  }
  const prev = current()
  if (prev) prev.viewState = editor.saveViewState()

  activeId = id
  const t = current()
  if (!t) {
    editor.setModel(null)
    showEditor(false)
    renderTabs()
    return
  }
  editor.setModel(t.model)
  if (t.viewState) editor.restoreViewState(t.viewState)
  showEditor(true)
  editor.focus()
  renderTabs()
  renderBreadcrumbs(t)
  emitCursor()
  bus.emit(Ev.fileActivated, t.path)
  if (t.path) void store.persistState({ activeFile: t.path })
}

export function closeTab(id: string, force = false): void {
  const idx = tabs.findIndex((t) => t.id === id)
  if (idx < 0) return
  const t = tabs[idx]
  if (t.dirty && !force) {
    const keep = !window.confirm(`${t.title} has unsaved changes. Close without saving?`)
    if (keep) return
  }
  tabs.splice(idx, 1)
  t.model.dispose()
  bus.emit(Ev.fileClosed, t.path)
  if (activeId === id) {
    const next = tabs[idx] || tabs[idx - 1]
    activeId = null
    if (next) activate(next.id)
    else {
      editor.setModel(null)
      showEditor(false)
      renderTabs()
      renderBreadcrumbs(null)
    }
  } else {
    renderTabs()
  }
  persistOpen()
}

export function closeOthers(id: string): void {
  ;[...tabs].filter((t) => t.id !== id).forEach((t) => closeTab(t.id))
}
export function closeAll(): void {
  ;[...tabs].forEach((t) => closeTab(t.id))
}

export async function saveActive(as = false): Promise<void> {
  const t = current()
  if (!t) return
  await saveTab(t, as)
}

async function saveTab(t: Tab, as = false): Promise<void> {
  let path = t.path
  if (!path || as) {
    const chosen = await window.xcode.dialog.saveFile(path || t.title)
    if (!chosen) return
    path = chosen
  }
  if (current() === t) {
    if (store.settings.organizeImportsOnSave) {
      try {
        await editor.getAction('editor.action.organizeImports')?.run()
      } catch {
        /* not supported for this language */
      }
    }
    if (store.settings.formatOnSave) {
      try {
        await editor.getAction('editor.action.formatDocument')?.run()
      } catch {
        /* no formatter for this language */
      }
    }
  }
  applySaveCleanups(t.model)
  try {
    await window.xcode.fs.write(path, t.model.getValue())
  } catch {
    toast(`Failed to save ${baseName(path)}`, 'error')
    return
  }
  if (t.path !== path) {
    // re-home the tab onto the real file uri
    const newModel = monaco.editor.createModel(t.model.getValue(), languageForPath(path), monaco.Uri.file(path))
    if (t.isUntitled) t.model.dispose()
    t.model = newModel
    t.path = path
    t.isUntitled = false
    t.id = 'f:' + path
    if (current() === t) editor.setModel(newModel)
  }
  t.dirty = false
  t.title = baseName(path)
  renderTabs()
  renderBreadcrumbs(t)
  bus.emit(Ev.fileSaved, path)
  persistOpen()
}

export async function saveAll(silent = false): Promise<void> {
  for (const t of tabs) {
    if (t.dirty && t.path) {
      try {
        applySaveCleanups(t.model)
        await window.xcode.fs.write(t.path, t.model.getValue())
        t.dirty = false
        bus.emit(Ev.fileSaved, t.path)
      } catch {
        if (!silent) toast(`Failed to save ${t.title}`, 'error')
      }
    }
  }
  renderTabs()
}

function scheduleAutoSave(): void {
  if (store.settings.autoSave !== 'afterDelay') return
  if (autoSaveTimer) window.clearTimeout(autoSaveTimer)
  autoSaveTimer = window.setTimeout(() => {
    const t = current()
    if (t?.dirty && t.path) void saveTab(t)
  }, store.settings.autoSaveDelay)
}

export function setLanguage(langId: string): void {
  const t = current()
  if (!t) return
  monaco.editor.setModelLanguage(t.model, langId)
  emitCursor()
}

export function listLanguages(): { id: string; aliases: string[] }[] {
  return monaco.languages.getLanguages().map((l) => ({ id: l.id, aliases: l.aliases || [l.id] }))
}

export function gotoLine(line: number, col = 1): void {
  editor.revealLineInCenter(line)
  editor.setPosition({ lineNumber: line, column: col })
  editor.focus()
}

export function openFilesList(): string[] {
  return tabs.filter((t) => t.path).map((t) => t.path!)
}

function persistOpen(): void {
  void store.persistState({
    openFiles: tabs.filter((t) => t.path).map((t) => t.path!),
    activeFile: current()?.path || undefined
  })
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

/* ---------- rendering ---------- */

function renderTabs(): void {
  const bar = $tabbar()
  bar.innerHTML = ''
  if (!tabs.length) {
    bar.classList.add('empty')
    return
  }
  bar.classList.remove('empty')
  for (const t of tabs) {
    const el = document.createElement('div')
    el.className = 'tab' + (t.id === activeId ? ' active' : '') + (t.dirty ? ' dirty' : '')
    el.dataset.id = t.id
    el.innerHTML =
      `<span class="tab-icon">${t.isUntitled ? docFallback() : fileIcon(t.title)}</span>` +
      `<span class="tab-label">${escapeHtml(t.title)}</span>` +
      `<span class="tab-close" title="Close">${t.dirty ? '<span class="dot"></span>' : '&#xE8BB;'}</span>`
    el.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.tab-close')) return
      if (e.button === 1) {
        closeTab(t.id)
        return
      }
      activate(t.id)
    })
    el.querySelector('.tab-close')!.addEventListener('click', (e) => {
      e.stopPropagation()
      closeTab(t.id)
    })
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      bus.emit('ui:contextmenu', {
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Close', run: () => closeTab(t.id) },
          { label: 'Close Others', run: () => closeOthers(t.id) },
          { label: 'Close All', run: () => closeAll() },
          { sep: true },
          { label: 'Copy Path', run: () => t.path && navigator.clipboard.writeText(t.path) },
          { label: 'Reveal in Explorer', run: () => t.path && bus.emit('explorer:reveal', t.path) }
        ]
      })
    })
    bar.appendChild(el)
  }
}

function docFallback(): string {
  return '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 1.5h4.4L13 6.1V13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V3A1.5 1.5 0 0 1 4 1.5Z" fill="currentColor" fill-opacity="0.5"/></svg>'
}

function renderBreadcrumbs(t: Tab | null): void {
  const bc = $breadcrumbs()
  if (!t || !t.path) {
    bc.innerHTML = ''
    return
  }
  const rel = store.rootPath && t.path.startsWith(store.rootPath)
    ? t.path.slice(store.rootPath.length).replace(/^[\\/]/, '')
    : t.path
  const parts = rel.split(/[\\/]/)
  bc.innerHTML = parts
    .map((p, i) => `<span class="crumb${i === parts.length - 1 ? ' leaf' : ''}">${escapeHtml(p)}</span>`)
    .join('<span class="crumb-sep">&#xE76C;</span>')
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

export const _internals = { renderTabs }
