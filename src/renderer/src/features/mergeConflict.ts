import { monaco } from './monaco'
import { getEditor } from './editor'
import { bus, Ev } from '../core/bus'

interface Conflict {
  startLine: number // <<<<<<<
  sepLine: number // =======
  endLine: number // >>>>>>>
  baseLine?: number // ||||||| (diff3)
}

function findConflicts(model: monaco.editor.ITextModel): Conflict[] {
  const out: Conflict[] = []
  let cur: Partial<Conflict> | null = null
  const n = model.getLineCount()
  for (let i = 1; i <= n; i++) {
    const t = model.getLineContent(i)
    if (t.startsWith('<<<<<<<')) cur = { startLine: i }
    else if (cur && t.startsWith('|||||||')) cur.baseLine = i
    else if (cur && t.startsWith('=======') && cur.sepLine === undefined) cur.sepLine = i
    else if (cur && t.startsWith('>>>>>>>') && cur.sepLine !== undefined) {
      out.push({ ...(cur as Conflict), endLine: i })
      cur = null
    }
  }
  return out
}

let decoIds: string[] = []
let cmdRegistered = false

export function initMergeConflict(): void {
  if (!cmdRegistered) {
    cmdRegistered = true
    monaco.editor.registerCommand('xcode.resolveConflict', (_acc: unknown, arg: { kind: string; c: Conflict }) => {
      resolve(arg.kind, arg.c)
    })
  }

  const CONFLICT_LANGS = [
    'plaintext', 'javascript', 'typescript', 'json', 'html', 'css', 'scss', 'less', 'markdown',
    'python', 'go', 'rust', 'java', 'cpp', 'c', 'csharp', 'php', 'ruby', 'shell', 'yaml', 'xml', 'sql'
  ]
  monaco.languages.registerCodeLensProvider(CONFLICT_LANGS, {
    provideCodeLenses(model) {
      const conflicts = findConflicts(model)
      if (!conflicts.length) return { lenses: [], dispose() {} }
      const lenses: monaco.languages.CodeLens[] = []
      for (const c of conflicts) {
        const at = (col: number, title: string, kind: string): monaco.languages.CodeLens => ({
          range: new monaco.Range(c.startLine, 1, c.startLine, col),
          command: { id: 'xcode.resolveConflict', title, arguments: [{ kind, c }] }
        })
        lenses.push(
          at(1, 'Accept Current', 'current'),
          at(2, 'Accept Incoming', 'incoming'),
          at(3, 'Accept Both', 'both'),
          at(4, 'Compare', 'compare')
        )
      }
      return { lenses, dispose() {} }
    },
    resolveCodeLens: (_m, lens) => lens
  })

  bus.on(Ev.cursorMoved, decorate)
  bus.on(Ev.fileActivated, decorate)
  bus.on(Ev.fileDirty, decorate)
}

function decorate(): void {
  const ed = getEditor()
  const model = ed?.getModel()
  if (!ed || !model) return
  const conflicts = findConflicts(model)
  const decos: monaco.editor.IModelDeltaDecoration[] = []
  for (const c of conflicts) {
    decos.push({
      range: new monaco.Range(c.startLine + 1, 1, (c.baseLine ?? c.sepLine) - 1, 1),
      options: { isWholeLine: true, className: 'mc-current' }
    })
    decos.push({
      range: new monaco.Range(c.sepLine + 1, 1, c.endLine - 1, 1),
      options: { isWholeLine: true, className: 'mc-incoming' }
    })
    for (const ln of [c.startLine, c.sepLine, c.endLine, c.baseLine].filter(Boolean) as number[]) {
      decos.push({ range: new monaco.Range(ln, 1, ln, 1), options: { isWholeLine: true, className: 'mc-marker' } })
    }
  }
  decoIds = ed.deltaDecorations(decoIds, decos)
}

function resolve(kind: string, c: Conflict): void {
  const ed = getEditor()
  const model = ed?.getModel()
  if (!ed || !model) return

  const currentEnd = c.baseLine ?? c.sepLine
  const currentLines: string[] = []
  for (let i = c.startLine + 1; i < currentEnd; i++) currentLines.push(model.getLineContent(i))
  const incomingLines: string[] = []
  for (let i = c.sepLine + 1; i < c.endLine; i++) incomingLines.push(model.getLineContent(i))

  let replacement = ''
  if (kind === 'current') replacement = currentLines.join('\n')
  else if (kind === 'incoming') replacement = incomingLines.join('\n')
  else if (kind === 'both') replacement = currentLines.concat(incomingLines).join('\n')
  else if (kind === 'compare') {
    void import('./diffView').then((m) => {
      const p = ed.getModel()?.uri.fsPath
      if (p) m.openGitDiff(p)
    })
    return
  }

  const range = new monaco.Range(c.startLine, 1, c.endLine, model.getLineMaxColumn(c.endLine))
  ed.executeEdits('merge-conflict', [{ range, text: replacement }])
  ed.pushUndoStop()
  setTimeout(decorate, 0)
}
