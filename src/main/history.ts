import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'

const ROOT = join(app.getPath('userData'), 'local-history')
const MAX_ENTRIES = 60
const MIN_KEEP = 5
const MAX_AGE_MS = 30 * 24 * 3600 * 1000

interface Entry {
  id: number // timestamp ms, also the snapshot filename stem
  ts: number
  size: number
  hash: string
}

function keyFor(filePath: string): string {
  return createHash('sha1').update(filePath.toLowerCase()).digest('hex').slice(0, 32)
}
function dirFor(filePath: string): string {
  return join(ROOT, keyFor(filePath))
}
function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex')
}

async function readMeta(dir: string): Promise<Entry[]> {
  try {
    return JSON.parse(await fs.readFile(join(dir, 'index.json'), 'utf8'))
  } catch {
    return []
  }
}
async function writeMeta(dir: string, meta: Entry[]): Promise<void> {
  await fs.writeFile(join(dir, 'index.json'), JSON.stringify(meta), 'utf8')
}

async function record(filePath: string, content: string): Promise<void> {
  if (!filePath || content.length > 8 * 1024 * 1024) return
  const dir = dirFor(filePath)
  await fs.mkdir(dir, { recursive: true })
  const meta = await readMeta(dir)
  const h = sha1(content)
  if (meta[0]?.hash === h) return // no change since last snapshot

  const id = Date.now()
  await fs.writeFile(join(dir, id + '.txt'), content, 'utf8')
  meta.unshift({ id, ts: id, size: content.length, hash: h })

  // prune by count + age, but always keep the newest MIN_KEEP
  const now = Date.now()
  const keep: Entry[] = []
  const drop: Entry[] = []
  meta.forEach((e, i) => {
    if (i < MIN_KEEP || (i < MAX_ENTRIES && now - e.ts < MAX_AGE_MS)) keep.push(e)
    else drop.push(e)
  })
  await Promise.all(drop.map((e) => fs.rm(join(dir, e.id + '.txt'), { force: true })))
  // stamp the file's real basename so the picker can show it
  await fs.writeFile(join(dir, 'path.txt'), filePath, 'utf8').catch(() => {})
  await writeMeta(dir, keep)
}

export function registerHistory(): void {
  ipcMain.handle('history:record', (_e, o: { path: string; content: string }) =>
    record(o.path, o.content).then(() => true).catch(() => false)
  )

  ipcMain.handle('history:list', async (_e, o: { path: string }) => {
    const meta = await readMeta(dirFor(o.path))
    return meta.map((m) => ({ id: m.id, ts: m.ts, size: m.size }))
  })

  ipcMain.handle('history:read', async (_e, o: { path: string; id: number }) => {
    try {
      return await fs.readFile(join(dirFor(o.path), o.id + '.txt'), 'utf8')
    } catch {
      return null
    }
  })

  ipcMain.handle('history:restore', async (_e, o: { path: string; id: number; current: string }) => {
    const dir = dirFor(o.path)
    try {
      const snap = await fs.readFile(join(dir, o.id + '.txt'), 'utf8')
      await record(o.path, o.current) // keep a snapshot of what we're replacing
      await fs.writeFile(o.path, snap, 'utf8')
      return { ok: true, content: snap }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('history:clear', async (_e, o: { path: string }) => {
    await fs.rm(dirFor(o.path), { recursive: true, force: true })
    return true
  })
}
