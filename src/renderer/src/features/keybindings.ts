import { runCommand, isPickerOpen } from './commands'
import { bus, Ev } from '../core/bus'
import { store } from '../core/store'

/** command id -> default single-combo binding. User overrides live in settings. */
export const DEFAULT_KEYMAP: Record<string, string> = {
  'workbench.quickOpen': 'ctrl+p',
  'workbench.commandPalette': 'ctrl+shift+p',
  'view.explorer': 'ctrl+shift+e',
  'view.search': 'ctrl+shift+f',
  'view.git': 'ctrl+shift+g',
  'markdown.togglePreview': 'ctrl+shift+v',
  'problems.show': 'ctrl+shift+m',
  'tasks.run': 'ctrl+shift+b',
  'todos.show': 'ctrl+shift+t',
  'editor.organizeImports': 'shift+alt+o',
  'editor.formatDocument': 'shift+alt+f',
  'preview.toggle': 'ctrl+shift+u',
  'git.openChanges': 'ctrl+shift+d',
  'file.new': 'ctrl+n',
  'file.open': 'ctrl+o',
  'file.save': 'ctrl+s',
  'file.saveAs': 'ctrl+shift+s',
  'file.close': 'ctrl+w',
  'view.toggleSidebar': 'ctrl+b',
  'view.settings': 'ctrl+,',
  'terminal.toggle': 'ctrl+`',
  'terminal.toggle2': 'ctrl+j',
  'view.zoomIn': 'ctrl+=',
  'view.zoomOut': 'ctrl+-',
  'view.zoomReset': 'ctrl+0',
  'editor.gotoLine': 'ctrl+g'
}

// alias so a second default combo can point at the same command
const ALIAS: Record<string, string> = { 'terminal.toggle2': 'terminal.toggle' }

// chord sequences (first combo -> second combo -> command). Not remappable yet.
export const CHORDS: Record<string, Record<string, string>> = {
  'ctrl+k': {
    'ctrl+t': 'theme.pick',
    'ctrl+o': 'workspace.openFolder',
    'ctrl+s': 'keybindings.open',
    's': 'file.saveAll'
  }
}

let activeMap: Record<string, string> = {}
let pendingChord: string | null = null
let chordTimer: number | undefined

function rebuild(): void {
  activeMap = {}
  const overrides = store.settings.keybindings || {}
  for (const cmd of Object.keys(DEFAULT_KEYMAP)) {
    const target = ALIAS[cmd] || cmd
    const combo = overrides[target] ?? DEFAULT_KEYMAP[cmd]
    if (combo) activeMap[combo] = target
  }
  // overrides for commands without a default entry
  for (const [cmd, combo] of Object.entries(overrides)) {
    if (combo && !DEFAULT_KEYMAP[cmd]) activeMap[combo] = cmd
  }
}

export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  let key = e.key.toLowerCase()
  if (key === ' ') key = 'space'
  if (['control', 'shift', 'alt', 'meta', 'os'].includes(key)) return '' // lone modifier
  parts.push(key)
  return parts.join('+')
}

export function comboLabel(combo: string): string {
  return combo
    .split('+')
    .map((p) => {
      if (p === 'ctrl') return 'Ctrl'
      if (p === 'shift') return 'Shift'
      if (p === 'alt') return 'Alt'
      if (p === 'space') return 'Space'
      if (p === 'escape') return 'Esc'
      if (p === 'arrowup') return '↑'
      if (p === 'arrowdown') return '↓'
      if (p === 'arrowleft') return '←'
      if (p === 'arrowright') return '→'
      if (p.length === 1) return p.toUpperCase()
      return p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join('+')
}

export interface KeymapRow {
  command: string
  combo: string
  isDefault: boolean
  isChord: boolean
}

export function getKeymap(): KeymapRow[] {
  const overrides = store.settings.keybindings || {}
  const rows: KeymapRow[] = []
  const seen = new Set<string>()

  for (const [cmd, def] of Object.entries(DEFAULT_KEYMAP)) {
    const target = ALIAS[cmd] || cmd
    if (seen.has(target)) continue
    seen.add(target)
    const combo = overrides[target] ?? def
    rows.push({ command: target, combo, isDefault: !(target in overrides), isChord: false })
  }
  for (const [first, table] of Object.entries(CHORDS)) {
    for (const [second, cmd] of Object.entries(table)) {
      if (seen.has(cmd)) continue
      seen.add(cmd)
      rows.push({ command: cmd, combo: `${first} ${second}`, isDefault: true, isChord: true })
    }
  }
  for (const [cmd, combo] of Object.entries(overrides)) {
    if (!seen.has(cmd) && combo) {
      seen.add(cmd)
      rows.push({ command: cmd, combo, isDefault: false, isChord: false })
    }
  }
  return rows
}

export function bindingConflict(combo: string, exceptCommand: string): string | null {
  rebuild()
  const holder = activeMap[combo]
  return holder && holder !== exceptCommand ? holder : null
}

export function setBinding(command: string, combo: string): void {
  const next = { ...(store.settings.keybindings || {}) }
  next[command] = combo
  store.updateSettings({ keybindings: next })
  rebuild()
}

export function resetBinding(command: string): void {
  const next = { ...(store.settings.keybindings || {}) }
  delete next[command]
  store.updateSettings({ keybindings: next })
  rebuild()
}

export function resetAllBindings(): void {
  store.updateSettings({ keybindings: {} })
  rebuild()
}

export function installKeybindings(): void {
  rebuild()
  bus.on(Ev.settingsChanged, rebuild)

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'F11') {
        e.preventDefault()
        window.xcode.window.toggleMaximize()
        return
      }
      if ((window as any).__xcodeCapturingKeys) return // keymap editor is recording

      const combo = comboOf(e)
      if (!combo) return

      if (pendingChord) {
        const table = CHORDS[pendingChord]
        pendingChord = null
        if (chordTimer) window.clearTimeout(chordTimer)
        if (table && table[combo]) {
          e.preventDefault()
          void runCommand(table[combo])
          return
        }
      }

      if (CHORDS[combo] && !isPickerOpen()) {
        e.preventDefault()
        pendingChord = combo
        chordTimer = window.setTimeout(() => (pendingChord = null), 1400)
        return
      }

      if (isPickerOpen()) return

      const cmd = activeMap[combo]
      if (cmd) {
        e.preventDefault()
        void runCommand(cmd)
      }
    },
    true
  )
}
