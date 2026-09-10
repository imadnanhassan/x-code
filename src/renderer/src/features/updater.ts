import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { toast } from './toast'

let pending: { version: string; notes: string; ready: boolean } | null = null

const $banner = () => document.getElementById('update-banner') as HTMLElement
const $text = () => $banner().querySelector('.ub-text') as HTMLElement
const $notesBtn = () => $banner().querySelector('.ub-notes') as HTMLButtonElement
const $actionBtn = () => $banner().querySelector('.ub-action') as HTMLButtonElement

export function initUpdater(): void {
  $banner().querySelector('.ub-x')!.addEventListener('click', () => ($banner().hidden = true))
  $actionBtn().addEventListener('click', () => window.xcode.update.install())
  $notesBtn().addEventListener('click', () => pending && showNotes(pending.version, pending.notes))

  window.xcode.update.onAvailable(({ version, notes }) => {
    pending = { version, notes, ready: false }
    show(`Xcode ${version} is available — downloading in the background…`, notes, false)
  })

  window.xcode.update.onProgress(({ percent }) => {
    if (pending && !pending.ready) $text().textContent = `Downloading Xcode ${pending.version}… ${percent}%`
  })

  window.xcode.update.onDownloaded(({ version, notes }) => {
    pending = { version, notes: notes || pending?.notes || '', ready: true }
    show(`Xcode ${version} is ready to install.`, pending.notes, true)
  })
}

function show(text: string, notes: string, ready: boolean): void {
  $text().textContent = text
  $notesBtn().hidden = !notes
  $actionBtn().hidden = !ready
  $banner().hidden = false
}

export async function checkForUpdatesNow(): Promise<void> {
  if (pending) {
    $banner().hidden = false
    return
  }
  toast('Checking for updates…', 'info', 1500)
  const r = await window.xcode.update.check()
  if (r.error) toast('Update check failed', 'error')
  else if (r.version) toast(`Update ${r.version} found — it will download automatically`, 'info')
  else toast('You are on the latest version', 'ok')
}

function showNotes(version: string, notesMd: string): void {
  const html = DOMPurify.sanitize(marked.parse(notesMd || '_No release notes._', { async: false }) as string, {
    USE_PROFILES: { html: true }
  })
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML =
    `<div class="modal wide"><div class="modal-title">What's new in ${escapeHtml(version)}</div>` +
    `<div class="modal-body markdown-body">${html}</div>` +
    `<div class="modal-actions"><button class="btn primary" data-x>Close</button></div></div>`
  document.body.appendChild(overlay)
  const close = (): void => overlay.remove()
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target as HTMLElement).hasAttribute('data-x')) close()
  })
  overlay.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href')
    a.removeAttribute('href')
    a.style.cursor = 'pointer'
    if (href) a.addEventListener('click', () => window.xcode.os.openExternal(href))
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
