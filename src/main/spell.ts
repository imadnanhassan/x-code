import { app, ipcMain } from 'electron'
import { promises as fs, readFileSync } from 'fs'
import { dirname, join } from 'path'

declare const require: (id: string) => any

let speller: any = null
let loadErr = ''
const USER_DICT = join(app.getPath('userData'), 'user-dictionary.txt')
const extraWords = new Set<string>()

function load(): void {
  if (speller || loadErr) return
  try {
    const nspell = require('nspell')
    // dictionary-en is ESM — read its Hunspell data files directly
    const base = dirname((require as any).resolve('dictionary-en/package.json'))
    const aff = readFileSync(join(base, 'index.aff'))
    const dic = readFileSync(join(base, 'index.dic'))
    speller = nspell(aff, dic)
    try {
      for (const w of readFileSync(USER_DICT, 'utf8').split(/\r?\n/)) {
        const t = w.trim()
        if (t) {
          extraWords.add(t.toLowerCase())
          speller.add(t)
        }
      }
    } catch {
      /* no user dict yet */
    }
  } catch (err) {
    loadErr = err instanceof Error ? err.message : String(err)
  }
}

function known(word: string): boolean {
  if (extraWords.has(word.toLowerCase())) return true
  return speller.correct(word) || speller.correct(word.toLowerCase())
}

export function registerSpell(): void {
  ipcMain.handle('spell:check', (_e, o: { words: string[] }) => {
    load()
    if (!speller) return { ok: false, bad: [], error: loadErr }
    const bad: string[] = []
    for (const w of o.words) {
      if (w.length < 3 || w.length > 40) continue
      if (!known(w)) bad.push(w)
    }
    return { ok: true, bad }
  })

  ipcMain.handle('spell:suggest', (_e, o: { word: string }) => {
    load()
    if (!speller) return []
    try {
      return (speller.suggest(o.word) as string[]).slice(0, 8)
    } catch {
      return []
    }
  })

  ipcMain.handle('spell:add', async (_e, o: { word: string }) => {
    load()
    const w = (o.word || '').trim()
    if (!w) return false
    extraWords.add(w.toLowerCase())
    try {
      speller?.add(w)
    } catch {
      /* ignore */
    }
    try {
      await fs.appendFile(USER_DICT, w + '\n', 'utf8')
    } catch {
      /* ignore */
    }
    return true
  })
}
