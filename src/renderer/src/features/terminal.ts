import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { bus, Ev } from '../core/bus'
import { store } from '../core/store'
import { getTheme } from './themes'
import { toast } from './toast'
import { currentSelection } from './explorer'

interface Session {
  id: number
  term: Terminal
  fit: FitAddon
  el: HTMLElement
  title: string
  disposers: (() => void)[]
}

const sessions = new Map<number, Session>()
let activeId: number | null = null
let ptyOk = false
let ptyErr = ''
let mounted = false

const $panel = () => document.getElementById('panel')!
const $host = () => document.getElementById('terminal-host')!
const $select = () => document.getElementById('term-select') as HTMLSelectElement
const $resizer = () => document.getElementById('panel-resizer')!

function xtermTheme() {
  const p = getTheme(store.settings.theme).palette
  return {
    background: p.bg,
    foreground: p.fg,
    cursor: p.accent,
    cursorAccent: p.bg,
    selectionBackground: p.selection,
    black: p.type === 'dark' ? '#000000' : '#2e3440',
    red: p.error,
    green: p.ok,
    yellow: p.warn,
    blue: p.info,
    magenta: p.keyword,
    cyan: p.operator,
    white: p.fgMuted,
    brightBlack: p.fgFaint,
    brightRed: p.error,
    brightGreen: p.ok,
    brightYellow: p.warn,
    brightBlue: p.info,
    brightMagenta: p.keyword,
    brightCyan: p.operator,
    brightWhite: p.fg
  }
}

export async function initTerminal(): Promise<void> {
  const info = await window.xcode.pty.available()
  ptyOk = info.ok
  ptyErr = info.error

  window.xcode.pty.onData(({ id, data }) => sessions.get(id)?.term.write(data))
  window.xcode.pty.onExit(({ id }) => {
    const s = sessions.get(id)
    if (!s) return
    s.term.write('\r\n\x1b[38;5;242m[process exited]\x1b[0m\r\n')
  })

  document.getElementById('term-new')!.addEventListener('click', () => void createSession())
  document.getElementById('term-kill')!.addEventListener('click', () => killActive())
  document.getElementById('panel-close')!.addEventListener('click', () => togglePanel(false))
  $select().addEventListener('change', () => selectSession(Number($select().value)))

  bus.on('terminal:new', () => void createSession())
  bus.on('terminal:new-here', async () => {
    const sel = currentSelection()
    let dir = store.rootPath || undefined
    if (sel) {
      try {
        const st = await window.xcode.fs.stat(sel)
        dir = st.isDirectory ? sel : sel.replace(/[\\/][^\\/]*$/, '')
      } catch {
        /* use root */
      }
    }
    void createSession(dir)
  })

  bus.on(Ev.themeChanged, () => {
    const t = xtermTheme()
    sessions.forEach((s) => (s.term.options.theme = t))
  })
  bus.on(Ev.settingsChanged, () => {
    sessions.forEach((s) => {
      s.term.options.fontSize = store.settings.fontSize + store.settings.zoom
      s.term.options.fontFamily = store.settings.fontFamily
      fit(s)
    })
  })

  new ResizeObserver(() => {
    const s = activeId != null ? sessions.get(activeId) : null
    if (s) fit(s)
  }).observe($host())

  setupResizer()
}

export function togglePanel(force?: boolean): void {
  const panel = $panel()
  const show = force ?? panel.hidden
  panel.hidden = !show
  $resizer().hidden = !show
  if (show) {
    panel.style.height = store.settings.panelHeight + 'px'
    if (!sessions.size) void createSession()
    else {
      const s = activeId != null ? sessions.get(activeId) : null
      if (s) {
        fit(s)
        s.term.focus()
      }
    }
  }
  bus.emit(Ev.layoutChanged)
  document.getElementById('editor-host') && setTimeout(() => bus.emit('editor:relayout'), 0)
}

export function panelVisible(): boolean {
  return !$panel().hidden
}

