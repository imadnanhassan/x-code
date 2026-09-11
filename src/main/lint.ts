import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

declare const require: (id: string) => any

function bin(root: string, name: string): string | null {
  const exe = process.platform === 'win32' ? name + '.cmd' : name
  const p = join(root, 'node_modules', '.bin', exe)
  return existsSync(p) ? p : null
}
function pkg(root: string, name: string): string | null {
  const p = join(root, 'node_modules', name, 'package.json')
  return existsSync(p) ? join(root, 'node_modules', name) : null
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  stdin: string,
  timeout = 20000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { cwd, timeout, windowsHide: true, maxBuffer: 20 * 1024 * 1024, shell: process.platform === 'win32' },
      (err, stdout, stderr) => {
        resolve({
          code: err && typeof (err as any).code === 'number' ? (err as any).code : err ? 1 : 0,
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? ''
        })
      }
    )
    child.stdin?.end(stdin)
  })
}

export interface LintMessage {
  line: number
  column: number
  endLine?: number
  endColumn?: number
  message: string
  ruleId: string | null
  severity: 1 | 2
  fix?: { rangeStart: number; rangeEnd: number; text: string }
}

export function registerLint(): void {
  ipcMain.handle('lint:available', (_e, o: { root: string }) => ({
    eslint: !!bin(o.root, 'eslint'),
    prettier: !!bin(o.root, 'prettier') || !!pkg(o.root, 'prettier')
  }))

  ipcMain.handle(
    'lint:eslint',
    async (_e, o: { root: string; filePath: string; content: string }): Promise<{ ok: boolean; messages: LintMessage[]; error?: string }> => {
      const eslint = bin(o.root, 'eslint')
      if (!eslint) return { ok: false, messages: [], error: 'eslint not installed in this project' }
      const r = await run(
        eslint,
        ['--format', 'json', '--stdin', '--stdin-filename', o.filePath],
        o.root,
        o.content
      )
      // eslint exits 1 when there are lint errors — that's fine, stdout still has JSON
      let parsed: any[]
      try {
        parsed = JSON.parse(r.stdout || '[]')
      } catch {
        return { ok: false, messages: [], error: r.stderr.slice(0, 400) || 'eslint produced no output' }
      }
      const file = parsed[0]
      if (!file) return { ok: true, messages: [] }
      const messages: LintMessage[] = (file.messages || []).map((m: any) => ({
        line: m.line || 1,
        column: m.column || 1,
        endLine: m.endLine,
        endColumn: m.endColumn,
        message: m.message,
        ruleId: m.ruleId || null,
        severity: m.severity === 2 ? 2 : 1,
        fix: m.fix ? { rangeStart: m.fix.range[0], rangeEnd: m.fix.range[1], text: m.fix.text } : undefined
      }))
      return { ok: true, messages }
    }
  )

  ipcMain.handle(
    'lint:eslintFixAll',
    async (_e, o: { root: string; filePath: string; content: string }): Promise<{ ok: boolean; content?: string }> => {
      const eslint = bin(o.root, 'eslint')
      if (!eslint) return { ok: false }
      const r = await run(
        eslint,
        ['--fix-dry-run', '--format', 'json', '--stdin', '--stdin-filename', o.filePath],
        o.root,
        o.content
      )
      try {
        const parsed = JSON.parse(r.stdout || '[]')
        const out = parsed[0]?.output
        return out ? { ok: true, content: out } : { ok: true }
      } catch {
        return { ok: false }
      }
    }
  )

  ipcMain.handle(
    'format:prettier',
    async (_e, o: { root: string; filePath: string; content: string }): Promise<{ ok: boolean; content?: string; error?: string }> => {
      const prettier = bin(o.root, 'prettier')
      if (prettier) {
        const r = await run(prettier, ['--stdin-filepath', o.filePath], o.root, o.content)
        if (r.code === 0 && r.stdout) return { ok: true, content: r.stdout }
        return { ok: false, error: r.stderr.slice(0, 300) }
      }
      // fall back to the module API
      const dir = pkg(o.root, 'prettier')
      if (!dir) return { ok: false, error: 'prettier not installed' }
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const p = require(dir)
        const opts = (await p.resolveConfig?.(o.filePath)) || {}
        const formatted = await p.format(o.content, { ...opts, filepath: o.filePath })
        return { ok: true, content: formatted }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
