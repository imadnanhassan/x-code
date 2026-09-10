import { store } from '../core/store'
import { openPath, getEditor } from './editor'
import { toast } from './toast'
import { fileIcon } from './icons'

interface Hit {
  file: string
  rel: string
  line: number
  column: number
  preview: string
}

let built = false
const state = { case: false, word: false, regex: false }
let lastHits: Hit[] = []
let debounce: number | undefined

const $panel = () => document.getElementById('search-panel')!

export function initSearch(): void {
  build()
}

export function focusSearch(): void {
  build()
  const input = $panel().querySelector<HTMLInputElement>('#search-query')
  input?.focus()
  input?.select()
}

function build(): void {
  if (built) return
  built = true
  $panel().innerHTML = `
    <div class="search-box">
      <div class="search-field">
        <input id="search-query" type="text" placeholder="Search" spellcheck="false" />
        <div class="search-toggles">
          <button data-t="case" title="Match Case">Aa</button>
          <button data-t="word" title="Match Whole Word">|ab|</button>
          <button data-t="regex" title="Use Regular Expression">.*</button>
        </div>
      </div>
      <div class="search-field">
        <input id="search-replace" type="text" placeholder="Replace" spellcheck="false" />
        <div class="search-toggles">
          <button id="search-replace-all" title="Replace All">&#xE74D;</button>
        </div>
      </div>
      <div class="search-meta" id="search-meta"></div>
    </div>
    <div class="search-results" id="search-results"></div>`

  const q = $panel().querySelector<HTMLInputElement>('#search-query')!
  q.addEventListener('input', () => {
    if (debounce) window.clearTimeout(debounce)
    debounce = window.setTimeout(run, 220)
  })
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run()
  })
  $panel()
    .querySelectorAll<HTMLButtonElement>('.search-toggles button[data-t]')
    .forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.dataset.t as keyof typeof state
        state[k] = !state[k]
        b.classList.toggle('on', state[k])
        run()
      })
    })
  $panel().querySelector('#search-replace-all')!.addEventListener('click', () => void replaceAll())
}

async function run(): Promise<void> {
  const query = $panel().querySelector<HTMLInputElement>('#search-query')!.value
  const results = $panel().querySelector('#search-results')!
  const meta = $panel().querySelector('#search-meta')!
  if (!store.rootPath) {
    meta.textContent = 'Open a folder to search.'
    results.innerHTML = ''
    return
  }
  if (query.trim().length < 2) {
    meta.textContent = ''
    results.innerHTML = ''
    lastHits = []
    return
  }
  meta.textContent = 'Searching…'
  let hits: Hit[]
  try {
    hits = (await window.xcode.search.inFolder(store.rootPath, {
      query,
      caseSensitive: state.case,
      wholeWord: state.word,
      regex: state.regex,
      maxResults: 3000
    })) as Hit[]
  } catch {
    meta.textContent = 'Invalid search.'
    return
  }
  lastHits = hits
  const byFile = new Map<string, Hit[]>()
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, [])
    byFile.get(h.file)!.push(h)
  }
  meta.textContent = `${hits.length} result${hits.length === 1 ? '' : 's'} in ${byFile.size} file${byFile.size === 1 ? '' : 's'}`
  results.innerHTML = ''
  for (const [file, list] of byFile) {
    const group = document.createElement('div')
    group.className = 'sr-group'
    const rel = list[0].rel
    group.innerHTML = `
      <div class="sr-file">
        <span class="sr-file-icon">${fileIcon(rel.split('/').pop() || rel)}</span>
        <span class="sr-file-name">${escapeHtml(rel.split('/').pop() || rel)}</span>
        <span class="sr-file-dir">${escapeHtml(rel.split('/').slice(0, -1).join('/'))}</span>
        <span class="sr-count">${list.length}</span>
      </div>`
    const wrap = document.createElement('div')
    wrap.className = 'sr-lines'
    for (const h of list) {
      const row = document.createElement('div')
      row.className = 'sr-line'
      row.innerHTML = `<span class="sr-ln">${h.line}</span><span class="sr-preview">${escapeHtml(h.preview)}</span>`
      row.addEventListener('click', async () => {
        await openPath(h.file)
        const ed = getEditor()
        if (!ed) return
        ed.revealLineInCenter(h.line)
        ed.setPosition({ lineNumber: h.line, column: h.column })
        ed.focus()
      })
      wrap.appendChild(row)
    }
    group.querySelector('.sr-file')!.addEventListener('click', () => wrap.classList.toggle('collapsed'))
    group.appendChild(wrap)
    results.appendChild(group)
  }
}

async function replaceAll(): Promise<void> {
  const replacement = $panel().querySelector<HTMLInputElement>('#search-replace')!.value
  const query = $panel().querySelector<HTMLInputElement>('#search-query')!.value
  if (!lastHits.length) return toast('Run a search first', 'warn')
  const files = [...new Set(lastHits.map((h) => h.file))]
  if (!window.confirm(`Replace ${lastHits.length} occurrence(s) across ${files.length} file(s)?`)) return

  let flags = 'g'
  if (!state.case) flags += 'i'
  let source = state.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (state.word) source = `\\b${source}\\b`
  let re: RegExp
  try {
    re = new RegExp(source, flags)
  } catch {
    return toast('Invalid pattern', 'error')
  }

  let changed = 0
  for (const file of files) {
    try {
      const content = await window.xcode.fs.read(file)
      const next = content.replace(re, replacement)
      if (next !== content) {
        await window.xcode.fs.write(file, next)
        changed++
      }
    } catch {
      /* skip */
    }
  }
  toast(`Replaced in ${changed} file(s)`, 'ok')
  run()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
