import * as monaco from 'monaco-editor'
import { bus, Ev } from '../core/bus'
import { store } from '../core/store'

export interface Palette {
  type: 'dark' | 'light'
  bg: string
  bgAlt: string
  bgElevated: string
  bgInput: string
  fg: string
  fgMuted: string
  fgFaint: string
  border: string
  accent: string
  accentFg: string
  selection: string
  lineHighlight: string
  scrollbar: string
  error: string
  warn: string
  info: string
  ok: string
  // syntax
  comment: string
  string: string
  keyword: string
  number: string
  func: string
  entity: string
  variable: string
  constant: string
  operator: string
  tag: string
  attribute: string
  regexp: string
}

export interface Theme {
  id: string
  name: string
  palette: Palette
}

const THEMES: Theme[] = [
  {
    id: 'xcode-dark',
    name: 'Xcode Dark',
    palette: {
      type: 'dark',
      bg: '#1e1e2e', bgAlt: '#181825', bgElevated: '#252537', bgInput: '#11111b',
      fg: '#cdd6f4', fgMuted: '#a6adc8', fgFaint: '#6c7086',
      border: '#313244', accent: '#89b4fa', accentFg: '#11111b',
      selection: '#3b3f52', lineHighlight: '#2a2b3c', scrollbar: '#45475a',
      error: '#f38ba8', warn: '#f9e2af', info: '#89b4fa', ok: '#a6e3a1',
      comment: '#7f849c', string: '#a6e3a1', keyword: '#cba6f7', number: '#fab387',
      func: '#89b4fa', entity: '#f9e2af', variable: '#cdd6f4', constant: '#fab387',
      operator: '#89dceb', tag: '#f38ba8', attribute: '#f9e2af', regexp: '#f5c2e7'
    }
  },
  {
    id: 'xcode-light',
    name: 'Xcode Light',
    palette: {
      type: 'light',
      bg: '#ffffff', bgAlt: '#f3f3f3', bgElevated: '#f8f8f8', bgInput: '#ffffff',
      fg: '#1f2328', fgMuted: '#57606a', fgFaint: '#8c959f',
      border: '#d8dee4', accent: '#0969da', accentFg: '#ffffff',
      selection: '#cfe4ff', lineHighlight: '#f2f6ff', scrollbar: '#c4c4c4',
      error: '#cf222e', warn: '#9a6700', info: '#0969da', ok: '#1a7f37',
      comment: '#6e7781', string: '#0a3069', keyword: '#cf222e', number: '#0550ae',
      func: '#8250df', entity: '#953800', variable: '#1f2328', constant: '#0550ae',
      operator: '#0550ae', tag: '#116329', attribute: '#0550ae', regexp: '#0a3069'
    }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    palette: {
      type: 'dark',
      bg: '#282a36', bgAlt: '#21222c', bgElevated: '#2f3140', bgInput: '#1e1f29',
      fg: '#f8f8f2', fgMuted: '#c7c7d1', fgFaint: '#6272a4',
      border: '#343746', accent: '#bd93f9', accentFg: '#282a36',
      selection: '#44475a', lineHighlight: '#313342', scrollbar: '#565872',
      error: '#ff5555', warn: '#f1fa8c', info: '#8be9fd', ok: '#50fa7b',
      comment: '#6272a4', string: '#f1fa8c', keyword: '#ff79c6', number: '#bd93f9',
      func: '#50fa7b', entity: '#8be9fd', variable: '#f8f8f2', constant: '#bd93f9',
      operator: '#ff79c6', tag: '#ff79c6', attribute: '#50fa7b', regexp: '#f1fa8c'
    }
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    palette: {
      type: 'dark',
      bg: '#282c34', bgAlt: '#21252b', bgElevated: '#2f343d', bgInput: '#1b1d23',
      fg: '#abb2bf', fgMuted: '#9199a5', fgFaint: '#5c6370',
      border: '#3a3f4b', accent: '#61afef', accentFg: '#282c34',
      selection: '#3e4451', lineHighlight: '#2c313a', scrollbar: '#4b515d',
      error: '#e06c75', warn: '#e5c07b', info: '#61afef', ok: '#98c379',
      comment: '#5c6370', string: '#98c379', keyword: '#c678dd', number: '#d19a66',
      func: '#61afef', entity: '#e5c07b', variable: '#e06c75', constant: '#d19a66',
      operator: '#56b6c2', tag: '#e06c75', attribute: '#d19a66', regexp: '#98c379'
    }
  },
  {
    id: 'monokai',
    name: 'Monokai',
    palette: {
      type: 'dark',
      bg: '#272822', bgAlt: '#1f201a', bgElevated: '#31322c', bgInput: '#1c1d17',
      fg: '#f8f8f2', fgMuted: '#cfcfc2', fgFaint: '#75715e',
      border: '#3b3c35', accent: '#a6e22e', accentFg: '#272822',
      selection: '#49483e', lineHighlight: '#3e3d32', scrollbar: '#5a5b52',
      error: '#f92672', warn: '#e6db74', info: '#66d9ef', ok: '#a6e22e',
      comment: '#75715e', string: '#e6db74', keyword: '#f92672', number: '#ae81ff',
      func: '#a6e22e', entity: '#66d9ef', variable: '#f8f8f2', constant: '#ae81ff',
      operator: '#f92672', tag: '#f92672', attribute: '#a6e22e', regexp: '#e6db74'
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    palette: {
      type: 'dark',
      bg: '#2e3440', bgAlt: '#272c36', bgElevated: '#3b4252', bgInput: '#232831',
      fg: '#d8dee9', fgMuted: '#b8c0cf', fgFaint: '#7b8494',
      border: '#3b4252', accent: '#88c0d0', accentFg: '#2e3440',
      selection: '#434c5e', lineHighlight: '#353c4a', scrollbar: '#4c566a',
      error: '#bf616a', warn: '#ebcb8b', info: '#81a1c1', ok: '#a3be8c',
      comment: '#616e88', string: '#a3be8c', keyword: '#81a1c1', number: '#b48ead',
      func: '#88c0d0', entity: '#8fbcbb', variable: '#d8dee9', constant: '#b48ead',
      operator: '#81a1c1', tag: '#81a1c1', attribute: '#8fbcbb', regexp: '#ebcb8b'
    }
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    palette: {
      type: 'dark',
      bg: '#1a1b26', bgAlt: '#16161e', bgElevated: '#22232f', bgInput: '#13131a',
      fg: '#a9b1d6', fgMuted: '#9aa2c6', fgFaint: '#565f89',
      border: '#292e42', accent: '#7aa2f7', accentFg: '#1a1b26',
      selection: '#2e3c64', lineHighlight: '#232433', scrollbar: '#3b4261',
      error: '#f7768e', warn: '#e0af68', info: '#7aa2f7', ok: '#9ece6a',
      comment: '#565f89', string: '#9ece6a', keyword: '#bb9af7', number: '#ff9e64',
      func: '#7aa2f7', entity: '#2ac3de', variable: '#c0caf5', constant: '#ff9e64',
      operator: '#89ddff', tag: '#f7768e', attribute: '#bb9af7', regexp: '#b4f9f8'
    }
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    palette: {
      type: 'dark',
      bg: '#002b36', bgAlt: '#00252e', bgElevated: '#073642', bgInput: '#001f27',
      fg: '#93a1a1', fgMuted: '#839496', fgFaint: '#586e75',
      border: '#0b3c48', accent: '#268bd2', accentFg: '#002b36',
      selection: '#0d4a58', lineHighlight: '#073642', scrollbar: '#245562',
      error: '#dc322f', warn: '#b58900', info: '#268bd2', ok: '#859900',
      comment: '#586e75', string: '#2aa198', keyword: '#859900', number: '#d33682',
      func: '#268bd2', entity: '#b58900', variable: '#93a1a1', constant: '#cb4b16',
      operator: '#859900', tag: '#268bd2', attribute: '#93a1a1', regexp: '#dc322f'
    }
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    palette: {
      type: 'dark',
      bg: '#0d1117', bgAlt: '#010409', bgElevated: '#161b22', bgInput: '#010409',
      fg: '#e6edf3', fgMuted: '#b1bac4', fgFaint: '#7d8590',
      border: '#30363d', accent: '#2f81f7', accentFg: '#ffffff',
      selection: '#264b7f', lineHighlight: '#161b22', scrollbar: '#484f58',
      error: '#ff7b72', warn: '#d29922', info: '#2f81f7', ok: '#3fb950',
      comment: '#8b949e', string: '#a5d6ff', keyword: '#ff7b72', number: '#79c0ff',
      func: '#d2a8ff', entity: '#ffa657', variable: '#ffa657', constant: '#79c0ff',
      operator: '#ff7b72', tag: '#7ee787', attribute: '#79c0ff', regexp: '#7ee787'
    }
  }
]

export function allThemes(): Theme[] {
  return THEMES
}

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) || THEMES[0]
}

