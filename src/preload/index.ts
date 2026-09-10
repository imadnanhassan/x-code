import { contextBridge, ipcRenderer } from 'electron'

type Listener<T> = (payload: T) => void

function on<T>(channel: string, cb: Listener<T>): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  // window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximized: (cb: Listener<boolean>) => on('window:maximized', cb),
    setTitle: (t: string) => ipcRenderer.send('app:set-title', t)
  },

  // dialogs
  dialog: {
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-folder'),
    openFile: (): Promise<string[]> => ipcRenderer.invoke('dialog:open-file'),
    saveFile: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:save-file', defaultPath)
  },

  // filesystem
  fs: {
    list: (dir: string) => ipcRenderer.invoke('fs:list', dir),
    read: (file: string): Promise<string> => ipcRenderer.invoke('fs:read', file),
    write: (file: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke('fs:write', file, content),
    createFile: (dir: string, name: string): Promise<string> =>
      ipcRenderer.invoke('fs:create-file', dir, name),
    createDir: (dir: string, name: string): Promise<string> =>
      ipcRenderer.invoke('fs:create-dir', dir, name),
    rename: (oldPath: string, newPath: string): Promise<string> =>
      ipcRenderer.invoke('fs:rename', oldPath, newPath),
    remove: (target: string): Promise<boolean> => ipcRenderer.invoke('fs:delete', target),
    stat: (target: string) => ipcRenderer.invoke('fs:stat', target)
  },

  search: {
    inFolder: (root: string, opts: unknown) => ipcRenderer.invoke('search:folder', root, opts)
  },

  settings: {
    get: <T>(): Promise<T> => ipcRenderer.invoke('settings:get'),
    set: (data: unknown): Promise<boolean> => ipcRenderer.invoke('settings:set', data),
    onChanged: <T>(cb: Listener<T>) => on('settings:changed', cb)
  },

  state: {
    get: <T>(): Promise<T> => ipcRenderer.invoke('state:get'),
    set: (data: unknown): Promise<boolean> => ipcRenderer.invoke('state:set', data)
  },

  app: {
    info: () => ipcRenderer.invoke('app:info'),
    memory: (): Promise<{ totalMB: number; processes: number }> => ipcRenderer.invoke('app:memory')
  },

  os: {
    revealInFolder: (target: string) => ipcRenderer.send('os:reveal', target),
    openPath: (target: string): Promise<string> => ipcRenderer.invoke('os:open-path', target),
    openExternal: (url: string) => ipcRenderer.send('os:open-external', url)
  },

  vscode: {
    findSettings: (): Promise<{ path: string; content: string } | null> =>
      ipcRenderer.invoke('vscode:find-settings'),
    pickSettingsFile: (): Promise<{ path: string; content: string } | null> =>
      ipcRenderer.invoke('vscode:pick-settings')
  },

  update: {
    check: (): Promise<{ version?: string | null; error?: string }> =>
      ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.send('update:install'),
    onAvailable: (cb: Listener<string>) => on('update:available', cb),
    onDownloaded: (cb: Listener<string>) => on('update:downloaded', cb)
  },

  pty: {
    available: (): Promise<{ ok: boolean; error: string }> => ipcRenderer.invoke('pty:available'),
    spawn: (opts: {
      cwd?: string
      cols?: number
      rows?: number
      shell?: string
    }): Promise<{ id: number; error?: string; shell?: string }> =>
      ipcRenderer.invoke('pty:spawn', opts),
    input: (id: number, data: string) => ipcRenderer.send('pty:input', id, data),
    resize: (id: number, cols: number, rows: number) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: number) => ipcRenderer.send('pty:kill', id),
    onData: (cb: Listener<{ id: number; data: string }>) => on('pty:data', cb),
    onExit: (cb: Listener<{ id: number; exitCode: number }>) => on('pty:exit', cb)
  }
}

contextBridge.exposeInMainWorld('xcode', api)

export type XcodeApi = typeof api
