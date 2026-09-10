import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import electronUpdater from 'electron-updater'
import { registerIpc } from './ipc'
import { registerPty, killAllPty } from './pty'

const { autoUpdater } = electronUpdater
const isDev = !app.isPackaged
const ICON = join(__dirname, '../../build/icon.png')

// Keep the settings/state directory stable whether run from source or packaged.
app.setName('Xcode')

let mainWindow: BrowserWindow | null = null

/* ----------------------------------------------------------------------------
 * Low-memory tuning. These must run before app "ready", so we read the on-disk
 * settings file synchronously here rather than going through the IPC store.
 * -------------------------------------------------------------------------- */
function readSettingSync<T>(key: string, fallback: T): T {
  try {
    const raw = readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8')
    const val = JSON.parse(raw)[key]
    return val === undefined ? fallback : (val as T)
  } catch {
    return fallback
  }
}

const hardwareAcceleration = readSettingSync('hardwareAcceleration', true)
if (!hardwareAcceleration) app.disableHardwareAcceleration()

// Smaller V8 heaps + size-optimised JIT across every process we spawn.
app.commandLine.appendSwitch('js-flags', '--optimize-for-size --max-semi-space-size=8')
// Cap the on-disk HTTP/code cache (default is unbounded-ish).
app.commandLine.appendSwitch('disk-cache-size', String(48 * 1024 * 1024))
// Let Windows tell Chromium when the window is fully hidden so it can idle hard.
app.commandLine.appendSwitch('enable-features', 'CalculateNativeWinOcclusion')
// One shared renderer; never spin up extra site-isolated processes for a local app.
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: false,
    icon: ICON,
    backgroundColor: '#1e1e2e',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      webgl: false,
      v8CacheOptions: 'code',
      backgroundThrottling: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[xcode] renderer process gone:', details.reason, details.exitCode)
  })
  if (isDev) {
    mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      if (level >= 2) console.log(`[renderer] ${message} (${sourceId}:${line})`)
    })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false))

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerWindowIpc(): void {
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:toggle-maximize', () => {
    if (!mainWindow) return
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('app:memory', () => {
    const metrics = app.getAppMetrics()
    let priv = 0
    for (const m of metrics) priv += m.memory.workingSetSize // KiB
    return { totalMB: Math.round(priv / 1024), processes: metrics.length }
  })
}

function setupAutoUpdate(): void {
  if (isDev) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (info) =>
    mainWindow?.webContents.send('update:available', info.version)
  )
  autoUpdater.on('update-downloaded', (info) =>
    mainWindow?.webContents.send('update:downloaded', info.version)
  )
  autoUpdater.on('error', (err) => {
    const msg = err?.message || String(err)
    // A zip-only local build has no app-update.yml — that's expected, stay quiet.
    if (!msg.includes('app-update.yml')) console.error('[xcode] auto-update:', msg)
  })
  ipcMain.on('update:install', () => autoUpdater.quitAndInstall())
  ipcMain.handle('update:check', async () => {
    try {
      const r = await autoUpdater.checkForUpdates()
      return { version: r?.updateInfo?.version ?? null }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
  if (readSettingSync('autoCheckUpdates', true)) {
    setTimeout(() => void autoUpdater.checkForUpdates().catch(() => {}), 5000)
  }
}

app.whenReady().then(() => {
  session.defaultSession.setSpellCheckerEnabled(false)
  registerWindowIpc()
  registerIpc(() => mainWindow)
  registerPty(() => mainWindow)
  createWindow()
  setupAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllPty()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => killAllPty())
