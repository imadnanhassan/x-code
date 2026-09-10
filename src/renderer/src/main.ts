import './styles/base.css'
import './styles/layout.css'
import './styles/widgets.css'

import { store } from './core/store'
import { bus, Ev } from './core/bus'
import { initThemes, applyTheme, allThemes } from './features/themes'
import { initEditor, getEditor, openPath, openUntitled, saveActive, saveAll, closeTab, current, setLanguage, listLanguages, gotoLine } from './features/editor'
import { initExplorer, openFolder, refresh as refreshExplorer, collapseAll, createFileFlow, createFolderFlow, walkForQuickOpen } from './features/explorer'
import { initSearch, focusSearch } from './features/search'
import { initSettingsPanel, focusSettings } from './features/settingsPanel'
import { initTerminal, togglePanel, runInTerminal } from './features/terminal'
import { initStatusbar } from './features/statusbar'
import { initTitlebar } from './features/titlebar'
import { initContextMenu } from './features/contextmenu'
import { registerCommands, openCommandPalette, openPicker, quickPick } from './features/commands'
import { fileIcon } from './features/icons'
import { toast } from './features/toast'
import { installKeybindings } from './features/keybindings'
import { enableEmmet } from './features/monaco'
import { initMarkdownPreview, toggleMarkdownPreview } from './features/markdownPreview'
import { importVSCodeSettings } from './features/vscodeImport'
import { initUpdater, checkForUpdatesNow } from './features/updater'
import { initGit } from './features/git'

async function boot(): Promise<void> {
  await store.load()
  initContextMenu()
  initThemes()
  initTitlebar()
  initEditor()
  initExplorer()
  initSearch()
  initSettingsPanel()
  initStatusbar()
  initMarkdownPreview()
  initGit()
  initUpdater()
  await initTerminal()
  if (store.settings.emmet) void enableEmmet()

  registerAllCommands()
  installKeybindings()
  wireChrome()
  wireBusBridges()
  await restoreWorkspace()
  renderRecent()
}

/* ---------------- commands ---------------- */

