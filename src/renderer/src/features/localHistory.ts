import { monaco, languageForPath } from './monaco'
import { bus, Ev } from '../core/bus'
import { current, getEditor, openPath } from './editor'
import { openPicker } from './commands'
import { toast } from './toast'

export function initLocalHistory(): void {
  bus.on(Ev.fileSaved, (path: string) => {
    if (!path) return
    const model = monaco.editor.getModel(monaco.Uri.file(path))
    if (model) void window.xcode.history.record(path, model.getValue())
  })
}

function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  return `${Math.round(h / 24)} d ago`
}

export async function showLocalHistory(): Promise<void> {
  const t = current()
  if (!t?.path) {
    toast('Open a saved file to see its local history', 'warn')
    return
  }
  const path = t.path
  const entries = (await window.xcode.history.list(path)) as { id: number; ts: number; size: number }[]
  if (!entries.length) {
    toast('No local history yet — it starts recording on save', 'info')
    return
  }
  openPicker({
    placeholder: `Local history — ${path.split(/[\\/]/).pop()}`,
    items: entries.map((e, i) => ({
      label: i === 0 ? `${ago(e.ts)}  (latest saved)` : ago(e.ts),
      description: new Date(e.ts).toLocaleString(),
      hint: `${(e.size / 1024).toFixed(1)} KB`,
      run: () => openDiff(path, e.id, e.ts)
    }))
  })
}

let diffOverlay: HTMLElement | null = null
let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null
let originalModel: monaco.editor.ITextModel | null = null
let throwawayModified: monaco.editor.ITextModel | null = null

function closeDiff(): void {
  diffEditor?.dispose()
  originalModel?.dispose()
  throwawayModified?.dispose()
  diffEditor = null
  originalModel = null
  throwawayModified = null
  diffOverlay?.remove()
  diffOverlay = null
  getEditor()?.layout()
}

async function openDiff(path: string, id: number, ts: number): Promise<void> {
  const snap = await window.xcode.history.read(path, id)
  if (snap == null) {
    toast('That history entry is gone', 'error')
    return
  }
  const liveModel = monaco.editor.getModel(monaco.Uri.file(path))
  const currentText = liveModel ? liveModel.getValue() : await window.xcode.fs.read(path).catch(() => '')
  if (snap === currentText) {
    toast('This version is identical to the current file', 'info')
    return
  }

  closeDiff()
  const name = path.split(/[\\/]/).pop() || path
  diffOverlay = document.createElement('div')
  diffOverlay.className = 'modal-overlay'
  diffOverlay.innerHTML = `
    <div class="modal diff-modal">
      <div class="modal-title">
        <span>${escapeHtml(name)} &mdash; <span class="muted">${ago(ts)} vs current</span></span>
        <div class="diff-actions">
          <button class="btn ghost" data-x>Close</button>
          <button class="btn primary" data-restore>Restore this version</button>
        </div>
      </div>
      <div class="diff-host"></div>
    </div>`
  document.body.appendChild(diffOverlay)

  const lang = languageForPath(path)
  originalModel = monaco.editor.createModel(snap, lang)
  let modifiedModel = liveModel
  if (!modifiedModel) {
    throwawayModified = monaco.editor.createModel(currentText, lang)
    modifiedModel = throwawayModified
  }

  diffEditor = monaco.editor.createDiffEditor(diffOverlay.querySelector('.diff-host') as HTMLElement, {
    readOnly: true,
    originalEditable: false,
    automaticLayout: true,
    renderSideBySide: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 12
  })
  diffEditor.setModel({ original: originalModel, modified: modifiedModel })

  diffOverlay.querySelector('[data-x]')!.addEventListener('click', closeDiff)
  diffOverlay.addEventListener('click', (e) => {
    if (e.target === diffOverlay) closeDiff()
  })
  diffOverlay.querySelector('[data-restore]')!.addEventListener('click', async () => {
    const r = await window.xcode.history.restore(path, id, currentText)
    if (r.ok) {
      if (liveModel) liveModel.setValue(r.content ?? snap)
      else await openPath(path)
      toast(`Restored version from ${ago(ts)}`, 'ok')
      closeDiff()
    } else {
      toast(r.message || 'Restore failed', 'error')
    }
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
