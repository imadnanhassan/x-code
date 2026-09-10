import { store } from '../core/store'
import { openPicker } from './commands'
import { runInTerminal } from './terminal'
import { openPath } from './editor'
import { toast } from './toast'

interface Task {
  label: string
  detail?: string
  command: string
  cwd?: string
  source: 'package.json' | 'tasks.json'
  group: string
}

let lastCommand: string | null = null

const GROUP_ICON: Record<string, string> = {
  build: '⚙',
  dev: '▶',
  test: '✓',
  other: '→'
}

function run(t: Task): void {
  const cmd = t.cwd ? `cd ${JSON.stringify(t.cwd)} && ${t.command}` : t.command
  lastCommand = cmd
  runInTerminal(cmd)
}

export async function runTask(): Promise<void> {
  if (!store.rootPath) {
    toast('Open a folder first', 'warn')
    return
  }
  const tasks = (await window.xcode.tasks.discover(store.rootPath)) as Task[]
  const items = tasks.map((t) => ({
    label: `${GROUP_ICON[t.group] || '→'}  ${t.label}`,
    description: t.command,
    hint: t.source === 'package.json' ? 'npm script' : 'tasks.json',
    run: () => run(t)
  }))
  items.push({
    label: '+  Configure Tasks…',
    description: 'create .xcode/tasks.json',
    hint: '',
    run: () => void configureTasks()
  })
  openPicker({ placeholder: 'Run a task', items, matchOnDescription: true })
}

export function rerunLastTask(): void {
  if (lastCommand) runInTerminal(lastCommand)
  else void runTask()
}

export async function configureTasks(): Promise<void> {
  if (!store.rootPath) {
    toast('Open a folder first', 'warn')
    return
  }
  const file = await window.xcode.tasks.configure(store.rootPath)
  await openPath(file)
}