function registerAllCommands(): void {
  registerCommands([
    { id: 'workspace.openFolder', title: 'Open Folder…', category: 'File', run: () => openFolder() },
    { id: 'file.open', title: 'Open File…', category: 'File', run: openFileDialog },
    { id: 'file.new', title: 'New File', category: 'File', run: () => openUntitled() },
    { id: 'file.save', title: 'Save', category: 'File', run: () => saveActive() },
    { id: 'file.saveAs', title: 'Save As…', category: 'File', run: () => saveActive(true) },
    { id: 'file.saveAll', title: 'Save All', category: 'File', run: () => saveAll() },
    { id: 'file.close', title: 'Close Editor', category: 'File', run: () => { const t = current(); if (t) closeTab(t.id) } },
    { id: 'file.revealInExplorer', title: 'Reveal Active File in Explorer', category: 'File', run: () => { const t = current(); if (t?.path) bus.emit('explorer:reveal', t.path) } },
    { id: 'file.revealInOS', title: 'Reveal in File Explorer', category: 'File', run: () => { const t = current(); if (t?.path) window.xcode.os.revealInFolder(t.path); else if (store.rootPath) window.xcode.os.revealInFolder(store.rootPath) } },
    { id: 'file.openInDefaultApp', title: 'Open in Default App', category: 'File', run: async () => { const t = current(); if (t?.path) { const err = await window.xcode.os.openPath(t.path); if (err) toast(err, 'error') } } },
    { id: 'preferences.importVSCode', title: 'Import VS Code Settings', category: 'Preferences', run: importVSCodeSettings },

    { id: 'workbench.commandPalette', title: 'Show All Commands', category: 'View', run: openCommandPalette },
    { id: 'workbench.quickOpen', title: 'Go to File…', category: 'View', run: openQuickOpen },
    { id: 'view.toggleSidebar', title: 'Toggle Sidebar', category: 'View', run: toggleSidebar },
    { id: 'view.explorer', title: 'Show Explorer', category: 'View', run: () => showView('explorer') },
    { id: 'view.search', title: 'Show Search', category: 'View', run: () => { showView('search'); focusSearch() } },
    { id: 'view.git', title: 'Show Source Control', category: 'View', run: () => showView('git') },
    { id: 'git.commit', title: 'Commit', category: 'Git', run: () => bus.emit('command:run', 'view.git') },
    { id: 'git.push', title: 'Push', category: 'Git', run: () => bus.emit('git:action', 'push') },
    { id: 'git.pull', title: 'Pull', category: 'Git', run: () => bus.emit('git:action', 'pull') },
    { id: 'git.refresh', title: 'Refresh Source Control', category: 'Git', run: () => bus.emit('git:refresh') },
    { id: 'view.settings', title: 'Open Settings', category: 'View', run: () => { showView('settings'); focusSettings() } },
    { id: 'view.zoomIn', title: 'Zoom In', category: 'View', run: () => zoom(1) },
    { id: 'view.zoomOut', title: 'Zoom Out', category: 'View', run: () => zoom(-1) },
    { id: 'view.zoomReset', title: 'Reset Zoom', category: 'View', run: () => zoom(0, true) },

    { id: 'terminal.toggle', title: 'Toggle Terminal', category: 'Terminal', run: () => togglePanel() },
    { id: 'terminal.new', title: 'New Terminal', category: 'Terminal', run: () => bus.emit('terminal:new') },
    { id: 'terminal.runCommand', title: 'Run Command…', category: 'Terminal', run: runCommandPrompt },
    { id: 'terminal.here', title: 'Open Terminal at Selected Folder', category: 'Terminal', run: () => bus.emit('terminal:new-here') },

    { id: 'explorer.newFile', title: 'New File', category: 'Explorer', run: () => createFileFlow() },
    { id: 'explorer.newFolder', title: 'New Folder', category: 'Explorer', run: () => createFolderFlow() },
    { id: 'explorer.refresh', title: 'Refresh Explorer', category: 'Explorer', run: () => refreshExplorer() },
    { id: 'explorer.collapseAll', title: 'Collapse Folders in Explorer', category: 'Explorer', run: () => collapseAll() },

    { id: 'theme.pick', title: 'Color Theme', category: 'Preferences', keybinding: 'Ctrl+K Ctrl+T', run: pickTheme },
    { id: 'editor.selectLanguage', title: 'Change Language Mode', category: 'Editor', run: pickLanguage },
    { id: 'editor.gotoLine', title: 'Go to Line/Column…', category: 'Editor', run: gotoLinePrompt },
    { id: 'editor.formatDocument', title: 'Format Document', category: 'Editor', run: () => bus.emit('editor:action', 'editor.action.formatDocument') },
    { id: 'editor.toggleWordWrap', title: 'Toggle Word Wrap', category: 'View', run: () => store.updateSettings({ wordWrap: store.settings.wordWrap === 'on' ? 'off' : 'on' }) },
    { id: 'editor.toggleMinimap', title: 'Toggle Minimap', category: 'View', run: () => store.updateSettings({ minimap: !store.settings.minimap }) },
    { id: 'editor.toggleIndent', title: 'Toggle Tabs / Spaces', category: 'Editor', run: () => store.updateSettings({ insertSpaces: !store.settings.insertSpaces }) },
    { id: 'markdown.togglePreview', title: 'Toggle Markdown Preview', category: 'View', keybinding: 'Ctrl+Shift+V', run: toggleMarkdownPreview },

    { id: 'help.shortcuts', title: 'Keyboard Shortcuts', category: 'Help', run: showShortcuts },
    { id: 'help.checkUpdates', title: 'Check for Updates', category: 'Help', run: checkForUpdatesNow },
    { id: 'help.about', title: 'About Xcode', category: 'Help', run: showAbout }
  ])
}

function runCommandPrompt(): void {
  openPicker({
    placeholder: 'Type a shell command to run in the terminal',
    live: true,
    items: (q) => {
      const cmd = q.trim()
      return [
        { label: cmd ? `Run: ${cmd}` : 'Enter a command…', run: () => { if (cmd) runInTerminal(cmd) } }
      ]
    }
  })
}

async function openFileDialog(): Promise<void> {
  const files = await window.xcode.dialog.openFile()
  for (const f of files) await openPath(f)
}

