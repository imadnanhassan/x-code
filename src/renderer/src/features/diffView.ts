import { monaco, languageForPath } from './monaco'
import { store } from '../core/store'
import { getEditor, current, openPath } from './editor'
import { toast } from './toast'

let diff: monaco.editor.IStandaloneDiffEditor | null = null
let orig: monaco.editor.ITextModel | null = null
let mod: monaco.editor.ITextModel | null = null
let modIsThrowaway = false

const $host = () => document.getElementById('editor-host')!
const $view = () => document.getElementById('diff-view') as HTMLElement

export function initDiffView(): void {
  $view().querySelector('.dv-close')!.addEventListener('click', closeDiff)
  $view().querySelector('.dv-openfile')!.addEventListener('click', () => {
    const p = $view().dataset.path
    closeDiff()
    if (p) void openPath(p)
  })
}

export function isDiffOpen(): boolean {
  return !$view().hidden
}

export function closeDiff(): void {
  diff?.dispose()
  orig?.dispose()
  if (modIsThrowaway) mod?.dispose()
  diff = orig = mod = null
  modIsThrowaway = false
  $view().hidden = true
  $host().classList.remove('diff-open')
  getEditor()?.layout()
}

export async function openGitDiff(path?: string): Promise<void> {
  const target = path || current()?.path
  if (!target) {
    toast('Open a file to compare', 'warn')
    return
  }
  if (!store.rootPath) return
  const head = await window.xcode.git.showHead(store.rootPath, target)
  if (head == null) {
    toast('No committed version of this file yet', 'warn')
    return
  }

  const live = monaco.editor.getModel(monaco.Uri.file(target))
  const currentText = live ? live.getValue() : await window.xcode.fs.read(target).catch(() => '')
  if (head === currentText) {
    toast('No changes vs the last commit', 'ok')
    return
  }

  closeDiff()
  const name = target.split(/[\\/]/).pop() || target
  const lang = languageForPath(target)
  $view().dataset.path = target
  $view().querySelector('.dv-title')!.textContent = `${name}  ·  Working Tree ↔ HEAD`

  orig = monaco.editor.createModel(head, lang)
  if (live) {
    mod = live
    modIsThrowaway = false
  } else {
    mod = monaco.editor.createModel(currentText, lang)
    modIsThrowaway = true
  }

  $view().hidden = false
  $host().classList.add('diff-open')
  diff = monaco.editor.createDiffEditor($view().querySelector('.dv-host') as HTMLElement, {
    readOnly: false,
    originalEditable: false,
    automaticLayout: true,
    renderSideBySide: true,
    fontSize: store.settings.fontSize + store.settings.zoom,
    fontFamily: store.settings.fontFamily,
    minimap: { enabled: false },
    scrollBeyondLastLine: false
  })
  diff.setModel({ original: orig, modified: mod })
}
