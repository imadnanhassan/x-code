import { monaco } from './monaco'
import { store } from '../core/store'
import { bus, Ev } from '../core/bus'
import { getEditor, current } from './editor'

let decoIds: string[] = []
let enabled = false
let hooked = false

function ago(ms: number): string {
  if (!ms) return ''
  const d = Math.round((Date.now() - ms) / 86400000)
  if (d < 1) return 'today'
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.round(d / 30)}mo ago`
  return `${Math.round(d / 365)}y ago`
}

export function initGitBlame(): void {
  enabled = !!store.settings.gitBlame
  bus.on(Ev.fileActivated, () => { hookOnce(); apply() })
  bus.on(Ev.fileSaved, () => apply())
  bus.on(Ev.settingsChanged, () => {
    enabled = !!store.settings.gitBlame
    apply()
  })
}

function hookOnce(): void {
  if (hooked) return
  const ed = getEditor()
  if (!ed) return
  hooked = true
  ed.onDidChangeModelContent(() => {
    // stale as soon as the buffer changes — clear until next save
    if (decoIds.length) decoIds = ed.deltaDecorations(decoIds, [])
  })
}

export function toggleGitBlame(): void {
  store.updateSettings({ gitBlame: !store.settings.gitBlame })
}

async function apply(): Promise<void> {
  const ed = getEditor()
  const t = current()
  const model = ed?.getModel()
  if (!ed || !model) return
  if (!enabled || !t?.path || !store.rootPath || model.getValueLength() > 400000) {
    decoIds = ed.deltaDecorations(decoIds, [])
    return
  }
  let res: { ok: boolean; lines: any[] }
  try {
    res = await window.xcode.git.blame(store.rootPath, t.path)
  } catch {
    return
  }
  if (!res.ok || getEditor()?.getModel() !== model) return

  const decos: monaco.editor.IModelDeltaDecoration[] = []
  for (const b of res.lines) {
    if (b.line < 1 || b.line > model.getLineCount()) continue
    const label =
      b.author === 'Uncommitted'
        ? 'Uncommitted changes'
        : `${b.author}, ${ago(b.time)}  ·  ${b.summary}`.slice(0, 90)
    decos.push({
      range: new monaco.Range(b.line, model.getLineMaxColumn(b.line), b.line, model.getLineMaxColumn(b.line)),
      options: {
        after: { content: `        ${label}`, inlineClassName: 'gb-note' },
        hoverMessage: { value: `**${b.author}** · ${b.hash}\n\n${b.summary}` }
      }
    })
  }
  decoIds = ed.deltaDecorations(decoIds, decos)
}
