import { store, DEFAULT_SETTINGS, Settings } from '../core/store'
import { allThemes, applyTheme } from './themes'
import { toast } from './toast'

let built = false
const $panel = () => document.getElementById('settings-panel')!

type FieldType = 'select' | 'number' | 'text' | 'toggle'
interface Field {
  key: keyof Settings
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
  group: string
  note?: string
}

const FIELDS: Field[] = [
  { key: 'theme', label: 'Color Theme', type: 'select', group: 'Appearance', options: allThemes().map((t) => ({ value: t.id, label: t.name })) },
  { key: 'fontFamily', label: 'Font Family', type: 'text', group: 'Appearance' },
  { key: 'fontSize', label: 'Font Size', type: 'number', min: 8, max: 40, step: 1, group: 'Appearance' },
  { key: 'lineHeight', label: 'Line Height (×)', type: 'number', min: 1, max: 3, step: 0.05, group: 'Appearance' },
  { key: 'fontLigatures', label: 'Font Ligatures', type: 'toggle', group: 'Appearance' },
  { key: 'minimap', label: 'Minimap', type: 'toggle', group: 'Appearance' },
  { key: 'stickyScroll', label: 'Sticky Scroll', type: 'toggle', group: 'Appearance' },
  {
    key: 'lineNumbers', label: 'Line Numbers', type: 'select', group: 'Appearance',
    options: [
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
      { value: 'relative', label: 'Relative' }
    ]
  },
  {
    key: 'renderWhitespace', label: 'Render Whitespace', type: 'select', group: 'Appearance',
    options: [
      { value: 'none', label: 'None' },
      { value: 'boundary', label: 'Boundary' },
      { value: 'all', label: 'All' }
    ]
  },
  {
    key: 'cursorStyle', label: 'Cursor Style', type: 'select', group: 'Appearance',
    options: ['line', 'block', 'underline'].map((v) => ({ value: v, label: v }))
  },
  {
    key: 'cursorBlinking', label: 'Cursor Blinking', type: 'select', group: 'Appearance',
    options: ['blink', 'smooth', 'phase', 'expand', 'solid'].map((v) => ({ value: v, label: v }))
  },

  { key: 'tabSize', label: 'Tab Size', type: 'number', min: 1, max: 8, step: 1, group: 'Editing' },
  { key: 'insertSpaces', label: 'Insert Spaces', type: 'toggle', group: 'Editing' },
  {
    key: 'wordWrap', label: 'Word Wrap', type: 'select', group: 'Editing',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'on', label: 'On' },
      { value: 'bounded', label: 'Bounded' }
    ]
  },
  { key: 'bracketPairColorization', label: 'Bracket Pair Colors', type: 'toggle', group: 'Editing' },
  { key: 'smoothScrolling', label: 'Smooth Scrolling', type: 'toggle', group: 'Editing' },
  { key: 'emmet', label: 'Emmet (HTML/CSS abbreviations)', type: 'toggle', group: 'Editing', note: 'Type div.card>ul>li*3 then Tab. Disabling takes effect after restart.' },
  { key: 'formatOnSave', label: 'Format On Save', type: 'toggle', group: 'Editing' },
  { key: 'formatOnPaste', label: 'Format On Paste', type: 'toggle', group: 'Editing' },
  { key: 'trimTrailingWhitespace', label: 'Trim Trailing Whitespace On Save', type: 'toggle', group: 'Editing' },
  { key: 'insertFinalNewline', label: 'Insert Final Newline On Save', type: 'toggle', group: 'Editing' },
  { key: 'trimFinalNewlines', label: 'Trim Final Newlines On Save', type: 'toggle', group: 'Editing' },
  {
    key: 'autoSave', label: 'Auto Save', type: 'select', group: 'Editing',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'afterDelay', label: 'After Delay' },
      { value: 'onFocusChange', label: 'On Focus Change' }
    ]
  },
  { key: 'autoSaveDelay', label: 'Auto Save Delay (ms)', type: 'number', min: 200, max: 10000, step: 100, group: 'Editing' },

  { key: 'hardwareAcceleration', label: 'Hardware Acceleration', type: 'toggle', group: 'Performance', note: 'Turning this off drops the GPU process and lowers RAM by ~40–80 MB. Restart required.' },
  { key: 'showMemoryUsage', label: 'Show Memory in Status Bar', type: 'toggle', group: 'Performance' },
  { key: 'autoCheckUpdates', label: 'Automatically Check for Updates', type: 'toggle', group: 'Performance' }
]

