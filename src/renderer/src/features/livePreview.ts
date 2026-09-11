import { store } from '../core/store'
import { bus, Ev } from '../core/bus'
import { getEditor, current } from './editor'
import { toast } from './toast'

let open = false
let device = 'fill'
let boundsRaf = 0

const $host = () => document.getElementById('editor-host')!
const $view = () => document.getElementById('live-preview') as HTMLElement
const $frame = () => $view().querySelector('.lp-frame') as HTMLElement
const $url = () => $view().querySelector('.lp-url') as HTMLInputElement
const $msg = () => $view().querySelector('.lp-msg') as HTMLElement

export function initLivePreview(): void {
  const v = $view()
  v.querySelectorAll<HTMLButtonElement>('button[data-lp]').forEach((b) => {
    b.addEventListener('click', () => {
      const a = b.dataset.lp
      if (a === 'close') return setOpen(false)
      if (a === 'reload') return window.xcode.preview.reload()
      if (a === 'back') return window.xcode.preview.navigate('back')
      if (a === 'fwd') return window.xcode.preview.navigate('forward')
      if (a === 'external') return window.xcode.preview.openExternal()
    })
  })
  $url().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigate($url().value.trim())
  })
  ;(v.querySelector('.lp-device') as HTMLSelectElement).addEventListener('change', (e) => {
    device = (e.target as HTMLSelectElement).value
    pushBounds()
  })

  window.xcode.preview.onState((s) => {
    if (s.url && document.activeElement !== $url()) $url().value = s.url
    $msg().textContent = s.error ? 'Failed to load: ' + s.error : ''
    $msg().hidden = !s.error
  })

  window.addEventListener('resize', () => open && pushBounds())
  new ResizeObserver(() => open && pushBounds()).observe($frame())
  bus.on(Ev.layoutChanged, () => open && setTimeout(pushBounds, 30))
  bus.on('sidebar:view', () => open && setTimeout(pushBounds, 30))
}

export function toggleLivePreview(): void {
  setOpen(!open)
}

function guessUrl(): string {
  if (store.settings.lastPreviewUrl) return store.settings.lastPreviewUrl
  const t = current()
  if (t?.path && /\.html?$/i.test(t.path)) return 'file:///' + t.path.replace(/\\/g, '/')
  return 'http://localhost:3000'
}

function setOpen(v: boolean): void {
  open = v
  $view().hidden = !v
  $host().classList.toggle('lp-open', v)
  getEditor()?.layout()
  if (v) {
    const url = $url().value.trim() || guessUrl()
    $url().value = url
    void window.xcode.preview.open(url)
    setTimeout(pushBounds, 40)
  } else {
    window.xcode.preview.hide()
  }
}

function navigate(url: string): void {
  if (!url) return
  if (!/^\w+:\/\//.test(url)) url = 'http://' + url
  $url().value = url
  store.updateSettings({ lastPreviewUrl: url })
  void window.xcode.preview.open(url)
  setTimeout(pushBounds, 40)
}

function pushBounds(): void {
  if (!open) return
  cancelAnimationFrame(boundsRaf)
  boundsRaf = requestAnimationFrame(() => {
    const r = $frame().getBoundingClientRect()
    let { x, y, width, height } = { x: r.left, y: r.top, width: r.width, height: r.height }
    if (device !== 'fill') {
      const [dw, dh] = device.split('x').map(Number)
      const scale = Math.min(1, (width - 24) / dw, (height - 24) / dh)
      const w = Math.round(dw * scale)
      const h = Math.round(dh * scale)
      x = Math.round(r.left + (width - w) / 2)
      y = Math.round(r.top + (height - h) / 2)
      width = w
      height = h
    }
    window.xcode.preview.bounds({ x, y, width, height })
  })
}

// clean up the native view if the window is going away
window.addEventListener('beforeunload', () => window.xcode.preview.dispose())

export function previewCurrentFile(): void {
  const t = current()
  if (t?.path && /\.html?$/i.test(t.path)) {
    navigate('file:///' + t.path.replace(/\\/g, '/'))
    if (!open) setOpen(true)
  } else {
    toast('Open an .html file, or set a URL in the preview bar', 'info')
    if (!open) setOpen(true)
  }
}
