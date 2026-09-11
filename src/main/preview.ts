import { BrowserWindow, WebContentsView, ipcMain, shell } from 'electron'

type GetWin = () => BrowserWindow | null

let view: WebContentsView | null = null
let attached = false

export function registerPreview(getWin: GetWin): void {
  const ensure = (): WebContentsView | null => {
    const win = getWin()
    if (!win) return null
    if (!view) {
      view = new WebContentsView({
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
      })
      const wc = view.webContents
      wc.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
      })
      wc.on('did-navigate', (_e, url) => win.webContents.send('preview:state', { url, loading: wc.isLoading() }))
      wc.on('did-navigate-in-page', (_e, url) => win.webContents.send('preview:state', { url }))
      wc.on('did-start-loading', () => win.webContents.send('preview:state', { loading: true }))
      wc.on('did-stop-loading', () =>
        win.webContents.send('preview:state', { loading: false, canGoBack: wc.navigationHistory.canGoBack() })
      )
      wc.on('did-fail-load', (_e, code, desc, url) => {
        if (code !== -3) win.webContents.send('preview:state', { error: `${desc} (${code})`, url })
      })
    }
    if (!attached) {
      win.contentView.addChildView(view)
      attached = true
    }
    return view
  }

  ipcMain.handle('preview:open', (_e, o: { url: string }) => {
    const v = ensure()
    if (!v) return { ok: false }
    v.webContents.loadURL(o.url).catch(() => {})
    return { ok: true }
  })

  ipcMain.on('preview:bounds', (_e, b: { x: number; y: number; width: number; height: number }) => {
    if (!view || !attached) return
    view.setBounds({
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.max(0, Math.round(b.width)),
      height: Math.max(0, Math.round(b.height))
    })
  })

  ipcMain.on('preview:hide', () => {
    const win = getWin()
    if (view && attached && win) {
      win.contentView.removeChildView(view)
      attached = false
    }
  })

  ipcMain.on('preview:reload', () => view?.webContents.reload())
  ipcMain.on('preview:navigate', (_e, dir: 'back' | 'forward') => {
    const h = view?.webContents.navigationHistory
    if (!h) return
    if (dir === 'back' && h.canGoBack()) h.goBack()
    if (dir === 'forward' && h.canGoForward()) h.goForward()
  })
  ipcMain.on('preview:open-external', () => {
    const u = view?.webContents.getURL()
    if (u) shell.openExternal(u)
  })

  ipcMain.on('preview:dispose', () => {
    const win = getWin()
    if (view) {
      if (attached && win) win.contentView.removeChildView(view)
      ;(view.webContents as any).close?.()
      view = null
      attached = false
    }
  })
}
