import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { constants as fsConstants } from 'fs'
import { homedir } from 'os'
import { basename, dirname, extname, join, relative, sep } from 'path'

type GetWin = () => BrowserWindow | null

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'out', 'build', 'release',
  '.next', '.nuxt', '.cache', '.turbo', '.wrangler', '.parcel-cache', 'coverage',
  '.vite', '.svelte-kit', '__pycache__', '.venv', 'venv', '.idea'
])

const TEXT_EXT = new Set([
  '', '.txt', '.md', '.markdown', '.mdx', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.json', '.jsonc', '.json5', '.css', '.scss', '.sass', '.less', '.html', '.htm', '.xml',
  '.svg', '.vue', '.svelte', '.astro', '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt',
  '.kts', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.swift', '.m', '.mm', '.sh', '.bash',
  '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
  '.env', '.sql', '.graphql', '.gql', '.prisma', '.lua', '.dart', '.r', '.jl', '.ex', '.exs',
  '.elm', '.clj', '.cljs', '.edn', '.tf', '.hcl', '.dockerfile', '.gitignore', '.gitattributes',
  '.editorconfig', '.npmrc', '.nvmrc', '.prettierrc', '.eslintrc', '.log', '.csv', '.tsv'
])

const CONFIG_DIR = app.getPath('userData')
const SETTINGS_FILE = join(CONFIG_DIR, 'settings.json')
const STATE_FILE = join(CONFIG_DIR, 'workspace-state.json')

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymbolicLink: boolean
}

async function listDir(dir: string): Promise<DirEntry[]> {
  const items = await fs.readdir(dir, { withFileTypes: true })
  const out: DirEntry[] = []
  for (const it of items) {
    out.push({
      name: it.name,
      path: join(dir, it.name),
      isDirectory: it.isDirectory() || (it.isSymbolicLink() && await isDirSafe(join(dir, it.name))),
      isSymbolicLink: it.isSymbolicLink()
    })
  }
  out.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
  return out
}

async function isDirSafe(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory()
  } catch {
    return false
  }
}

function looksBinary(content: string): boolean {
  const n = Math.min(content.length, 4000)
  for (let i = 0; i < n; i++) {
    const c = content.charCodeAt(i)
    if (c === 0) return true
    if (c < 9 || (c > 13 && c < 32)) return true
  }
  return false
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function uniquePath(target: string): Promise<string> {
  if (!(await pathExists(target))) return target
  const ext = extname(target)
  const stem = target.slice(0, target.length - ext.length)
  let i = 1
  while (await pathExists(`${stem} ${i}${ext}`)) i++
  return `${stem} ${i}${ext}`
}

interface SearchOptions {
  query: string
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
  maxResults?: number
}

interface SearchHit {
  file: string
  rel: string
  line: number
  column: number
  preview: string
}

function buildMatcher(o: SearchOptions): RegExp {
  let source = o.regex ? o.query : o.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (o.wholeWord) source = `\\b${source}\\b`
  return new RegExp(source, o.caseSensitive ? 'g' : 'gi')
}

async function searchInFolder(root: string, o: SearchOptions): Promise<SearchHit[]> {
  const hits: SearchHit[] = []
  const max = o.maxResults ?? 2000
  let re: RegExp
  try {
    re = buildMatcher(o)
  } catch {
    return hits
  }

  async function walk(dir: string): Promise<void> {
    if (hits.length >= max) return
    let entries: DirEntry[]
    try {
      entries = await listDir(dir)
    } catch {
      return
    }
    for (const e of entries) {
      if (hits.length >= max) return
      if (e.isDirectory) {
        if (IGNORED_DIRS.has(e.name) || (e.name.startsWith('.') && e.name !== '.github')) continue
        await walk(e.path)
        continue
      }
      const ext = extname(e.name).toLowerCase()
      if (!TEXT_EXT.has(ext) && !TEXT_EXT.has(e.name.toLowerCase())) continue
      let stat
      try {
        stat = await fs.stat(e.path)
      } catch {
        continue
      }
      if (stat.size > 1_500_000) continue
      let content: string
      try {
        content = await fs.readFile(e.path, 'utf8')
      } catch {
        continue
      }
      if (looksBinary(content)) continue
      const lines = content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(lines[i])) !== null) {
          hits.push({
            file: e.path,
            rel: relative(root, e.path).split(sep).join('/'),
            line: i + 1,
            column: m.index + 1,
            preview: lines[i].slice(Math.max(0, m.index - 40), m.index + 120).trim()
          })
          if (m.index === re.lastIndex) re.lastIndex++
          if (hits.length >= max) return
        }
      }
    }
  }

  await walk(root)
  return hits
}

