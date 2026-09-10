import { bus, Ev } from '../core/bus'
import { runCommand } from './commands'
import { show as showMenu, MenuItem } from './contextmenu'
import { store } from '../core/store'

interface TopMenu {
  label: string
  items: () => MenuItem[]
}

const cmd = (id: string): (() => void) => () => void runCommand(id)

const MENUS: TopMenu[] = [
  {
    label: 'File',
    items: () => [
      { label: 'New File', hint: 'Ctrl+N', run: cmd('file.new') },
      { label: 'Open File…', hint: 'Ctrl+O', run: cmd('file.open') },
      { label: 'Open Folder…', hint: 'Ctrl+K Ctrl+O', run: cmd('workspace.openFolder') },
      { sep: true },
      { label: 'Save', hint: 'Ctrl+S', run: cmd('file.save') },
      { label: 'Save As…', hint: 'Ctrl+Shift+S', run: cmd('file.saveAs') },
      { label: 'Save All', hint: 'Ctrl+K S', run: cmd('file.saveAll') },
      { sep: true },
      { label: 'Reveal in File Explorer', run: cmd('file.revealInOS') },
      { label: 'Open in Default App', run: cmd('file.openInDefaultApp') },
      { label: 'Import VS Code Settings…', run: cmd('preferences.importVSCode') },
      { sep: true },
      { label: 'Close Editor', hint: 'Ctrl+W', run: cmd('file.close') },
      { label: 'Exit', run: () => window.xcode.window.close() }
    ]
  },
  {
    label: 'Edit',
    items: () => [
      { label: 'Undo', hint: 'Ctrl+Z', run: editAction('undo') },
      { label: 'Redo', hint: 'Ctrl+Y', run: editAction('redo') },
      { sep: true },
      { label: 'Cut', hint: 'Ctrl+X', run: editAction('editor.action.clipboardCutAction') },
      { label: 'Copy', hint: 'Ctrl+C', run: editAction('editor.action.clipboardCopyAction') },
      { label: 'Paste', hint: 'Ctrl+V', run: editAction('editor.action.clipboardPasteAction') },
      { sep: true },
      { label: 'Find', hint: 'Ctrl+F', run: editAction('actions.find') },
      { label: 'Replace', hint: 'Ctrl+H', run: editAction('editor.action.startFindReplaceAction') },
      { label: 'Find in Files', hint: 'Ctrl+Shift+F', run: cmd('view.search') },
      { sep: true },
      { label: 'Toggle Line Comment', hint: 'Ctrl+/', run: editAction('editor.action.commentLine') },
      { label: 'Format Document', hint: 'Shift+Alt+F', run: editAction('editor.action.formatDocument') }
    ]
  },
  {
    label: 'View',
    items: () => [
      { label: 'Command Palette…', hint: 'Ctrl+Shift+P', run: cmd('workbench.commandPalette') },
      { label: 'Go to File…', hint: 'Ctrl+P', run: cmd('workbench.quickOpen') },
      { sep: true },
      { label: 'Toggle Sidebar', hint: 'Ctrl+B', run: cmd('view.toggleSidebar') },
      { label: 'Toggle Terminal', hint: 'Ctrl+`', run: cmd('terminal.toggle') },
      { label: 'Explorer', hint: 'Ctrl+Shift+E', run: cmd('view.explorer') },
      { label: 'Search', hint: 'Ctrl+Shift+F', run: cmd('view.search') },
      { sep: true },
      { label: 'Markdown Preview', hint: 'Ctrl+Shift+V', run: cmd('markdown.togglePreview') },
      { label: 'Problems', hint: 'Ctrl+Shift+M', run: cmd('problems.show') },
      { label: 'Local History (active file)', run: cmd('localHistory.show') },
      { sep: true },
      { label: 'Color Theme…', hint: 'Ctrl+K Ctrl+T', run: cmd('theme.pick') },
      { label: 'Settings', hint: 'Ctrl+,', run: cmd('view.settings') },
      { label: 'Keyboard Shortcuts', hint: 'Ctrl+K Ctrl+S', run: cmd('keybindings.open') },
      { sep: true },
      { label: 'Zoom In', hint: 'Ctrl+=', run: cmd('view.zoomIn') },
      { label: 'Zoom Out', hint: 'Ctrl+-', run: cmd('view.zoomOut') },
      { label: 'Reset Zoom', hint: 'Ctrl+0', run: cmd('view.zoomReset') }
    ]
  },
  {
    label: 'Terminal',
    items: () => [
      { label: 'New Terminal', hint: 'Ctrl+`', run: cmd('terminal.new') },
      { label: 'Toggle Terminal', run: cmd('terminal.toggle') },
      { label: 'Open Terminal at Selected Folder', run: cmd('terminal.here') },
      { label: 'Run Command…', run: cmd('terminal.runCommand') },
      { sep: true },
      { label: 'Run Task…', hint: 'Ctrl+Shift+B', run: cmd('tasks.run') },
      { label: 'Rerun Last Task', run: cmd('tasks.rerun') },
      { label: 'Configure Tasks…', run: cmd('tasks.configure') }
    ]
  },
  {
    label: 'Help',
    items: () => [
      { label: 'Keyboard Shortcuts', run: cmd('help.shortcuts') },
      { label: 'Check for Updates', run: cmd('help.checkUpdates') },
      { label: 'About Xcode', run: cmd('help.about') }
    ]
  }
]

function editAction(id: string): () => void {
  return () => bus.emit('editor:action', id)
}

export function initTitlebar(): void {
  const menuHost = document.getElementById('tb-menu')!
  MENUS.forEach((m, idx) => {
    const btn = document.createElement('button')
    btn.className = 'tb-menu-item'
    btn.textContent = m.label
    btn.addEventListener('click', () => {
      const r = btn.getBoundingClientRect()
      showMenu(r.left, r.bottom, m.items())
    })
    btn.addEventListener('mouseenter', () => {
      if (menuHost.querySelector('.tb-menu-item.armed') && !btn.classList.contains('armed')) {
        menuHost.querySelectorAll('.armed').forEach((e) => e.classList.remove('armed'))
        btn.classList.add('armed')
        const r = btn.getBoundingClientRect()
        showMenu(r.left, r.bottom, m.items())
      }
    })
    btn.addEventListener('mousedown', () => btn.classList.add('armed'))
    menuHost.appendChild(btn)
    void idx
  })

  document.getElementById('win-min')!.addEventListener('click', () => window.xcode.window.minimize())
  document.getElementById('win-max')!.addEventListener('click', () => window.xcode.window.toggleMaximize())
  document.getElementById('win-close')!.addEventListener('click', () => window.xcode.window.close())

  window.xcode.window.onMaximized((max) => {
    document.body.classList.toggle('maximized', max)
    const b = document.getElementById('win-max')!
    b.innerHTML = max ? '&#xE923;' : '&#xE922;'
    b.title = max ? 'Restore' : 'Maximize'
  })

  bus.on(Ev.fileActivated, () => updateTitle())
  bus.on(Ev.fileSaved, () => updateTitle())
  bus.on(Ev.fileDirty, () => updateTitle())
  bus.on(Ev.workspaceOpened, () => updateTitle())
}

function updateTitle(): void {
  const el = document.getElementById('tb-title')!
  const folder = store.rootPath ? store.rootPath.split(/[\\/]/).filter(Boolean).pop() : null
  const parts = ['Xcode']
  if (folder) parts.unshift(folder)
  el.textContent = parts.join('  —  ')
  window.xcode.window.setTitle(el.textContent)
}
