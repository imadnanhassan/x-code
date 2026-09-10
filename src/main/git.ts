import { ipcMain } from 'electron'
import { execFile } from 'child_process'

interface Opts {
  cwd: string
}

function git(cwd: string, args: string[], timeout = 15000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? '',
        stderr: stderr?.toString() ?? '',
        code: err && typeof (err as any).code === 'number' ? (err as any).code : err ? 1 : 0
      })
    })
  })
}

export interface GitFile {
  path: string
  /** index (staged) status letter, ' ' if none */
  index: string
  /** worktree (unstaged) status letter, ' ' if none */
  worktree: string
  staged: boolean
  untracked: boolean
}

export interface GitStatus {
  repo: boolean
  root?: string
  branch?: string
  upstream?: string
  ahead: number
  behind: number
  files: GitFile[]
}

async function status(cwd: string): Promise<GitStatus> {
  const inside = await git(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (inside.stdout.trim() !== 'true') return { repo: false, ahead: 0, behind: 0, files: [] }

  const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).stdout.trim()
  const res = await git(cwd, ['status', '--porcelain=v1', '--branch', '-z', '--untracked-files=all'])
  const parts = res.stdout.split('\0')

  let branch: string | undefined
  let upstream: string | undefined
  let ahead = 0
  let behind = 0
  const files: GitFile[] = []

  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]
    if (!line) continue
    if (line.startsWith('## ')) {
      const info = line.slice(3)
      // "main...origin/main [ahead 1, behind 2]"  or  "No commits yet on main"
      const m = info.match(/^(.+?)(?:\.\.\.(\S+))?(?:\s\[(.+)\])?$/)
      if (info.startsWith('No commits yet on ')) branch = info.replace('No commits yet on ', '').trim()
      else if (m) {
        branch = m[1].trim()
        upstream = m[2]
        if (m[3]) {
          const a = m[3].match(/ahead (\d+)/)
          const b = m[3].match(/behind (\d+)/)
          if (a) ahead = +a[1]
          if (b) behind = +b[1]
        }
      }
      continue
    }
    const index = line[0]
    const worktree = line[1]
    let path = line.slice(3)
    if (index === 'R' || index === 'C') {
      // rename/copy: "R  new\0old" — old name is the next \0-part
      i++
      path = line.slice(3)
    }
    files.push({
      path,
      index,
      worktree,
      staged: index !== ' ' && index !== '?',
      untracked: index === '?' && worktree === '?'
    })
  }

  files.sort((a, b) => a.path.localeCompare(b.path))
  return { repo: true, root, branch, upstream, ahead, behind, files }
}

export function registerGit(): void {
  ipcMain.handle('git:status', (_e, o: Opts) => status(o.cwd))

  ipcMain.handle('git:init', async (_e, o: Opts) => {
    const r = await git(o.cwd, ['init'])
    return { ok: r.code === 0, message: r.stderr || r.stdout }
  })

  ipcMain.handle('git:stage', async (_e, o: Opts & { files: string[] }) => {
    const r = await git(o.cwd, ['add', '--', ...o.files])
    return { ok: r.code === 0, message: r.stderr }
  })

  ipcMain.handle('git:unstage', async (_e, o: Opts & { files: string[] }) => {
    const r = await git(o.cwd, ['reset', '-q', '--', ...o.files])
    return { ok: r.code === 0, message: r.stderr }
  })

  ipcMain.handle('git:stageAll', async (_e, o: Opts) => {
    const r = await git(o.cwd, ['add', '-A'])
    return { ok: r.code === 0, message: r.stderr }
  })

  ipcMain.handle('git:discard', async (_e, o: Opts & { files: string[]; untracked: string[] }) => {
    const errs: string[] = []
    if (o.files.length) {
      const r = await git(o.cwd, ['checkout', 'HEAD', '--', ...o.files])
      if (r.code !== 0) {
        const r2 = await git(o.cwd, ['checkout', '--', ...o.files])
        if (r2.code !== 0) errs.push(r2.stderr)
      }
    }
    if (o.untracked.length) {
      const r = await git(o.cwd, ['clean', '-fd', '--', ...o.untracked])
      if (r.code !== 0) errs.push(r.stderr)
    }
    return { ok: errs.length === 0, message: errs.join('\n') }
  })

  ipcMain.handle('git:commit', async (_e, o: Opts & { message: string; amend?: boolean }) => {
    const args = ['commit', '-m', o.message]
    if (o.amend) args.push('--amend')
    const r = await git(o.cwd, args)
    return { ok: r.code === 0, message: (r.stderr || r.stdout).trim() }
  })

  ipcMain.handle('git:push', async (_e, o: Opts) => {
    let r = await git(o.cwd, ['push'], 60000)
    if (r.code !== 0 && /no upstream branch/i.test(r.stderr)) {
      const br = (await git(o.cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
      r = await git(o.cwd, ['push', '--set-upstream', 'origin', br], 60000)
    }
    return { ok: r.code === 0, message: (r.stderr || r.stdout).trim() }
  })

  ipcMain.handle('git:pull', async (_e, o: Opts) => {
    const r = await git(o.cwd, ['pull', '--ff-only'], 60000)
    return { ok: r.code === 0, message: (r.stderr || r.stdout).trim() }
  })

  ipcMain.handle('git:log', async (_e, o: Opts & { limit?: number }) => {
    const SEP = String.fromCharCode(31)
    const r = await git(o.cwd, [
      'log',
      `-n${o.limit ?? 20}`,
      '--pretty=format:%h%x1f%an%x1f%ar%x1f%s'
    ])
    if (r.code !== 0) return []
    return r.stdout
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, author, when, subject] = l.split(SEP)
        return { hash, author, when, subject }
      })
  })
}