export function registerIpc(getWin: GetWin): void {
  ipcMain.handle('dialog:open-folder', async () => {
    const win = getWin()
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  })

  ipcMain.handle('dialog:open-file', async () => {
    const win = getWin()
    const res = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'] })
    if (res.canceled) return []
    return res.filePaths
  })

  ipcMain.handle('dialog:save-file', async (_e, defaultPath?: string) => {
    const win = getWin()
    const res = await dialog.showSaveDialog(win!, { defaultPath })
    if (res.canceled || !res.filePath) return null
    return res.filePath
  })

  ipcMain.handle('fs:list', async (_e, dir: string) => listDir(dir))

  ipcMain.handle('fs:read', async (_e, file: string) => {
    const s = await fs.stat(file)
    if (s.size > 24 * 1024 * 1024) throw new Error('too-large')
    const buf = await fs.readFile(file)
    if (buf.subarray(0, 8000).includes(0)) throw new Error('binary')
    return buf.toString('utf8')
  })

  ipcMain.handle('fs:write', async (_e, file: string, content: string) => {
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.writeFile(file, content, 'utf8')
    return true
  })

  ipcMain.handle('fs:create-file', async (_e, dir: string, name: string) => {
    const target = await uniquePath(join(dir, name))
    await fs.mkdir(dirname(target), { recursive: true })
    await fs.writeFile(target, '', { flag: 'wx' })
    return target
  })

  ipcMain.handle('fs:create-dir', async (_e, dir: string, name: string) => {
    const target = await uniquePath(join(dir, name))
    await fs.mkdir(target, { recursive: true })
    return target
  })

  ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
    if (await pathExists(newPath)) throw new Error('A file or folder with that name already exists.')
    await fs.rename(oldPath, newPath)
    return newPath
  })

  ipcMain.handle('fs:delete', async (_e, target: string) => {
    await fs.rm(target, { recursive: true, force: true })
    return true
  })

  ipcMain.handle('fs:stat', async (_e, target: string) => {
    const s = await fs.stat(target)
    return {
      size: s.size,
      isDirectory: s.isDirectory(),
      mtimeMs: s.mtimeMs,
      name: basename(target)
    }
  })

  ipcMain.handle('search:folder', async (_e, root: string, opts: SearchOptions) =>
    searchInFolder(root, opts)
  )

  ipcMain.handle('settings:get', async () => readJson(SETTINGS_FILE, {}))
  ipcMain.handle('settings:set', async (_e, data: unknown) => {
    await writeJson(SETTINGS_FILE, data)
    getWin()?.webContents.send('settings:changed', data)
    return true
  })

  ipcMain.handle('state:get', async () => readJson(STATE_FILE, {}))
  ipcMain.handle('state:set', async (_e, data: unknown) => {
    await writeJson(STATE_FILE, data)
    return true
  })

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform,
    home: app.getPath('home')
  }))

  ipcMain.on('app:set-title', (_e, title: string) => {
    getWin()?.setTitle(title)
  })

  /* ---- OS integration ---- */
  ipcMain.on('os:reveal', (_e, target: string) => shell.showItemInFolder(target))
  ipcMain.handle('os:open-path', (_e, target: string) => shell.openPath(target))
  ipcMain.on('os:open-external', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  /* ---- VS Code settings import ---- */
  ipcMain.handle('vscode:find-settings', async () => {
    const home = homedir()
    const candidates =
      process.platform === 'win32'
        ? [
            join(process.env.APPDATA || join(home, 'AppData/Roaming'), 'Code/User/settings.json'),
            join(process.env.APPDATA || join(home, 'AppData/Roaming'), 'Code - Insiders/User/settings.json'),
            join(home, 'AppData/Roaming/VSCodium/User/settings.json'),
            join(home, 'AppData/Roaming/Cursor/User/settings.json')
          ]
        : process.platform === 'darwin'
          ? [
              join(home, 'Library/Application Support/Code/User/settings.json'),
              join(home, 'Library/Application Support/Code - Insiders/User/settings.json'),
              join(home, 'Library/Application Support/VSCodium/User/settings.json'),
              join(home, 'Library/Application Support/Cursor/User/settings.json')
            ]
          : [
              join(home, '.config/Code/User/settings.json'),
              join(home, '.config/Code - Insiders/User/settings.json'),
              join(home, '.config/VSCodium/User/settings.json'),
              join(home, '.config/Cursor/User/settings.json')
            ]
    for (const p of candidates) {
      try {
        const content = await fs.readFile(p, 'utf8')
        return { path: p, content }
      } catch {
        /* next */
      }
    }
    return null
  })

  ipcMain.handle('vscode:pick-settings', async () => {
    const win = getWin()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Select a VS Code settings.json',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json', 'jsonc'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    try {
      const content = await fs.readFile(res.filePaths[0], 'utf8')
      return { path: res.filePaths[0], content }
    } catch {
      return null
    }
  })
}
