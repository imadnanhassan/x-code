import { BrowserWindow, ipcMain, app } from 'electron'
import { platform, homedir } from 'os'
import { existsSync } from 'fs'
import type { IPty, IPtyForkOptions } from '@lydell/node-pty'

type GetWin = () => BrowserWindow | null

// @lydell/node-pty ships prebuilt N-API binaries for every OS/arch, so this
// loads without any C/C++ toolchain. Still guarded — if a platform binary is
// somehow missing we degrade gracefully instead of crashing.
declare const require: (id: string) => unknown

let pty: typeof import('@lydell/node-pty') | null = null
let loadError = ''
try {
  pty = require('@lydell/node-pty') as typeof import('@lydell/node-pty')
} catch (err) {
  loadError = err instanceof Error ? err.message : String(err)
}

interface Term {
  proc: IPty
  title: string
}

const terms = new Map<number, Term>()
let nextId = 1

function firstExisting(paths: string[]): string | null {
  for (const p of paths) if (p && existsSync(p)) return p
  return null
}

function defaultShell(): { file: string; args: string[] } {
  if (platform() === 'win32') {
    const pwsh = firstExisting([
      `${process.env.ProgramFiles}\\PowerShell\\7\\pwsh.exe`,
      `${process.env['ProgramW6432']}\\PowerShell\\7\\pwsh.exe`
    ])
    if (pwsh) return { file: pwsh, args: ['-NoLogo'] }
    const winPS = `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    if (existsSync(winPS)) return { file: winPS, args: ['-NoLogo'] }
    return { file: process.env.COMSPEC || 'cmd.exe', args: [] }
  }
  if (platform() === 'darwin') return { file: process.env.SHELL || '/bin/zsh', args: ['-l'] }
  return { file: process.env.SHELL || '/bin/bash', args: ['-l'] }
}

export function registerPty(getWin: GetWin): void {
  ipcMain.handle('pty:available', () => ({ ok: !!pty, error: loadError }))

  ipcMain.handle(
    'pty:spawn',
    (_e, opts: { cwd?: string; cols?: number; rows?: number; shell?: string }) => {
      if (!pty) return { id: -1, error: loadError || 'node-pty not available' }
      const dflt = defaultShell()
      const file = opts.shell || dflt.file
      const args = opts.shell ? [] : dflt.args
      const cwd =
        opts.cwd && existsSync(opts.cwd) ? opts.cwd : app.getPath('home') || homedir()
      const forkOpts: IPtyForkOptions = {
        name: 'xterm-256color',
        cols: opts.cols ?? 80,
        rows: opts.rows ?? 24,
        cwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>
      }
      let proc: IPty
      try {
        proc = pty.spawn(file, args, forkOpts)
      } catch (err) {
        return { id: -1, error: err instanceof Error ? err.message : String(err) }
      }
      const id = nextId++
      terms.set(id, { proc, title: file.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') || 'shell' })

      proc.onData((data) => getWin()?.webContents.send('pty:data', { id, data }))
      proc.onExit(({ exitCode }) => {
        terms.delete(id)
        getWin()?.webContents.send('pty:exit', { id, exitCode })
      })
      return { id, shell: terms.get(id)!.title }
    }
  )

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