export function initSettingsPanel(): void {
  build()
}

export function focusSettings(): void {
  build()
}

function build(): void {
  if (built) {
    sync()
    return
  }
  built = true
  const groups = [...new Set(FIELDS.map((f) => f.group))]
  const html = groups
    .map((g) => {
      const rows = FIELDS.filter((f) => f.group === g)
        .map((f) => fieldHtml(f))
        .join('')
      return `<div class="settings-group"><h3>${g}</h3>${rows}</div>`
    })
    .join('')
  $panel().innerHTML =
    html +
    `<div class="settings-group">
       <h3>Shortcuts</h3>
       <button class="btn" id="settings-open-keys">Open Keyboard Shortcuts</button>
       <div class="settings-note">Every command's key binding — click one to remap it.</div>
     </div>
     <div class="settings-group">
       <h3>Migrate</h3>
       <button class="btn" id="settings-import-vscode">Import VS Code Settings</button>
       <div class="settings-note">Reads your VS Code <code>settings.json</code> (font, theme, tabs, format-on-save, …) and maps it across.</div>
     </div>
     <div class="settings-group">
       <button class="btn ghost" id="settings-reset">Reset all to defaults</button>
     </div>`

  $panel()
    .querySelectorAll<HTMLElement>('[data-key]')
    .forEach((el) => {
      const key = el.dataset.key as keyof Settings
      const field = FIELDS.find((f) => f.key === key)!
      const handler = (): void => {
        let value: any
        if (field.type === 'toggle') value = (el as HTMLInputElement).checked
        else if (field.type === 'number') value = Number((el as HTMLInputElement).value)
        else value = (el as HTMLInputElement).value
        store.updateSettings({ [key]: value } as Partial<Settings>)
        if (key === 'theme') applyTheme(value)
        if (key === 'hardwareAcceleration') toast('Restart Xcode to apply this change', 'info')
      }
      el.addEventListener(field.type === 'text' ? 'change' : 'input', handler)
    })

  $panel().querySelector('#settings-reset')!.addEventListener('click', () => {
    store.updateSettings({ ...DEFAULT_SETTINGS })
    applyTheme(DEFAULT_SETTINGS.theme)
    sync()
    toast('Settings reset to defaults', 'ok')
  })

  $panel().querySelector('#settings-import-vscode')!.addEventListener('click', async () => {
    const { importVSCodeSettings } = await import('./vscodeImport')
    await importVSCodeSettings()
    sync()
  })

  $panel().querySelector('#settings-open-keys')!.addEventListener('click', async () => {
    const { openKeymapEditor } = await import('./keymapEditor')
    openKeymapEditor()
  })

  sync()
}

function fieldHtml(f: Field): string {
  const id = `set-${f.key}`
  let control = ''
  if (f.type === 'toggle') {
    control = `<label class="switch"><input type="checkbox" id="${id}" data-key="${f.key}"><span></span></label>`
  } else if (f.type === 'select') {
    control = `<select id="${id}" data-key="${f.key}">${f
      .options!.map((o) => `<option value="${o.value}">${o.label}</option>`)
      .join('')}</select>`
  } else if (f.type === 'number') {
    control = `<input type="number" id="${id}" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}">`
  } else {
    control = `<input type="text" id="${id}" data-key="${f.key}" spellcheck="false">`
  }
  const note = f.note ? `<div class="settings-note">${f.note}</div>` : ''
  return `<div class="settings-row"><label for="${id}">${f.label}</label>${control}</div>${note}`
}

function sync(): void {
  FIELDS.forEach((f) => {
    const el = $panel().querySelector<HTMLInputElement>(`[data-key="${f.key}"]`)
    if (!el) return
    const val = store.settings[f.key] as any
    if (f.type === 'toggle') el.checked = !!val
    else el.value = String(val)
  })
}
