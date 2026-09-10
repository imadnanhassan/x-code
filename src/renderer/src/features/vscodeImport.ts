import { store, Settings } from '../core/store'
import { applyTheme, allThemes } from './themes'
import { toast } from './toast'

/** Tolerant JSONC parse: strips // and /* *\/ comments and trailing commas. */
function parseJsonc(text: string): Record<string, unknown> {
  let out = ''
  let inStr = false
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const n = text[i + 1]
    if (inStr) {
      out += c
      if (c === '\\') {
        out += n
        i++
      } else if (c === quote) {
        inStr = false
      }
      continue
    }
    if (c === '"' || c === "'") {
      inStr = true
      quote = c
      out += c
      continue
    }
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (c === '/' && n === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
      continue
    }
    out += c
  }
  out = out.replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(out)
}

function themeIdFromName(name: string): string | null {
  const n = name.toLowerCase()
  const exact = allThemes().find((t) => t.name.toLowerCase() === n)
  if (exact) return exact.id
  if (n.includes('dracula')) return 'dracula'
  if (n.includes('one dark') || n.includes('onedark')) return 'one-dark'
  if (n.includes('monokai')) return 'monokai'
  if (n.includes('nord')) return 'nord'
  if (n.includes('tokyo')) return 'tokyo-night'
  if (n.includes('solarized') && n.includes('dark')) return 'solarized-dark'
  if (n.includes('github') && n.includes('dark')) return 'github-dark'
  if (n.includes('light') || n.includes('quiet') || n.includes('day')) return 'xcode-light'
  if (n.includes('dark') || n.includes('night') || n.includes('black')) return 'xcode-dark'
  return null
}

function map(vs: Record<string, unknown>): { patch: Partial<Settings>; count: number; theme?: string } {
  const patch: Partial<Settings> = {}
  let count = 0
  const set = <K extends keyof Settings>(k: K, v: Settings[K] | undefined): void => {
    if (v === undefined || v === null) return
    patch[k] = v
    count++
  }
  const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined)
  const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

  set('fontSize', num(vs['editor.fontSize']))
  set('fontFamily', str(vs['editor.fontFamily']))
  const lh = num(vs['editor.lineHeight'])
  if (lh !== undefined && lh > 0) {
    const fs = num(vs['editor.fontSize']) ?? store.settings.fontSize
    set('lineHeight', lh >= 5 ? +(lh / fs).toFixed(2) : lh)
  }
  set('tabSize', num(vs['editor.tabSize']))
  set('insertSpaces', bool(vs['editor.insertSpaces']))

  const ww = str(vs['editor.wordWrap'])
  if (ww) set('wordWrap', ww === 'wordWrapColumn' || ww === 'bounded' ? 'bounded' : ww === 'on' ? 'on' : 'off')

  const mm = vs['editor.minimap.enabled'] ?? (vs['editor.minimap'] as any)?.enabled
  set('minimap', bool(mm))

  const ln = str(vs['editor.lineNumbers'])
  if (ln) set('lineNumbers', ln === 'relative' ? 'relative' : ln === 'off' ? 'off' : 'on')

  const rw = str(vs['editor.renderWhitespace'])
  if (rw) set('renderWhitespace', rw === 'all' || rw === 'trailing' ? 'all' : rw === 'none' ? 'none' : 'boundary')

  const cb = str(vs['editor.cursorBlinking'])
  if (cb && ['blink', 'smooth', 'phase', 'expand', 'solid'].includes(cb)) set('cursorBlinking', cb as any)
  const cs = str(vs['editor.cursorStyle'])
  if (cs) set('cursorStyle', cs.startsWith('block') ? 'block' : cs.startsWith('underline') ? 'underline' : 'line')

  set('smoothScrolling', bool(vs['editor.smoothScrolling']))
  const bpc = vs['editor.bracketPairColorization.enabled'] ?? (vs['editor.bracketPairColorization'] as any)?.enabled
  set('bracketPairColorization', bool(bpc))
  set('formatOnSave', bool(vs['editor.formatOnSave']))
  set('formatOnPaste', bool(vs['editor.formatOnPaste']))
  const ss = vs['editor.stickyScroll.enabled'] ?? (vs['editor.stickyScroll'] as any)?.enabled
  set('stickyScroll', bool(ss))
  const fl = vs['editor.fontLigatures']
  if (fl !== undefined) set('fontLigatures', !!fl && fl !== 'false')

  const as = str(vs['files.autoSave'])
  if (as) set('autoSave', as === 'afterDelay' ? 'afterDelay' : as === 'off' ? 'off' : 'onFocusChange')
  set('autoSaveDelay', num(vs['files.autoSaveDelay']))
  set('trimTrailingWhitespace', bool(vs['files.trimTrailingWhitespace']))
  set('insertFinalNewline', bool(vs['files.insertFinalNewline']))
  set('trimFinalNewlines', bool(vs['files.trimFinalNewlines']))

  const emmet = str((vs['emmet.showExpandedAbbreviation'] as string) ?? '')
  if (emmet) set('emmet', emmet !== 'never')

  const zl = num(vs['window.zoomLevel'])
  if (zl !== undefined) set('zoom', Math.max(-6, Math.min(12, Math.round(zl))))

  let theme: string | undefined
  const ct = str(vs['workbench.colorTheme'])
  if (ct) {
    const id = themeIdFromName(ct)
    if (id) {
      theme = id
      set('theme', id)
    }
  }
  return { patch, count, theme }
}

export async function importVSCodeSettings(): Promise<void> {
  let src = await window.xcode.vscode.findSettings()
  if (!src) src = await window.xcode.vscode.pickSettingsFile()
  if (!src) {
    toast('No VS Code settings.json found', 'warn')
    return
  }
  let parsed: Record<string, unknown>
  try {
    parsed = parseJsonc(src.content)
  } catch {
    toast('Could not parse that settings.json', 'error')
    return
  }
  const { patch, count, theme } = map(parsed)
  if (!count) {
    toast('Nothing importable in that file', 'warn')
    return
  }
  store.updateSettings(patch)
  if (theme) applyTheme(theme)
  toast(`Imported ${count} setting${count === 1 ? '' : 's'} from VS Code`, 'ok')
}
