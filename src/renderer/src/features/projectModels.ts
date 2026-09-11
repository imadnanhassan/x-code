import { monaco, languageForPath } from './monaco'
import { store } from '../core/store'
import { bus, Ev } from '../core/bus'
import { walkForQuickOpen } from './explorer'

// Monaco's TypeScript language service only knows about files that exist as
// live models — it has no real filesystem access, so "Go to Definition" on an
// import silently fails for any file that isn't already open in a tab. This
// preloads the workspace's own source files as background models (not tabs)
// so cross-file navigation, hover and autocomplete actually work, the way a
// real project-aware editor should. Capped by file count and total bytes so
// it can't blow up RAM on a huge repo; runs in small chunks so it never
// blocks typing or scrolling.

const SRC_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i
const MAX_FILES = 2000
const MAX_BYTES = 20 * 1024 * 1024
const CHUNK = 25

let ownedUris = new Set<string>()
let runToken = 0

export function initProjectModels(): void {
  bus.on(Ev.workspaceOpened, () => void preload())
  if (store.rootPath) void preload()
}

async function preload(): Promise<void> {
  const token = ++runToken
  disposeOwned()
  if (!store.rootPath) return

  let files: string[]
  try {
    files = (await walkForQuickOpen()).filter((f) => SRC_EXT.test(f)).slice(0, MAX_FILES)
  } catch {
    return
  }

  let bytes = 0
  for (let i = 0; i < files.length; i++) {
    if (token !== runToken) return // a different/newer workspace opened mid-scan
    const path = files[i]
    const uri = monaco.Uri.file(path)
    if (monaco.editor.getModel(uri)) continue // already a tab, or already preloaded

    let text: string
    try {
      text = await window.xcode.fs.read(path)
    } catch {
      continue
    }
    if (token !== runToken) return // a newer preload() reset the pool while this read was in flight
    bytes += text.length
    if (bytes > MAX_BYTES) break

    try {
      monaco.editor.createModel(text, languageForPath(path), uri)
      ownedUris.add(uri.toString())
    } catch {
      /* model appeared between the check and here (race with opening it as a tab) */
    }

    if (i % CHUNK === 0) await new Promise((r) => setTimeout(r, 0))
  }
}

function disposeOwned(): void {
  for (const key of ownedUris) {
    try {
      monaco.editor.getModel(monaco.Uri.parse(key))?.dispose()
    } catch {
      /* already disposed elsewhere (e.g. the tab that adopted it was closed) */
    }
  }
  ownedUris = new Set()
}
