import { monaco } from './monaco'
import { store } from '../core/store'
import { bus, Ev } from '../core/bus'
import { getEditor } from './editor'

let decoIds: string[] = []
let raf = 0

export function initErrorLens(): void {
  monaco.editor.onDidChangeMarkers(() => schedule())
  bus.on(Ev.fileActivated, () => schedule())
  bus.on(Ev.settingsChanged, () => schedule())
  schedule()
}

function schedule(): void {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(apply)
}

function apply(): void {
  const ed = getEditor()
  const model = ed?.getModel()
  if (!ed || !model) return

  if (!store.settings.errorLens) {
    decoIds = ed.deltaDecorations(decoIds, [])
    return
  }

  const markers = monaco.editor
    .getModelMarkers({ resource: model.uri })
    .filter((m) => m.severity >= monaco.MarkerSeverity.Warning)

  // one message per line — the most severe
  const perLine = new Map<number, monaco.editor.IMarker>()
  for (const m of markers) {
    const cur = perLine.get(m.startLineNumber)
    if (!cur || m.severity > cur.severity) perLine.set(m.startLineNumber, m)
  }

  const decos: monaco.editor.IModelDeltaDecoration[] = []
  for (const [line, m] of perLine) {
    const sev =
      m.severity === monaco.MarkerSeverity.Error ? 'error' : m.severity === monaco.MarkerSeverity.Warning ? 'warn' : 'info'
    const msg = m.message.replace(/\s+/g, ' ').slice(0, 200)
    decos.push({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: `el-line el-line-${sev}`,
        after: {
          content: `    ${msg}`,
          inlineClassName: `el-msg el-msg-${sev}`
        }
      }
    })
  }
  decoIds = ed.deltaDecorations(decoIds, decos)
}
