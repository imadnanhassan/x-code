import { runCommand, isPickerOpen } from './commands'
import { bus } from '../core/bus'

type Combo = string
const map: Record<Combo, string> = {
  'ctrl+p': 'workbench.quickOpen',
  'ctrl+shift+p': 'workbench.commandPalette',
  'ctrl+shift+e': 'view.explorer',
  'ctrl+shift+f': 'view.search',
  'ctrl+n': 'file.new',
  'ctrl+o': 'file.open',
  'ctrl+s': 'file.save',
  'ctrl+shift+s': 'file.saveAs',
  'ctrl+w': 'file.close',
  'ctrl+b': 'view.toggleSidebar',
  'ctrl+,': 'view.settings',
  'ctrl+`': 'terminal.toggle',
  'ctrl+=': 'view.zoomIn',
  'ctrl++': 'view.zoomIn',
  'ctrl+-': 'view.zoomOut',
  'ctrl+0': 'view.zoomReset',
  'ctrl+g': 'editor.gotoLine'
}

// chord sequences: first key -> { secondKey -> command }
const chords: Record<string, Record<string, string>> = {
  'ctrl+k': {
    'ctrl+t': 'theme.pick',
    'ctrl+o': 'workspace.openFolder',
    's': 'file.saveAll',
    'ctrl+s': 'file.saveAll'
  }
}

let pendingChord: string | null = null
let chordTimer: number | undefined

function comboOf(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  let key = e.key.toLowerCase()
  if (key === ' ') key = 'space'
  parts.push(key)
  return parts.join('+')
}

export function installKeybindings(): void {
  window.addEventListener(
    'keydown',
    (e) => {
      // F11 -> maximize toggle
      if (e.key === 'F11') {
        e.preventDefault()
        window.xcode.window.toggleMaximize()
        return
      }

      const combo = comboOf(e)

      if (pendingChord) {
        const table = chords[pendingChord]
        pendingChord = null
        if (chordTimer) window.clearTimeout(chordTimer)
        if (table && table[combo]) {
          e.preventDefault()
          void runCommand(table[combo])
          return
        }
      }

      if (chords[combo] && !isPickerOpen()) {
        e.preventDefault()
        pendingChord = combo
        chordTimer = window.setTimeout(() => (pendingChord = null), 1400)
        return
      }

      if (isPickerOpen()) return

      const cmd = map[combo]
      if (cmd) {
        e.preventDefault()
        void runCommand(cmd)
      }
    },
    true
  )

  // let the app react when Monaco requests actions via context menu bridge
  bus.on('editor:relayout', () => {})
}