async function createSession(cwd?: string): Promise<void> {
  mounted = true
  togglePanelEnsure()
  if (!ptyOk) {
    showUnavailable()
    return
  }
  const el = document.createElement('div')
  el.className = 'term-instance'
  $host().appendChild(el)

  const term = new Terminal({
    fontFamily: store.settings.fontFamily,
    fontSize: store.settings.fontSize + store.settings.zoom,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    theme: xtermTheme(),
    allowProposedApi: true
  })
  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())
  term.open(el)
  fitAddon.fit()

  const res = await window.xcode.pty.spawn({
    cwd: cwd || store.rootPath || undefined,
    cols: term.cols,
    rows: term.rows
  })
  if (res.id < 0) {
    toast('Terminal unavailable: ' + (res.error || 'shell could not start'), 'error')
    el.remove()
    return
  }

  const session: Session = {
    id: res.id,
    term,
    fit: fitAddon,
    el,
    title: res.shell ? `${res.shell} ${sessions.size + 1}` : `Terminal ${sessions.size + 1}`,
    disposers: []
  }
  sessions.set(res.id, session)

  const d1 = term.onData((d) => window.xcode.pty.input(res.id, d))
  const d2 = term.onResize(({ cols, rows }) => window.xcode.pty.resize(res.id, cols, rows))
  session.disposers.push(() => d1.dispose(), () => d2.dispose())

  refreshSelect()
  selectSession(res.id)
  term.focus()
}

function togglePanelEnsure(): void {
  if ($panel().hidden) togglePanel(true)
}

function showUnavailable(): void {
  $host().innerHTML = `<div class="term-unavailable">
    <p><b>Integrated terminal unavailable</b></p>
    <p>The <code>node-pty</code> native module isn't built for this Electron version.</p>
    <p>Run <code>npm run rebuild</code> in the project folder, then restart Xcode.</p>
    ${ptyErr ? `<pre>${escapeHtml(ptyErr)}</pre>` : ''}
  </div>`
}

function selectSession(id: number): void {
  activeId = id
  sessions.forEach((s) => (s.el.style.display = s.id === id ? 'block' : 'none'))
  const s = sessions.get(id)
  if (s) {
    $select().value = String(id)
    fit(s)
    s.term.focus()
  }
}

function killActive(): void {
  if (activeId == null) return
  const s = sessions.get(activeId)
  if (!s) return
  window.xcode.pty.kill(s.id)
  s.disposers.forEach((d) => d())
  s.term.dispose()
  s.el.remove()
  sessions.delete(s.id)
  refreshSelect()
  const next = sessions.keys().next()
  if (!next.done) selectSession(next.value)
  else {
    activeId = null
    togglePanel(false)
  }
}

function refreshSelect(): void {
  const sel = $select()
  sel.innerHTML = ''
  let i = 1
  sessions.forEach((s) => {
    const opt = document.createElement('option')
    opt.value = String(s.id)
    opt.textContent = `${i++}: ${s.title}`
    sel.appendChild(opt)
  })
  sel.style.display = sessions.size > 1 ? 'inline-block' : 'none'
}

function fit(s: Session): void {
  try {
    s.fit.fit()
  } catch {
    /* ignore */
  }
}

export function runInTerminal(cmd: string): void {
  togglePanel(true)
  const send = (): void => {
    if (activeId != null) window.xcode.pty.input(activeId, cmd + '\r')
  }
  if (activeId == null) {
    void createSession().then(() => setTimeout(send, 400))
  } else {
    send()
  }
}

function setupResizer(): void {
  const r = $resizer()
  const panel = $panel()
  let startY = 0
  let startH = 0
  const onMove = (e: MouseEvent): void => {
    const dy = startY - e.clientY
    const h = Math.min(Math.max(startH + dy, 100), window.innerHeight - 220)
    panel.style.height = h + 'px'
    const s = activeId != null ? sessions.get(activeId) : null
    if (s) fit(s)
  }
  const onUp = (): void => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.classList.remove('resizing')
    store.updateSettings({ panelHeight: panel.getBoundingClientRect().height })
  }
  r.addEventListener('mousedown', (e) => {
    startY = e.clientY
    startH = panel.getBoundingClientRect().height
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.classList.add('resizing')
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
