import { monaco } from './monaco'
import { bus } from '../core/bus'
import { openPath, getEditor } from './editor'
import { fileIcon } from './icons'

interface Row {
  uri: monaco.Uri
  fsPath: string
  marker: monaco.editor.IMarker
}

const $view = () => document.querySelector('.panel-view[data-panel="problems"]') as HTMLElement
const $tab = () => document.querySelector('.panel-tab[data-panel="problems"]') as HTMLElement
const $sb = () => document.getElementById('sb-problems') as HTMLElement

const MAX_ROWS = 500
let refreshTimer: number | undefined
let refreshing = false

function refresh(): void {
  // coalesce the storm of onDidChangeMarkers events the TS worker emits
  if (refreshTimer) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(doRefresh, 180)
}

export function initProblems(): void {
  monaco.editor.onDidChangeMarkers(() => refresh())
  bus.on('file:opened', () => refresh())
  bus.on('file:closed', () => refresh())

  $sb().style.cursor = 'pointer'
  $sb().addEventListener('click', () => {
    bus.emit('panel:show', 'problems')
  })

  doRefresh()
}

function doRefresh(): void {
  if (refreshing) return
  refreshing = true
  try {
    render()
  } finally {
    refreshing = false
  }
}

function render(): void {
  const all = monaco.editor.getModelMarkers({}).filter((m) => m.severity >= monaco.MarkerSeverity.Info)
  let errors = 0
  let warnings = 0
  for (const m of all) {
    if (m.severity === monaco.MarkerSeverity.Error) errors++
    else if (m.severity === monaco.MarkerSeverity.Warning) warnings++
  }

  const byFile = new Map<string, Row[]>()
  for (const m of all.slice(0, MAX_ROWS)) {
    const uri = m.resource
    const key = uri.toString()
    if (!byFile.has(key)) byFile.set(key, [])
    byFile.get(key)!.push({ uri, fsPath: uri.fsPath, marker: m })
  }

  // status bar
  $sb().innerHTML = `<span class="sb-err">&#xEA6C; ${errors}</span>&nbsp;&nbsp;<span class="sb-warn">&#xE7BA; ${warnings}</span>`
  $sb().title = `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`

  // panel tab badge
  const total = errors + warnings
  $tab().innerHTML = 'PROBLEMS' + (total ? ` <span class="panel-badge">${total > 99 ? '99+' : total}</span>` : '')

  // panel list
  const view = $view()
  if (!byFile.size) {
    view.innerHTML = `<div class="empty-hint"><p>No problems have been detected in the workspace.</p></div>`
    return
  }

  view.innerHTML = ''
  const list = document.createElement('div')
  list.className = 'problems-list'

  for (const [, rows] of byFile) {
    rows.sort((a, b) => a.marker.startLineNumber - b.marker.startLineNumber)
    const name = rows[0].fsPath.split(/[\\/]/).pop() || rows[0].fsPath
    const group = document.createElement('div')
    group.className = 'pr-group'
    group.innerHTML =
      `<div class="pr-file"><span class="pr-file-ic">${fileIcon(name)}</span>` +
      `<span class="pr-file-name">${escapeHtml(name)}</span>` +
      `<span class="pr-count">${rows.length}</span></div>`
    for (const r of rows) {
      const m = r.marker
      const sev =
        m.severity === monaco.MarkerSeverity.Error
          ? 'error'
          : m.severity === monaco.MarkerSeverity.Warning
            ? 'warn'
            : 'info'
      const row = document.createElement('div')
      row.className = 'pr-row'
      row.innerHTML =
        `<span class="pr-sev pr-sev-${sev}">${sev === 'error' ? '&#xEA6C;' : sev === 'warn' ? '&#xE7BA;' : '&#xE946;'}</span>` +
        `<span class="pr-msg">${escapeHtml(m.message)}</span>` +
        `<span class="pr-src">${escapeHtml(m.source || '')}${m.code ? ' (' + escapeHtml(String(typeof m.code === 'object' ? m.code.value : m.code)) + ')' : ''}</span>` +
        `<span class="pr-loc">Ln ${m.startLineNumber}, Col ${m.startColumn}</span>`
      row.addEventListener('click', async () => {
        await openPath(r.fsPath)
        const ed = getEditor()
        if (!ed) return
        ed.revealPositionInCenter({ lineNumber: m.startLineNumber, column: m.startColumn })
        ed.setPosition({ lineNumber: m.startLineNumber, column: m.startColumn })
        ed.focus()
      })
      group.appendChild(row)
    }
    list.appendChild(group)
  }
  view.appendChild(list)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