function toMonaco(theme: Theme): monaco.editor.IStandaloneThemeData {
  const p = theme.palette
  const hex = (c: string): string => c.replace('#', '').slice(0, 6)
  return {
    base: p.type === 'light' ? 'vs' : 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: hex(p.fg), background: hex(p.bg) },
      { token: 'comment', foreground: hex(p.comment), fontStyle: 'italic' },
      { token: 'string', foreground: hex(p.string) },
      { token: 'string.escape', foreground: hex(p.regexp) },
      { token: 'regexp', foreground: hex(p.regexp) },
      { token: 'keyword', foreground: hex(p.keyword) },
      { token: 'keyword.control', foreground: hex(p.keyword) },
      { token: 'storage', foreground: hex(p.keyword) },
      { token: 'storage.type', foreground: hex(p.keyword) },
      { token: 'number', foreground: hex(p.number) },
      { token: 'constant', foreground: hex(p.constant) },
      { token: 'constant.numeric', foreground: hex(p.number) },
      { token: 'constant.language', foreground: hex(p.constant) },
      { token: 'variable', foreground: hex(p.variable) },
      { token: 'variable.parameter', foreground: hex(p.fg) },
      { token: 'variable.predefined', foreground: hex(p.constant) },
      { token: 'function', foreground: hex(p.func) },
      { token: 'entity.name.function', foreground: hex(p.func) },
      { token: 'support.function', foreground: hex(p.func) },
      { token: 'type', foreground: hex(p.entity) },
      { token: 'type.identifier', foreground: hex(p.entity) },
      { token: 'entity.name.type', foreground: hex(p.entity) },
      { token: 'entity.name.class', foreground: hex(p.entity) },
      { token: 'interface', foreground: hex(p.entity) },
      { token: 'namespace', foreground: hex(p.entity) },
      { token: 'operator', foreground: hex(p.operator) },
      { token: 'delimiter', foreground: hex(p.fgMuted) },
      { token: 'delimiter.bracket', foreground: hex(p.fg) },
      { token: 'tag', foreground: hex(p.tag) },
      { token: 'metatag', foreground: hex(p.tag) },
      { token: 'attribute.name', foreground: hex(p.attribute) },
      { token: 'attribute.value', foreground: hex(p.string) },
      { token: 'key', foreground: hex(p.func) },
      { token: 'string.key.json', foreground: hex(p.func) },
      { token: 'string.value.json', foreground: hex(p.string) }
    ],
    colors: {
      'editor.background': p.bg,
      'editor.foreground': p.fg,
      'editorCursor.foreground': p.accent,
      'editor.lineHighlightBackground': p.lineHighlight,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': p.selection,
      'editor.inactiveSelectionBackground': p.selection + '99',
      'editorLineNumber.foreground': p.fgFaint,
      'editorLineNumber.activeForeground': p.fgMuted,
      'editorIndentGuide.background1': p.border,
      'editorIndentGuide.activeBackground1': p.fgFaint,
      'editorWhitespace.foreground': p.border,
      'editorGutter.background': p.bg,
      'editorWidget.background': p.bgElevated,
      'editorWidget.border': p.border,
      'editorHoverWidget.background': p.bgElevated,
      'editorHoverWidget.border': p.border,
      'editorSuggestWidget.background': p.bgElevated,
      'editorSuggestWidget.border': p.border,
      'editorSuggestWidget.selectedBackground': p.selection,
      'input.background': p.bgInput,
      'input.border': p.border,
      'dropdown.background': p.bgElevated,
      'list.hoverBackground': p.lineHighlight,
      'list.activeSelectionBackground': p.selection,
      'list.focusBackground': p.selection,
      'scrollbarSlider.background': p.scrollbar + '66',
      'scrollbarSlider.hoverBackground': p.scrollbar + '99',
      'scrollbarSlider.activeBackground': p.scrollbar + 'cc',
      'minimap.background': p.bg,
      'editorBracketMatch.background': p.selection,
      'editorBracketMatch.border': p.accent,
      'editorError.foreground': p.error,
      'editorWarning.foreground': p.warn,
      'editorInfo.foreground': p.info
    }
  }
}