async function openQuickOpen(): Promise<void> {
  if (!store.rootPath) {
    toast('Open a folder first', 'warn')
    return
  }
  const files = await walkForQuickOpen()
  const root = store.rootPath
  openPicker({
    placeholder: 'Go to file by name…',
    items: files.map((f) => {
      const rel = f.slice(root.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
      const name = rel.split('/').pop()!
      return {
        label: name,
        description: rel.split('/').slice(0, -1).join('/'),
        iconHtml: fileIcon(name),
        run: () => openPath(f)
      }
    }),
    matchOnDescription: true
  })
}

async function pickTheme(): Promise<void> {
  const prev = store.settings.theme
  const items = allThemes().map((t) => ({ label: t.name, description: t.palette.type, value: t.id }))
  let previewed = prev
  openPicker({
    placeholder: 'Select Color Theme (↑↓ to preview)',
    items,
    onAccept: (it) => applyTheme(it.value)
  })
  // live preview on hover
  const list = document.getElementById('palette-list')!
  const obs = new MutationObserver(() => {
    const active = list.querySelector('.pick-row.active')
    if (!active) return
    const idx = [...list.children].indexOf(active)
    const id = items[idx]?.value
    if (id && id !== previewed) {
      previewed = id
      applyTheme(id)
    }
  })
  obs.observe(list, { childList: true, subtree: true, attributes: true })
  const overlay = document.getElementById('palette-overlay')!
  const stop = new MutationObserver(() => {
    if (overlay.hidden) {
      obs.disconnect()
      stop.disconnect()
      if (store.settings.theme !== previewed) {
        // accepted handler already applied; if cancelled, revert
        setTimeout(() => {
          if (document.documentElement.dataset.theme !== store.settings.theme) applyTheme(store.settings.theme)
        }, 0)
      }
    }
  })
  stop.observe(overlay, { attributes: true, attributeFilter: ['hidden'] })
}

async function pickLanguage(): Promise<void> {
  const langs = listLanguages()
  const picked = await quickPick(
    langs
      .map((l) => ({ label: l.aliases[0] || l.id, description: l.id, value: l.id }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    'Select Language Mode'
  )
  if (picked) setLanguage(picked.value)
}

function gotoLinePrompt(): void {
  openPicker({
    placeholder: 'Type a line number, then Enter',
    live: true,
    items: (q) => {
      const n = parseInt(q.replace(/[^0-9]/g, ''), 10)
      return [{ label: n ? `Go to line ${n}` : 'Enter a line number…', run: () => { if (n) gotoLine(n) } }]
    }
  })
}

function zoom(delta: number, reset = false): void {
  const z = reset ? 0 : Math.max(-6, Math.min(12, store.settings.zoom + delta))
  store.updateSettings({ zoom: z })
}

function showShortcuts(): void {
  const rows: [string, string][] = [
    ['Ctrl+P', 'Go to file'],
    ['Ctrl+Shift+P', 'Command palette'],
    ['Ctrl+S / Ctrl+Shift+S', 'Save / Save As'],
    ['Ctrl+N', 'New file'],
    ['Ctrl+O', 'Open file'],
    ['Ctrl+W', 'Close editor'],
    ['Ctrl+B', 'Toggle sidebar'],
    ['Ctrl+`', 'Toggle terminal'],
    ['Ctrl+Shift+E / F', 'Explorer / Search'],
    ['Ctrl+, ', 'Settings'],
    ['Ctrl+K Ctrl+T', 'Color theme'],
    ['Ctrl+= / Ctrl+- / Ctrl+0', 'Zoom in / out / reset'],
    ['Ctrl+F / Ctrl+H', 'Find / Replace'],
    ['Ctrl+/', 'Toggle comment'],
    ['Alt+↑ / Alt+↓', 'Move line'],
    ['Shift+Alt+F', 'Format document'],
    ['F11', 'Toggle full window']
  ]
  modal(
    'Keyboard Shortcuts',
    `<table class="kbd-table">${rows
      .map(([k, d]) => `<tr><td><kbd>${k.replace(/ \/ /g, '</kbd> / <kbd>')}</kbd></td><td>${d}</td></tr>`)
      .join('')}</table>`
  )
}

async function showAbout(): Promise<void> {
  const info = await window.xcode.app.info()
  modal(
    'About Xcode',
    `<div class="about">
      <div class="about-logo">&lt;/&gt;</div>
      <h2>Xcode</h2>
      <p class="muted">by DataDropX · a focused code editor</p>
      <table>
        <tr><td>Version</td><td>${info.version}</td></tr>
        <tr><td>Electron</td><td>${info.electron}</td></tr>
        <tr><td>Chromium</td><td>${info.chrome}</td></tr>
        <tr><td>Node</td><td>${info.node}</td></tr>
        <tr><td>Platform</td><td>${info.platform}</td></tr>
      </table>
      <p class="muted small">Built with Monaco Editor &amp; xterm.js</p>
    </div>`
  )
}

function modal(title: string, bodyHtml: string): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal wide"><div class="modal-title">${title}</div><div class="modal-body">${bodyHtml}</div><div class="modal-actions"><button class="btn primary" data-x>Close</button></div></div>`
  document.body.appendChild(overlay)
  const close = (): void => overlay.remove()
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target as HTMLElement).hasAttribute('data-x')) close()
  })
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      close()
      document.removeEventListener('keydown', esc)
    }
  })
}

/* ---------------- chrome (activity bar / sidebar / panel tabs / resizers) ---------------- */

let sidebarView = 'explorer'
let sidebarCollapsed = false

