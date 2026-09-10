import { bus, Ev } from '../core/bus'
import { store } from '../core/store'
import { current } from './editor'

export function initStatusbar(): void {
  const pos = document.getElementById('sb-position')!
  const indent = document.getElementById('sb-indent')!
  const lang = document.getElementById('sb-lang')!
  const eol = document.getElementById('sb-eol')!

  document.querySelectorAll<HTMLElement>('#statusbar [data-cmd]').forEach((el) => {
    el.addEventListener('click', () => bus.emit('command:run', el.dataset.cmd))
  })

  bus.on(Ev.cursorMoved, (c: { line: number; column: number; selection: number; language: string; eol: string }) => {
    pos.textContent =
      `Ln ${c.line}, Col ${c.column}` + (c.selection ? ` (${c.selection} selected)` : '')
    lang.textContent = pretty(c.language)
    eol.textContent = c.eol
  })

  const refreshIndent = (): void => {
    const t = current()
    const model = t?.model
    if (model) {
      const o = model.getOptions()
      indent.textContent = o.insertSpaces ? `Spaces: ${o.tabSize}` : `Tab Size: ${o.tabSize}`
    } else {
      indent.textContent = store.settings.insertSpaces
        ? `Spaces: ${store.settings.tabSize}`
        : `Tab Size: ${store.settings.tabSize}`
    }
  }
  bus.on(Ev.cursorMoved, refreshIndent)
  bus.on(Ev.fileActivated, refreshIndent)
  bus.on(Ev.settingsChanged, refreshIndent)

  bus.on(Ev.fileActivated, (path: string | null) => {
    if (!path) {
      pos.textContent = 'Ln 1, Col 1'
      lang.textContent = 'Plain Text'
    }
  })

  initMemoryIndicator()
}

function initMemoryIndicator(): void {
  const mem = document.getElementById('sb-mem')!
  let timer: number | undefined

  const tick = async (): Promise<void> => {
    try {
      const { totalMB, processes } = await window.xcode.app.memory()
      mem.textContent = `${totalMB} MB`
      mem.title = `Memory used by Xcode (${processes} process${processes === 1 ? '' : 'es'})`
    } catch {
      /* ignore */
    }
  }

  const apply = (): void => {
    const on = store.settings.showMemoryUsage
    mem.hidden = !on
    if (on && !timer) {
      void tick()
      timer = window.setInterval(tick, 4000)
    } else if (!on && timer) {
      window.clearInterval(timer)
      timer = undefined
    }
  }
  bus.on(Ev.settingsChanged, apply)
  apply()
}

function pretty(id: string): string {
  const map: Record<string, string> = {
    plaintext: 'Plain Text',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    json: 'JSON',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    markdown: 'Markdown',
    python: 'Python',
    cpp: 'C++',
    csharp: 'C#',
    shell: 'Shell Script',
    yaml: 'YAML',
    ini: 'INI'
  }
  return map[id] || id.charAt(0).toUpperCase() + id.slice(1)
}
