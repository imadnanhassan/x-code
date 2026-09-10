import { bus } from '../core/bus'

export interface MenuItem {
  label?: string
  hint?: string
  sep?: boolean
  disabled?: boolean
  checked?: boolean
  run?: () => void | Promise<void>
  submenu?: MenuItem[]
}

const $menu = () => document.getElementById('context-menu')!
let openEl: HTMLElement | null = null

export function initContextMenu(): void {
  bus.on('ui:contextmenu', (p: { x: number; y: number; items: MenuItem[] }) => {
    show(p.x, p.y, p.items)
  })
  document.addEventListener('mousedown', (e) => {
    if (openEl && !openEl.contains(e.target as Node)) close()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
  })
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)
}

export function close(): void {
  $menu().hidden = true
  $menu().innerHTML = ''
  openEl = null
}

export function show(x: number, y: number, items: MenuItem[]): void {
  const menu = $menu()
  menu.innerHTML = ''
  menu.appendChild(buildList(items))
  menu.hidden = false
  openEl = menu

  const rect = menu.getBoundingClientRect()
  const px = Math.min(x, window.innerWidth - rect.width - 8)
  const py = Math.min(y, window.innerHeight - rect.height - 8)
  menu.style.left = Math.max(4, px) + 'px'
  menu.style.top = Math.max(4, py) + 'px'
}

function buildList(items: MenuItem[]): HTMLElement {
  const ul = document.createElement('div')
  ul.className = 'ctx-list'
  for (const item of items) {
    if (item.sep) {
      const s = document.createElement('div')
      s.className = 'ctx-sep'
      ul.appendChild(s)
      continue
    }
    const row = document.createElement('div')
    row.className = 'ctx-item' + (item.disabled ? ' disabled' : '') + (item.submenu ? ' has-sub' : '')
    row.innerHTML =
      `<span class="ctx-check">${item.checked ? '&#xE73E;' : ''}</span>` +
      `<span class="ctx-label">${escapeHtml(item.label || '')}</span>` +
      `<span class="ctx-hint">${item.submenu ? '&#xE76C;' : escapeHtml(item.hint || '')}</span>`
    if (!item.disabled) {
      if (item.submenu) {
        let subEl: HTMLElement | null = null
        row.addEventListener('mouseenter', () => {
          ul.querySelectorAll('.ctx-sub').forEach((e) => e.remove())
          subEl = buildList(item.submenu!)
          subEl.classList.add('ctx-sub')
          row.appendChild(subEl)
          const r = subEl.getBoundingClientRect()
          if (r.right > window.innerWidth) subEl.style.left = 'auto', (subEl.style.right = '100%')
        })
        row.addEventListener('mouseleave', () => subEl?.remove())
      } else {
        row.addEventListener('click', async (e) => {
          e.stopPropagation()
          close()
          await item.run?.()
        })
      }
    }
    ul.appendChild(row)
  }
  return ul
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
