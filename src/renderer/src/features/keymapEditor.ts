import { allCommands } from './commands'
import {
  getKeymap,
  comboOf,
  comboLabel,
  setBinding,
  resetBinding,
  resetAllBindings,
  bindingConflict,
  KeymapRow
} from './keybindings'
import { toast } from './toast'

let overlay: HTMLElement | null = null

export function openKeymapEditor(): void {
  if (overlay) {
    overlay.remove()
    overlay = null
    return
  }
  overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal keymap-modal">
      <div class="modal-title">
        <span>Keyboard Shortcuts</span>
        <div class="km-tools">
          <input class="km-search" type="text" placeholder="Search command or key…" spellcheck="false" />
          <button class="btn ghost km-reset-all">Reset all</button>
          <button class="btn ghost" data-x>Close</button>
        </div>
      </div>
      <div class="km-hint">Click a shortcut to change it. Chord shortcuts (shown with a space) aren't editable yet.</div>
      <div class="km-list"></div>
    </div>`
  document.body.appendChild(overlay)

  const search = overlay.querySelector<HTMLInputElement>('.km-search')!
  const list = overlay.querySelector<HTMLElement>('.km-list')!
  const close = (): void => {
    overlay?.remove()
    overlay = null
  }
  overlay.querySelector('[data-x]')!.addEventListener('click', close)
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  overlay.querySelector('.km-reset-all')!.addEventListener('click', () => {
    if (window.confirm('Reset every shortcut to its default?')) {
      resetAllBindings()
      render()
      toast('Shortcuts reset to defaults', 'ok')
    }
  })
  document.addEventListener('keydown', function esc(e) {
    if (!overlay) {
      document.removeEventListener('keydown', esc)
      return
    }
    if (e.key === 'Escape' && !(window as any).__xcodeCapturingKeys) close()
  })
  search.addEventListener('input', render)
  search.focus()

  function titleFor(id: string): { title: string; category: string } {
    const c = allCommands().find((x) => x.id === id)
    return { title: c?.title || id, category: c?.category || '' }
  }

  function render(): void {
    const q = search.value.trim().toLowerCase()
    const rows = getKeymap()
      .map((r) => ({ ...r, ...titleFor(r.command) }))
      .filter((r) => {
        if (!q) return true
        return (
          r.title.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.command.toLowerCase().includes(q) ||
          comboLabel(r.combo).toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (a.category + a.title).localeCompare(b.category + b.title))

    list.innerHTML = ''
    for (const r of rows) {
      const row = document.createElement('div')
      row.className = 'km-row'
      row.innerHTML =
        `<span class="km-cmd"><b>${escapeHtml(r.title)}</b>${r.category ? `<span class="km-cat">${escapeHtml(r.category)}</span>` : ''}</span>` +
        `<button class="km-key${r.isChord ? ' chord' : ''}" ${r.isChord ? 'disabled' : ''}>${keyHtml(r.combo)}</button>` +
        `<button class="km-x" title="${r.isDefault ? 'Default' : 'Reset to default'}" ${r.isDefault ? 'disabled' : ''}>&#x21A9;</button>`
      const keyBtn = row.querySelector<HTMLButtonElement>('.km-key')!
      if (!r.isChord) keyBtn.addEventListener('click', () => beginCapture(r, keyBtn))
      const rst = row.querySelector<HTMLButtonElement>('.km-x')!
      if (!r.isDefault) rst.addEventListener('click', () => {
        resetBinding(r.command)
        render()
      })
      list.appendChild(row)
    }
    if (!rows.length) list.innerHTML = '<div class="km-empty">No matching commands.</div>'
  }

  function beginCapture(r: KeymapRow & { title: string }, btn: HTMLButtonElement): void {
    ;(window as any).__xcodeCapturingKeys = true
    btn.classList.add('capturing')
    btn.textContent = 'Press keys…  (Esc to cancel)'

    const finish = (): void => {
      ;(window as any).__xcodeCapturingKeys = false
      window.removeEventListener('keydown', onKey, true)
    }
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        finish()
        render()
        return
      }
      const combo = comboOf(e)
      if (!combo) return // waiting for a non-modifier key
      finish()
      const conflict = bindingConflict(combo, r.command)
      if (conflict) {
        const c = allCommands().find((x) => x.id === conflict)
        if (!window.confirm(`${comboLabel(combo)} is already bound to "${c?.title || conflict}". Reassign it?`)) {
          render()
          return
        }
        resetBinding(conflict)
      }
      setBinding(r.command, combo)
      toast(`${r.title} → ${comboLabel(combo)}`, 'ok', 1600)
      render()
    }
    window.addEventListener('keydown', onKey, true)
  }

  function keyHtml(combo: string): string {
    return combo
      .split(' ')
      .map((seq) => seq.split('+').map((k) => `<kbd>${escapeHtml(comboLabel(k))}</kbd>`).join('+'))
      .join(' <span class="km-then">then</span> ')
  }

  render()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
