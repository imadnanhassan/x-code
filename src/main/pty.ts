import { BrowserWindow, ipcMain, app } from 'electron'
import { platform, homedir } from 'os'

type GetWin = () => BrowserWindow | null

// node-pty is a native module. If it failed to build (missing toolchain) we
// degrade gracefully: the renderer is told the terminal is unavailable.
declare const require: (id: string) => unknown

let pty: typeof import('node-pty') | null = null
let loadError = ''
try {
  pty = require('node-pty') as typeof import('node-pty')
} catch (err) {
  loadError = err instanceof Error ? err.message : String(err)
}

interface Term {
  proc: import('node-pty').IPty
  title: string
}

const terms = new Map<number, Term>()
let nextId = 1

function defaultShell(): { file: string; args: string[] } {
  if (platform() === 'win32') {
    return { file: process.env.COMSPEC || 'powershell.exe', args: [] }
  }
  return { file: process.env.SHELL || '/bin/bash', args: ['-l'] }
}

export function registerPty(getWin: GetWin): void {
  ipcMain.handle('pty:available', () => ({ ok: !!pty, error: loadError }))

  ipcMain.handle('pty:spawn', (_e, opts: { cwd?: string; cols?: number; rows?: number }) => {
    if (!pty) return { id: -1, error: loadError || 'node-pty not available' }
    const { file, args } = defaultShell()
    const cwd = opts.cwd && opts.cwd.length ? opts.cwd : (app.getPath('home') || homedir())
    const proc = pty.spawn(file, args, {
      name: 'xterm-color',
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>
    })
    const id = nextId++
    terms.set(id, { proc, title: file.split(/[\\/]/).pop() || 'shell' })

    proc.onData((data) => getWin()?.webContents.send('pty:data', { id, data }))
    proc.onExit(({ exitCode }) => {
      terms.delete(id)
      getWin()?.webContents.send('pty:exit', { id, exitCode })
    })
    return { id }
  })

  ipcMain.on('pty:input', (_e, id: number, data: string) => {
    terms.get(id)?.proc.write(data)
  })

  ipcMain.on('pty:resize', (_e, id: number, cols: number, rows: number) => {
    try {
      terms.get(id)?.proc.resize(Math.max(1, cols | 0), Math.max(1, rows | 0))
    } catch {
      /* ignore */
    }
  })

  ipcMain.on('pty:kill', (_e, id: number) => {
    const t = terms.get(id)
    if (t) {
      try {
        t.proc.kill()
      } catch {
        /* ignore */
      }
      terms.delete(id)
    }
  })
}

export function killAllPty(): void {
  for (const { proc } of terms.values()) {
    try {
      proc.kill()
    } catch {
      /* ignore */
    }
  }
  terms.clear()
}
