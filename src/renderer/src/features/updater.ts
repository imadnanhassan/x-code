import { toast } from './toast'

export function initUpdater(): void {
  window.xcode.update.onAvailable((version) => {
    toast(`Update ${version} available — downloading in the background…`, 'info', 5000)
  })

  window.xcode.update.onDownloaded((version) => {
    const host = document.getElementById('toasts')
    if (!host) return
    const el = document.createElement('div')
    el.className = 'toast toast-ok'
    el.innerHTML =
      `<span>Xcode ${version} is ready.</span> ` +
      `<button class="toast-action">Restart &amp; update</button>`
    host.appendChild(el)
    requestAnimationFrame(() => el.classList.add('in'))
    el.querySelector('.toast-action')!.addEventListener('click', () => window.xcode.update.install())
  })
}

export async function checkForUpdatesNow(): Promise<void> {
  const r = await window.xcode.update.check()
  if (r.error) {
    toast('Update check failed: ' + r.error, 'error')
  } else if (r.version && r.version !== '') {
    toast(`Latest version: ${r.version}`, 'info')
  } else {
    toast('You are on the latest version', 'ok')
  }
}
