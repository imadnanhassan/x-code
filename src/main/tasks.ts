import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join } from 'path'

export interface Task {
  label: string
  detail?: string
  command: string
  cwd?: string
  source: 'package.json' | 'tasks.json'
  group: 'build' | 'dev' | 'test' | 'other'
}

function groupOf(name: string): Task['group'] {
  if (/^(build|compile|dist|bundle|pack)/i.test(name)) return 'build'
  if (/(dev|start|serve|watch|preview)/i.test(name)) return 'dev'
  if (/(test|spec|lint|check|typecheck|e2e)/i.test(name)) return 'test'
  return 'other'
}

function stripJsonc(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1')
}

async function discover(root: string): Promise<Task[]> {
  const out: Task[] = []

  try {
    const pkg = JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf8'))
    const pm = existsSync(join(root, 'pnpm-lock.yaml'))
      ? 'pnpm'
      : existsSync(join(root, 'yarn.lock'))
        ? 'yarn'
        : existsSync(join(root, 'bun.lockb'))
          ? 'bun'
          : 'npm'
    for (const [name, script] of Object.entries(pkg.scripts || {})) {
      out.push({
        label: name,
        detail: String(script),
        command: `${pm} run ${name}`,
        source: 'package.json',
        group: groupOf(name)
      })
    }
  } catch {
    /* no package.json */
  }

  for (const rel of ['.xcode/tasks.json', '.vscode/tasks.json']) {
    try {
      const j = JSON.parse(stripJsonc(await fs.readFile(join(root, rel), 'utf8')))
      for (const t of j.tasks || []) {
        const cmd =
          t.command && t.args ? `${t.command} ${(t.args || []).join(' ')}` : t.command || t.shellCommand
        if (!cmd) continue
        out.push({
          label: t.label || t.taskName || cmd,
          detail: t.detail,
          command: cmd,
          cwd: t.options?.cwd,
          source: 'tasks.json',
          group: t.group?.kind || t.group || 'other'
        })
      }
    } catch {
      /* none */
    }
  }

  return out
}

const TEMPLATE = `{
  // Xcode tasks — run these from the command palette ("Run Task…") or Ctrl+Shift+B.
  "tasks": [
    {
      "label": "Say hello",
      "command": "echo hello from xcode",
      "group": "other"
    }
  ]
}
`

export function registerTasks(): void {
  ipcMain.handle('tasks:discover', (_e, o: { root: string }) => discover(o.root))

  ipcMain.handle('tasks:configure', async (_e, o: { root: string }) => {
    const dir = join(o.root, '.xcode')
    const file = join(dir, 'tasks.json')
    if (!existsSync(file)) {
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(file, TEMPLATE, 'utf8')
    }
    return file
  })
}
