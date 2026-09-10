import { ipcMain } from 'electron'

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
}
