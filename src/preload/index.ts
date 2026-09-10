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

  history: {
    record: (path: string, content: string) =>
      ipcRenderer.invoke('history:record', { path, content }),
    list: (path: string): Promise<{ id: number; ts: number; size: number }[]> =>
      ipcRenderer.invoke('history:list', { path }),
    read: (path: string, id: number): Promise<string | null> =>
      ipcRenderer.invoke('history:read', { path, id }),
    restore: (path: string, id: number, current: string): Promise<{ ok: boolean; content?: string; message?: string }> =>
      ipcRenderer.invoke('history:restore', { path, id, current }),
    clear: (path: string) => ipcRenderer.invoke('history:clear', { path })
  },

  tasks: {
    discover: (root: string): Promise<any[]> => ipcRenderer.invoke('tasks:discover', { root }),
    configure: (root: string): Promise<string> => ipcRenderer.invoke('tasks:configure', { root })
  },

  git: {
    status: (cwd: string) => ipcRenderer.invoke('git:status', { cwd }),
    init: (cwd: string) => ipcRenderer.invoke('git:init', { cwd }),
    stage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:stage', { cwd, files }),
    unstage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:unstage', { cwd, files }),
    stageAll: (cwd: string) => ipcRenderer.invoke('git:stageAll', { cwd }),
    discard: (cwd: string, files: string[], untracked: string[]) =>
      ipcRenderer.invoke('git:discard', { cwd, files, untracked }),
    commit: (cwd: string, message: string, amend?: boolean) =>
      ipcRenderer.invoke('git:commit', { cwd, message, amend }),
    push: (cwd: string) => ipcRenderer.invoke('git:push', { cwd }),
    pull: (cwd: string) => ipcRenderer.invoke('git:pull', { cwd }),
    log: (cwd: string, limit?: number) => ipcRenderer.invoke('git:log', { cwd, limit }),
    branches: (cwd: string): Promise<{ current: string; local: string[]; remote: string[] }> =>
      ipcRenderer.invoke('git:branches', { cwd }),
    checkout: (cwd: string, branch: string, create?: boolean): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke('git:checkout', { cwd, branch, create })
  },

  update: {
    check: (): Promise<{ version?: string | null; error?: string }> =>
      ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.send('update:install'),
    onAvailable: (cb: Listener<{ version: string; notes: string }>) => on('update:available', cb),
    onDownloaded: (cb: Listener<{ version: string; notes: string }>) => on('update:downloaded', cb),
    onProgress: (cb: Listener<{ percent: number }>) => on('update:progress', cb)
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
