import { bus, Ev } from './bus'

export interface Settings {
  theme: string
  fontFamily: string
  fontSize: number
  lineHeight: number
  tabSize: number
  insertSpaces: boolean
  wordWrap: 'on' | 'off' | 'bounded'
  minimap: boolean
  lineNumbers: 'on' | 'off' | 'relative'
  renderWhitespace: 'none' | 'boundary' | 'all'
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
  cursorStyle: 'line' | 'block' | 'underline'
  smoothScrolling: boolean
  bracketPairColorization: boolean
  formatOnSave: boolean
  autoSave: 'off' | 'afterDelay' | 'onFocusChange'
  autoSaveDelay: number
  stickyScroll: boolean
  fontLigatures: boolean
  emmet: boolean
  snippets: boolean
  pathCompletion: boolean
  errorLens: boolean
  maskEnvValues: boolean
  formatOnPaste: boolean
  organizeImportsOnSave: boolean
  trimTrailingWhitespace: boolean
  insertFinalNewline: boolean
  trimFinalNewlines: boolean
  hardwareAcceleration: boolean
  showMemoryUsage: boolean
  autoCheckUpdates: boolean
  keybindings: Record<string, string>
  sidebarWidth: number
  panelHeight: number
  zoom: number
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'xcode-dark',
  fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, 'Courier New', monospace",
  fontSize: 13,
  lineHeight: 1.6,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: 'off',
  minimap: false,
  lineNumbers: 'on',
  renderWhitespace: 'boundary',
  cursorBlinking: 'smooth',
  cursorStyle: 'line',
  smoothScrolling: true,
  bracketPairColorization: true,
  formatOnSave: false,
  autoSave: 'off',
  autoSaveDelay: 800,
  stickyScroll: true,
  fontLigatures: true,
  emmet: true,
  snippets: true,
  pathCompletion: true,
  errorLens: true,
  maskEnvValues: false,
  formatOnPaste: true,
  organizeImportsOnSave: false,
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
  trimFinalNewlines: false,
  hardwareAcceleration: true,
  showMemoryUsage: false,
  autoCheckUpdates: true,
  keybindings: {},
  sidebarWidth: 260,
  panelHeight: 240,
  zoom: 0
}

export interface RecentFolder {
  path: string
  name: string
  at: number
}

export interface WorkspaceState {
  lastFolder?: string
  recentFolders?: RecentFolder[]
  openFiles?: string[]
  activeFile?: string
}

class Store {
  settings: Settings = { ...DEFAULT_SETTINGS }
  state: WorkspaceState = {}
  rootPath: string | null = null

  private saveTimer: number | undefined

  async load(): Promise<void> {
    const [s, st] = await Promise.all([
      window.xcode.settings.get<Partial<Settings>>(),
      window.xcode.state.get<WorkspaceState>()
    ])
    this.settings = { ...DEFAULT_SETTINGS, ...(s || {}) }
    this.state = st || {}
    window.xcode.settings.onChanged<Partial<Settings>>((incoming) => {
      this.settings = { ...DEFAULT_SETTINGS, ...(incoming || {}) }
      bus.emit(Ev.settingsChanged, this.settings)
    })
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch }
    bus.emit(Ev.settingsChanged, this.settings)
    if (this.saveTimer) window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => {
      void window.xcode.settings.set(this.settings)
    }, 150)
  }

  async persistState(patch: Partial<WorkspaceState>): Promise<void> {
    this.state = { ...this.state, ...patch }
    await window.xcode.state.set(this.state)
  }

  addRecent(path: string): void {
    const name = path.split(/[\\/]/).filter(Boolean).pop() || path
    const list = (this.state.recentFolders || []).filter((r) => r.path !== path)
    list.unshift({ path, name, at: Date.now() })
    void this.persistState({ recentFolders: list.slice(0, 12) })
  }
}

export const store = new Store()
