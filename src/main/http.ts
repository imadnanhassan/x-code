import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'

export interface HttpResult {
  ok: boolean
  status?: number
  statusText?: string
  headers?: Record<string, string>
  body?: string
  timeMs?: number
  size?: number
  error?: string
}

export interface ApiHistoryEntry {
  id: string
  method: string
  url: string
  ok: boolean
  status?: number
  timeMs?: number
  size?: number
  at: number
}

const HISTORY_FILE = join(app.getPath('userData'), 'api-history.json')
const MAX_HISTORY = 200

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(data), 'utf8')
}

export function registerHttp(): void {
  ipcMain.handle(
    'http:send',
    async (
      _e,
      req: { method: string; url: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }
    ): Promise<HttpResult> => {
      if (!/^https?:\/\//i.test(req.url)) return { ok: false, error: 'URL must start with http:// or https://' }
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 30000)
      const start = Date.now()
      try {
        const res = await fetch(req.url, {
          method: req.method || 'GET',
          headers: req.headers,
          body: req.body && req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
          signal: ctrl.signal,
          redirect: 'follow'
        })
        const buf = Buffer.from(await res.arrayBuffer())
        const headers: Record<string, string> = {}
        res.headers.forEach((v, k) => (headers[k] = v))
        return {
          ok: true,
          status: res.status,
          statusText: res.statusText,
          headers,
          body: buf.toString('utf8'),
          size: buf.byteLength,
          timeMs: Date.now() - start
        }
      } catch (err: any) {
        return {
          ok: false,
          error: err?.name === 'AbortError' ? 'Request timed out' : String(err?.message || err),
          timeMs: Date.now() - start
        }
      } finally {
        clearTimeout(to)
      }
    }
  )

  // Two requests sent back-to-back (e.g. two CodeLens "Send" clicks) would
  // otherwise both read the file before either writes, and the second write
  // would silently drop the first entry. Chain every read-modify-write
  // through one queue so they apply one at a time.
  let historyQueue: Promise<void> = Promise.resolve()
  function queueHistoryWrite(fn: () => Promise<void>): Promise<void> {
    historyQueue = historyQueue.then(fn, fn)
    return historyQueue
  }

  ipcMain.handle('apiHistory:list', async () => readJson<ApiHistoryEntry[]>(HISTORY_FILE, []))
  ipcMain.handle('apiHistory:record', async (_e, entry: ApiHistoryEntry) => {
    await queueHistoryWrite(async () => {
      const list = await readJson<ApiHistoryEntry[]>(HISTORY_FILE, [])
      list.unshift(entry)
      await writeJson(HISTORY_FILE, list.slice(0, MAX_HISTORY))
    })
    return true
  })
  ipcMain.handle('apiHistory:clear', async () => {
    await queueHistoryWrite(() => writeJson(HISTORY_FILE, []))
    return true
  })
}