function wireChrome(): void {
  document.querySelectorAll<HTMLButtonElement>('.act-btn[data-view]').forEach((b) => {
    b.addEventListener('click', () => {
      const v = b.dataset.view!
      if (v === sidebarView && !sidebarCollapsed) {
        toggleSidebar()
        return
      }
      showView(v)
      if (v === 'search') focusSearch()
      if (v === 'settings') focusSettings()
    })
  })

  // sidebar resizer
  const resizer = document.getElementById('sidebar-resizer')!
  const sidebar = document.getElementById('sidebar')!
  sidebar.style.width = store.settings.sidebarWidth + 'px'
  let sx = 0
  let sw = 0
  const move = (e: MouseEvent): void => {
    const w = Math.min(Math.max(sw + (e.clientX - sx), 160), 560)
    sidebar.style.width = w + 'px'
    getEditor()?.layout()
  }
  const up = (): void => {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
    document.body.classList.remove('resizing')
    store.updateSettings({ sidebarWidth: sidebar.getBoundingClientRect().width })
  }
  resizer.addEventListener('mousedown', (e) => {
    sx = e.clientX
    sw = sidebar.getBoundingClientRect().width
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    document.body.classList.add('resizing')
  })

  // panel tabs
  document.querySelectorAll<HTMLButtonElement>('.panel-tab[data-panel]').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      document.querySelectorAll<HTMLElement>('.panel-view').forEach((v) => {
        v.hidden = v.dataset.panel !== b.dataset.panel
      })
    })
  })

  // welcome buttons
  document.querySelectorAll<HTMLElement>('[data-cmd]').forEach((el) => {
    if (el.closest('#statusbar') || el.closest('.side-actions')) return
    el.addEventListener('click', () => bus.emit('command:run', el.dataset.cmd))
  })
}

function showView(view: string): void {
  sidebarView = view
  sidebarCollapsed = false
  document.getElementById('sidebar')!.hidden = false
  document.getElementById('sidebar-resizer')!.hidden = false
  document.querySelectorAll<HTMLElement>('.side-view').forEach((s) => {
    s.hidden = s.dataset.view !== view
  })
  document.querySelectorAll<HTMLElement>('.act-btn[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view)
  })
  bus.emit('sidebar:view', view)
  getEditor()?.layout()
}

function toggleSidebar(): void {
  sidebarCollapsed = !sidebarCollapsed
  document.getElementById('sidebar')!.hidden = sidebarCollapsed
  document.getElementById('sidebar-resizer')!.hidden = sidebarCollapsed
  document.querySelectorAll<HTMLElement>('.act-btn[data-view]').forEach((b) => {
    b.classList.toggle('active', !sidebarCollapsed && b.dataset.view === sidebarView)
  })
  getEditor()?.layout()
}

/* ---------------- bus bridges ---------------- */

function wireBusBridges(): void {
  bus.on('editor:action', (id: string) => {
    const ed = getEditor()
    if (!ed) return
    if (id === 'undo' || id === 'redo') {
      ed.trigger('menu', id, null)
      return
    }
    ed.focus()
    ed.getAction(id)?.run()
  })
  bus.on('terminal:run', (cmd: string) => runInTerminal(cmd))
  bus.on(Ev.settingsChanged, () => applyZoomVar())
  bus.on(Ev.themeChanged, () => {
    const sb = document.getElementById('sb-theme')
    if (sb) sb.setAttribute('title', 'Color Theme — ' + store.settings.theme)
  })
  bus.on(Ev.workspaceOpened, () => renderRecent())
  applyZoomVar()
}

function applyZoomVar(): void {
  document.documentElement.style.setProperty('--zoom-delta', String(store.settings.zoom))
  const base = 13 + store.settings.zoom
  document.documentElement.style.setProperty('--ui-font-size', Math.max(10, base - 1) + 'px')
}

/* ---------------- restore ---------------- */

async function restoreWorkspace(): Promise<void> {
  const st = store.state
  if (st.lastFolder) {
    try {
      await openFolder(st.lastFolder)
    } catch {
      /* folder gone */
    }
  }
  if (st.openFiles?.length) {
    for (const f of st.openFiles) {
      try {
        await openPath(f)
      } catch {
        /* skip */
      }
    }
    if (st.activeFile) {
      try {
        await openPath(st.activeFile)
      } catch {
        /* skip */
      }
    }
  }
}

function renderRecent(): void {
  const host = document.getElementById('welcome-recent')
  if (!host) return
  const list = store.state.recentFolders || []
  if (!list.length) {
    host.innerHTML = '<span class="muted">No recent folders</span>'
    return
  }
  host.innerHTML = list
    .slice(0, 6)
    .map((r) => `<button class="recent" data-path="${r.path.replace(/"/g, '&quot;')}" title="${r.path.replace(/"/g, '&quot;')}">${r.name}</button>`)
    .join('')
  host.querySelectorAll<HTMLButtonElement>('.recent').forEach((b) => {
    b.addEventListener('click', () => openFolder(b.dataset.path))
  })
}

boot().catch((err) => {
  console.error(err)
  document.body.innerHTML = `<pre style="padding:20px;color:#f38ba8;font-family:monospace">Xcode failed to start:\n\n${String(err?.stack || err)}</pre>`
})
