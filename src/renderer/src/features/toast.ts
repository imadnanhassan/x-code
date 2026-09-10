type ToastKind = 'info' | 'warn' | 'error' | 'ok'

export function toast(message: string, kind: ToastKind = 'info', timeout = 3200): void {
  const host = document.getElementById('toasts')
  if (!host) return
  const el = document.createElement('div')
  el.className = `toast toast-${kind}`
  el.textContent = message
  host.appendChild(el)
  requestAnimationFrame(() => el.classList.add('in'))
  const close = (): void => {
    el.classList.remove('in')
    setTimeout(() => el.remove(), 200)
  }
  el.addEventListener('click', close)
  if (timeout) setTimeout(close, timeout)
}
