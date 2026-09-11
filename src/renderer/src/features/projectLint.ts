import { monaco } from './monaco'
import { store } from '../core/store'
import { bus, Ev } from '../core/bus'
import { getEditor, current } from './editor'
import { toast } from './toast'

let has = { eslint: false, prettier: false }
const timers = new Map<string, number>()
const ESLINT_LANGS = new Set(['javascript', 'typescript', 'vue', 'svelte', 'astro'])
const PRETTIER_LANGS = new Set([
  'javascript', 'typescript', 'json', 'jsonc', 'css', 'scss', 'less', 'html', 'markdown', 'yaml', 'graphql', 'vue'
])

export function initProjectLint(): void {
  bus.on(Ev.workspaceOpened, refreshAvailability)
  bus.on(Ev.fileOpened, (p: string) => { hookEditorOnce(); lintPath(p) })
  bus.on(Ev.fileActivated, (p: string) => { hookEditorOnce(); if (p) lintPath(p) })
  bus.on(Ev.fileSaved, (p: string) => p && lintPath(p, 0))
  refreshAvailability()
}

let hooked = false
function hookEditorOnce(): void {
  if (hooked) return
  const ed = getEditor()
  if (!ed) return
  hooked = true
  ed.onDidChangeModelContent(() => {
    const t = current()
    if (t?.path) lintPath(t.path)
  })
}

async function refreshAvailability(): Promise<void> {
  if (!store.rootPath) {
    has = { eslint: false, prettier: false }
    return
  }
  try {
    has = await window.xcode.lint.available(store.rootPath)
  } catch {
    has = { eslint: false, prettier: false }
  }
}

function lintPath(path: string, delay = 550): void {
  if (!store.settings.useProjectLinters || !has.eslint || !store.rootPath) return
  const model = monaco.editor.getModel(monaco.Uri.file(path))
  if (!model || !ESLINT_LANGS.has(model.getLanguageId())) return

  const key = model.uri.toString()
  if (timers.has(key)) window.clearTimeout(timers.get(key))
  timers.set(
    key,
    window.setTimeout(async () => {
      timers.delete(key)
      const r = await window.xcode.lint.eslint(store.rootPath!, path, model.getValue())
      if (!r.ok) {
        monaco.editor.setModelMarkers(model, 'eslint', [])
        return
      }
      monaco.editor.setModelMarkers(
        model,
        'eslint',
        r.messages.map((m: any) => ({
          severity: m.severity === 2 ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: m.message,
          source: m.ruleId ? `eslint(${m.ruleId})` : 'eslint',
          startLineNumber: m.line,
          startColumn: m.column,
          endLineNumber: m.endLine || m.line,
          endColumn: m.endColumn || m.column + 1
        }))
      )
    }, delay)
  )
}

/** Format via Prettier when the project has it, else Monaco's built-in. */
export async function formatActiveDocument(): Promise<void> {
  const ed = getEditor()
  const t = current()
  const model = ed?.getModel()
  if (!ed || !t?.path || !model) return

  if (store.settings.useProjectLinters && has.prettier && store.rootPath && PRETTIER_LANGS.has(model.getLanguageId())) {
    const r = await window.xcode.lint.prettier(store.rootPath, t.path, model.getValue())
    if (r.ok && r.content != null && r.content !== model.getValue()) {
      const full = model.getFullModelRange()
      model.applyEdits([{ range: full, text: r.content }])
      return
    }
    if (!r.ok && r.error) toast('Prettier: ' + r.error, 'error')
    if (r.ok) return
  }
  try {
    await ed.getAction('editor.action.formatDocument')?.run()
  } catch {
    /* no formatter */
  }
}

export async function eslintFixAll(): Promise<void> {
  const t = current()
  const model = getEditor()?.getModel()
  if (!t?.path || !model || !has.eslint || !store.rootPath) {
    toast('ESLint not available for this file', 'warn')
    return
  }
  const r = await window.xcode.lint.eslintFixAll(store.rootPath, t.path, model.getValue())
  if (r.ok && r.content != null && r.content !== model.getValue()) {
    model.applyEdits([{ range: model.getFullModelRange(), text: r.content }])
    toast('Applied ESLint fixes', 'ok')
    lintPath(t.path, 0)
  } else {
    toast('Nothing to fix', 'info')
  }
}
