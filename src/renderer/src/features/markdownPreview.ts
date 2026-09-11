import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { bus, Ev } from '../core/bus'
import { getEditor, current } from './editor'
import { toast } from './toast'

let open = false
let raf = 0
let disposeContent: (() => void) | null = null

const $host = () => document.getElementById('editor-host')!
const $pane = () => document.getElementById('md-preview')!
const $body = () => $pane().querySelector('.md-preview-body') as HTMLElement

marked.setOptions({ gfm: true, breaks: false })

export function initMarkdownPreview(): void {
  document.getElementById('md-preview-close')!.addEventListener('click', () => setOpen(false))

  bus.on(Ev.fileActivated, () => {
    if (open) {
      bindActive()
      render()
    }
  })

  // sanitiser: open external links in the OS browser, keep it read-only
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('data-external', node.getAttribute('href') || '')
      node.removeAttribute('href')
    }
    if (node.tagName === 'INPUT') node.setAttribute('disabled', '')
  })

  $body().addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[data-external]') as HTMLElement | null
    if (a) {
      e.preventDefault()
      window.xcode.os.openExternal(a.dataset.external || '')
    }
  })
}

export function toggleMarkdownPreview(): void {
  setOpen(!open)
}

function isMarkdown(): boolean {
  const t = current()
  return !!t && (t.model.getLanguageId() === 'markdown' || /\.mdx?$/i.test(t.path || ''))
}

function setOpen(v: boolean): void {
  if (v && !isMarkdown()) {
    toast('Open a Markdown file to preview', 'warn')
    return
  }
  open = v
  $pane().hidden = !v
  $host().classList.toggle('md-open', v)
  getEditor()?.layout()
  if (v) {
    bindActive()
    render()
  } else {
    disposeContent?.()
    disposeContent = null
  }
}

function bindActive(): void {
  disposeContent?.()
  disposeContent = null
  const ed = getEditor()
  const model = ed?.getModel()
  if (!model) return
  const sub = model.onDidChangeContent(() => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(render)
  })
  disposeContent = () => sub.dispose()
}

function render(): void {
  if (!open) return
  const t = current()
  if (!t || !isMarkdown()) {
    $body().innerHTML = '<p class="md-empty">No Markdown file active.</p>'
    return
  }
  const raw = t.model.getValue()
  const html = marked.parse(raw, { async: false }) as string
  $body().innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}