let registered = false
function registerAll(): void {
  if (registered) return
  registered = true
  for (const t of THEMES) {
    monaco.editor.defineTheme(t.id, toMonaco(t))
  }
}

function applyUiVars(theme: Theme): void {
  const p = theme.palette
  const r = document.documentElement.style
  const set = (k: string, v: string): void => r.setProperty(k, v)
  set('--bg', p.bg)
  set('--bg-alt', p.bgAlt)
  set('--bg-elevated', p.bgElevated)
  set('--bg-input', p.bgInput)
  set('--fg', p.fg)
  set('--fg-muted', p.fgMuted)
  set('--fg-faint', p.fgFaint)
  set('--border', p.border)
  set('--accent', p.accent)
  set('--accent-fg', p.accentFg)
  set('--selection', p.selection)
  set('--line-highlight', p.lineHighlight)
  set('--scrollbar', p.scrollbar)
  set('--error', p.error)
  set('--warn', p.warn)
  set('--info', p.info)
  set('--ok', p.ok)
  set('--syntax-keyword', p.keyword)
  set('--syntax-string', p.string)
  set('--syntax-func', p.func)
  document.documentElement.dataset.themeType = p.type
  document.documentElement.dataset.theme = theme.id
}

export function applyTheme(id: string): void {
  registerAll()
  const theme = getTheme(id)
  applyUiVars(theme)
  monaco.editor.setTheme(theme.id)
  if (store.settings.theme !== id) store.updateSettings({ theme: id })
  bus.emit(Ev.themeChanged, theme)
}

export function initThemes(): void {
  registerAll()
  applyTheme(store.settings.theme)
}
