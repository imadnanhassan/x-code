import { store } from '../core/store'
import { openPicker } from './commands'
import { openPath, getEditor } from './editor'
import { toast } from './toast'

interface Hit {
  file: string
  rel: string
  line: number
  column: number
  preview: string
}

const KIND_RE = /\b(TODO|FIXME|HACK|XXX|BUG|NOTE)\b[:\s]/

export async function showTodos(): Promise<void> {
  if (!store.rootPath) {
    toast('Open a folder first', 'warn')
    return
  }
  toast('Scanning for TODOs…', 'info', 1200)
  let hits: Hit[]
  try {
    hits = (await window.xcode.search.inFolder(store.rootPath, {
      query: '\\b(TODO|FIXME|HACK|XXX|BUG)\\b[: ]',
      regex: true,
      caseSensitive: true,
      maxResults: 800
    })) as Hit[]
  } catch {
    toast('Scan failed', 'error')
    return
  }
  if (!hits.length) {
    toast('No TODO / FIXME comments found', 'ok')
    return
  }

  openPicker({
    placeholder: `${hits.length} TODO/FIXME comment${hits.length === 1 ? '' : 's'}`,
    matchOnDescription: true,
    items: hits.map((h) => {
      const kindMatch = h.preview.match(KIND_RE)
      const kind = kindMatch ? kindMatch[1] : 'TODO'
      const text = h.preview.replace(/^.*?\b(TODO|FIXME|HACK|XXX|BUG|NOTE)\b[:\s]*/i, '').trim()
      return {
        label: `${kind}  ${text || h.preview.trim()}`,
        description: `${h.rel}:${h.line}`,
        run: async () => {
          await openPath(h.file)
          const ed = getEditor()
          if (!ed) return
          ed.revealLineInCenter(h.line)
          ed.setPosition({ lineNumber: h.line, column: h.column })
          ed.focus()
        }
      }
    })
  })
}
