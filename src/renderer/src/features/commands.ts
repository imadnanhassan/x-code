import { bus } from '../core/bus'

export interface Command {
  id: string
  title: string
  category?: string
  keybinding?: string
  run: () => void | Promise<void>
}

const registry = new Map<string, Command>()

export function registerCommand(cmd: Command): void {
  registry.set(cmd.id, cmd)
}
export function registerCommands(cmds: Command[]): void {
  cmds.forEach(registerCommand)
}
export function allCommands(): Command[] {
  return [...registry.values()]
}
export async function runCommand(id: string): Promise<void> {
  const c = registry.get(id)
  if (!c) {
    console.warn('[commands] unknown command', id)
    return
  }
  await c.run()
}

bus.on('command:run', (id: string) => void runCommand(id))

/* ---------------- fuzzy ---------------- */

export interface FuzzyResult {
  score: number
  positions: number[]
}

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  if (!query) return { score: 0, positions: [] }
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  let score = 0
  let run = 0
  const positions: number[] = []
  let lastIdx = -1
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      positions.push(ti)
      run++
      score += run * 3
      if (ti === lastIdx + 1) score += 6
      if (ti === 0 || /[\s/\\._-]/.test(t[ti - 1])) score += 10
      lastIdx = ti
      qi++
    } else {
      run = 0
    }
  }
  if (qi < q.length) return null
  score -= (t.length - q.length) * 0.2
  score -= positions[0] * 0.5
  return { score, positions }
}

/* ---------------- quick pick ---------------- */

export interface PickItem {
  label: string
  description?: string
  detail?: string
  hint?: string
  value?: any
  iconHtml?: string
  keepOpen?: boolean
  run?: () => void | Promise<void>
}

interface PickOptions {
  placeholder?: string
  prefill?: string
  items: PickItem[] | ((query: string) => PickItem[] | Promise<PickItem[]>)
  onAccept?: (item: PickItem) => void
  live?: boolean
  matchOnDescription?: boolean
}

let active = false
let disposeKeys: (() => void) | null = null

const $overlay = () => document.getElementById('palette-overlay')!
const $input = () => document.getElementById('palette-input') as HTMLInputElement
const $list = () => document.getElementById('palette-list')!

export function isPickerOpen(): boolean {
  return active
}

export function closePicker(): void {
  if (!active) return
  active = false
  $overlay().hidden = true
  $list().innerHTML = ''
  disposeKeys?.()
  disposeKeys = null
}

export function openPicker(opts: PickOptions): void {
  if (active) closePicker()
  active = true
  const overlay = $overlay()
  const input = $input()
  const list = $list()
  overlay.hidden = false
  input.value = opts.prefill ?? ''
  input.placeholder = opts.placeholder ?? ''
  input.focus()
  input.select()

  let current: { item: PickItem; el: HTMLElement }[] = []
  let selIndex = 0
  let token = 0

  const staticItems = Array.isArray(opts.items) ? opts.items : null

  async function refresh(): Promise<void> {
    const my = ++token
    const query = input.value.trim()
    let items: PickItem[]
    if (staticItems) {
      items = staticItems
    } else {
      items = await (opts.items as (q: string) => PickItem[] | Promise<PickItem[]>)(query)
      if (my !== token) return
    }

    let ranked: { item: PickItem; score: number; positions: number[] }[]
    if (!query || opts.live) {
      ranked = items.map((item) => ({ item, score: 0, positions: [] }))
    } else {
      ranked = []
      for (const item of items) {
        const hay = opts.matchOnDescription ? `${item.label} ${item.description ?? ''}` : item.label
        const m = fuzzyMatch(query, hay)
        if (m) ranked.push({ item, score: m.score, positions: m.positions })
      }
      ranked.sort((a, b) => b.score - a.score)
    }
    ranked = ranked.slice(0, 500)

    list.innerHTML = ''
    current = []
    ranked.forEach((r, i) => {
      const el = document.createElement('div')
      el.className = 'pick-row' + (i === 0 ? ' active' : '')
      el.innerHTML =
        (r.item.iconHtml ? `<span class="pick-icon">${r.item.iconHtml}</span>` : '') +
        `<span class="pick-label">${highlight(r.item.label, query, opts.matchOnDescription ? [] : r.positions)}</span>` +
        (r.item.description ? `<span class="pick-desc">${escapeHtml(r.item.description)}</span>` : '') +
        (r.item.hint ? `<span class="pick-hint">${escapeHtml(r.item.hint)}</span>` : '')
      el.addEventListener('mouseenter', () => setSel(i))
      el.addEventListener('click', () => accept(i))
      list.appendChild(el)
      current.push({ item: r.item, el })
    })
    selIndex = 0
    updateActive()
  }

  function setSel(i: number): void {
    selIndex = i
    updateActive()
  }
  function updateActive(): void {
    current.forEach((c, i) => c.el.classList.toggle('active', i === selIndex))
    current[selIndex]?.el.scrollIntoView({ block: 'nearest' })
  }
  async function accept(i: number): Promise<void> {
    const picked = current[i]?.item
    if (!picked) return
    if (!picked.keepOpen) closePicker()
    if (opts.onAccept) opts.onAccept(picked)
    else await picked.run?.()
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selIndex = Math.min(selIndex + 1, current.length - 1)
      updateActive()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selIndex = Math.max(selIndex - 1, 0)
      updateActive()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void accept(selIndex)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closePicker()
    } else if (e.key === 'Tab') {
      e.preventDefault()
    }
  }
  const onInput = (): void => void refresh()
  const onOverlayClick = (e: MouseEvent): void => {
    if (e.target === overlay) closePicker()
  }

  input.addEventListener('keydown', onKey)
  input.addEventListener('input', onInput)
  overlay.addEventListener('mousedown', onOverlayClick)
  disposeKeys = () => {
    input.removeEventListener('keydown', onKey)
    input.removeEventListener('input', onInput)
    overlay.removeEventListener('mousedown', onOverlayClick)
  }

  void refresh()
}

export function quickPick(items: PickItem[], placeholder = ''): Promise<PickItem | null> {
  return new Promise((resolve) => {
    let resolved = false
    openPicker({
      items,
      placeholder,
      matchOnDescription: true,
      onAccept: (item) => {
        resolved = true
        resolve(item)
      }
    })
    const ov = $overlay()
    const obs = new MutationObserver(() => {
      if (ov.hidden) {
        obs.disconnect()
        if (!resolved) resolve(null)
      }
    })
    obs.observe(ov, { attributes: true, attributeFilter: ['hidden'] })
  })
}

export function openCommandPalette(): void {
  const cmds = allCommands()
    .slice()
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.title.localeCompare(b.title))
  openPicker({
    placeholder: 'Type a command name…',
    items: cmds.map((c) => ({
      label: c.category ? `${c.category}: ${c.title}` : c.title,
      hint: c.keybinding,
      run: () => runCommand(c.id)
    }))
  })
}

function highlight(text: string, _query: string, positions: number[]): string {
  if (!positions.length) return escapeHtml(text)
  const set = new Set(positions)
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = escapeHtml(text[i])
    out += set.has(i) ? `<b>${ch}</b>` : ch
  }
  return out
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
