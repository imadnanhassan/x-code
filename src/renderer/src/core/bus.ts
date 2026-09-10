type Handler = (...args: any[]) => void

class Bus {
  private map = new Map<string, Set<Handler>>()

  on(event: string, fn: Handler): () => void {
    let set = this.map.get(event)
    if (!set) {
      set = new Set()
      this.map.set(event, set)
    }
    set.add(fn)
    return () => set!.delete(fn)
  }

  emit(event: string, ...args: any[]): void {
    this.map.get(event)?.forEach((fn) => {
      try {
        fn(...args)
      } catch (err) {
        console.error(`[bus] handler for "${event}" threw`, err)
      }
    })
  }
}

export const bus = new Bus()

/** App-wide event names (documented in one place). */
export const Ev = {
  workspaceOpened: 'workspace:opened',
  fileOpened: 'file:opened',
  fileActivated: 'file:activated',
  fileClosed: 'file:closed',
  fileSaved: 'file:saved',
  fileDirty: 'file:dirty',
  fsChanged: 'fs:changed',
  settingsChanged: 'settings:changed',
  themeChanged: 'theme:changed',
  cursorMoved: 'editor:cursor',
  layoutChanged: 'layout:changed'
} as const
