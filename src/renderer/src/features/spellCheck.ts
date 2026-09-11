import { monaco } from './monaco'
import { store } from '../core/store'
import { bus, Ev } from '../core/bus'
import { getEditor, current } from './editor'

const OWNER = 'spell'
const timers = new Map<string, number>()
const suggestCache = new Map<string, string[]>()
let hooked = false

const FULL_LANGS = new Set(['markdown', 'plaintext', 'mdx'])
const WORD_RE = /[A-Za-z][A-Za-z']{2,39}/g

function isCheckable(w: string): boolean {
  if (/[A-Z].*[A-Z]/.test(w.slice(1))) return false // camelCase / PascalCase-ish
  if (/^[A-Z]{2,}$/.test(w)) return false // acronym
  return true
}

/** collect candidate words + their ranges for the model */
function collect(model: monaco.editor.ITextModel): { word: string; range: monaco.Range }[] {
  const lang = model.getLanguageId()
  const full = FULL_LANGS.has(lang)
  const out: { word: string; range: monaco.Range }[] = []
  const n = Math.min(model.getLineCount(), 4000)
  for (let i = 1; i <= n; i++) {
    const line = model.getLineContent(i)
    let scan = line
    if (!full) {
      // only within // comments, /* */ (single line), # comments, and "strings"
      const parts: string[] = []
      const lc = line.indexOf('//')
      if (lc >= 0) parts.push(line.slice(lc))
      const hc = line.match(/(^|\s)#\s.*/)
      if (hc) parts.push(hc[0])
      const strs = line.match(/(['"`])(?:\\.|(?!\1).)*\1/g)
      if (strs) parts.push(...strs)
      const block = line.match(/\/\*.*?\*\//g)
      if (block) parts.push(...block)
      if (!parts.length) continue
      scan = parts.join(' ')
    }
    let m: RegExpExecArray | null
    WORD_RE.lastIndex = 0
    while ((m = WORD_RE.exec(scan)) !== null) {
      const w = m[0].replace(/'+$/, '')
      if (w.length < 3 || !isCheckable(w)) continue
      const col = line.indexOf(w) + 1
      if (col < 1) continue
      out.push({ word: w, range: new monaco.Range(i, col, i, col + w.length) })
    }
  }
  return out
}

export function initSpellCheck(): void {
  bus.on(Ev.fileActivated, () => { hookOnce(); run() })
  bus.on(Ev.settingsChanged, run)

  monaco.languages.registerCodeActionProvider(
    ['markdown', 'plaintext', 'javascript', 'typescript', 'html', 'css', 'python', 'json', 'yaml'],
    {
      async provideCodeActions(model, _range, ctx) {
        const actions: monaco.languages.CodeAction[] = []
        for (const d of ctx.markers) {
          if (d.source !== OWNER) continue
          const word = model.getValueInRange(d)
          const key = word.toLowerCase()
          let sugg = suggestCache.get(key)
          if (!sugg) {
            sugg = await window.xcode.spell.suggest(word)
            suggestCache.set(key, sugg)
          }
          for (const s of sugg.slice(0, 5)) {
            actions.push({
              title: `Change to “${s}”`,
              kind: 'quickfix',
              edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: { range: d, text: s } }] as any }
            })
          }
          actions.push({
            title: `Add “${word}” to dictionary`,
            kind: 'quickfix',
            command: { id: 'xcode.spellAdd', title: 'Add to dictionary', arguments: [word] }
          })
        }
        return { actions, dispose() {} }
      }
    }
  )
  monaco.editor.registerCommand('xcode.spellAdd', async (_a: unknown, word: string) => {
    await window.xcode.spell.add(word)
    suggestCache.clear()
    run()
  })
}

function hookOnce(): void {
  if (hooked) return
  const ed = getEditor()
  if (!ed) return
  hooked = true
  ed.onDidChangeModelContent(() => run())
}

function run(): void {
  const ed = getEditor()
  const model = ed?.getModel()
  const t = current()
  if (!ed || !model) return
  if (!store.settings.spellCheck) {
    monaco.editor.setModelMarkers(model, OWNER, [])
    return
  }
  const lang = model.getLanguageId()
  const codeOk = ['javascript', 'typescript', 'html', 'css', 'scss', 'python', 'json', 'yaml', 'go', 'rust', 'java'].includes(lang)
  if (!FULL_LANGS.has(lang) && !codeOk) {
    monaco.editor.setModelMarkers(model, OWNER, [])
    return
  }

  const key = model.uri.toString()
  if (timers.has(key)) window.clearTimeout(timers.get(key))
  timers.set(
    key,
    window.setTimeout(async () => {
      timers.delete(key)
      if (getEditor()?.getModel() !== model) return
      const cands = collect(model)
      if (!cands.length) {
        monaco.editor.setModelMarkers(model, OWNER, [])
        return
      }
      const unique = [...new Set(cands.map((c) => c.word))]
      const r = await window.xcode.spell.check(unique)
      if (!r.ok || getEditor()?.getModel() !== model) return
      const bad = new Set(r.bad)
      monaco.editor.setModelMarkers(
        model,
        OWNER,
        cands
          .filter((c) => bad.has(c.word))
          .map((c) => ({
            severity: monaco.MarkerSeverity.Info,
            message: `“${c.word}” may be misspelled`,
            source: OWNER,
            startLineNumber: c.range.startLineNumber,
            startColumn: c.range.startColumn,
            endLineNumber: c.range.endLineNumber,
            endColumn: c.range.endColumn
          }))
      )
    }, 800)
  )
  void t
}
