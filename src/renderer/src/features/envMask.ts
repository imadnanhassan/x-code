import { monaco } from './monaco'
import { store } from '../core/store'
import { bus, Ev } from '../core/bus'
import { getEditor } from './editor'

let decoIds: string[] = []
let revealAll = false
let hooked = false

function isEnv(path?: string | null): boolean {
  const base = (path || '').split(/[\\/]/).pop() || ''
  return /^\.env(\.|$)/.test(base)
}

export function initEnvMask(): void {
  bus.on(Ev.fileActivated, apply)
  bus.on(Ev.settingsChanged, apply)
  apply()
}

export function toggleEnvReveal(): void {
  revealAll = !revealAll
  apply()
}

function apply(): void {
  const ed = getEditor()
  const model = ed?.getModel()
  if (!ed || !model) return

  if (!hooked) {
    hooked = true
    ed.onDidChangeCursorPosition(() => apply())
    ed.onDidChangeModelContent(() => apply())
  }

  const active = store.settings.maskEnvValues && !revealAll && isEnv(model.uri.fsPath)
  if (!active) {
    decoIds = ed.deltaDecorations(decoIds, [])
    return
  }

  const curLine = ed.getPosition()?.lineNumber ?? -1
  const decos: monaco.editor.IModelDeltaDecoration[] = []
  for (let i = 1; i <= model.getLineCount(); i++) {
    if (i === curLine) continue
    const text = model.getLineContent(i)
    const m = text.match(/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(\S.*?)\s*$/)
    if (!m) continue
    const start = text.indexOf(m[1]) + 1
    decos.push({
      range: new monaco.Range(i, start, i, start + m[1].length),
      options: { inlineClassName: 'env-masked', hoverMessage: { value: 'Value hidden — move the cursor here to reveal' } }
    })
  }
  decoIds = ed.deltaDecorations(decoIds, decos)
}
