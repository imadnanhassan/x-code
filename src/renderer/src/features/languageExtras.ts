import { monaco } from './monaco'
import { store } from '../core/store'
import { bus, Ev } from '../core/bus'
import { openPath } from './editor'

/* ------------------------------------------------------------------ *
 *  Snippets  (built-in + workspace .xcode/snippets.json)
 * ------------------------------------------------------------------ */

interface Snip {
  prefix: string
  body: string
  description?: string
}

const JS_TS: Snip[] = [
  { prefix: 'cl', body: 'console.log($1)$0', description: 'console.log' },
  { prefix: 'clj', body: "console.log('$1', $1)$0", description: 'console.log labelled' },
  { prefix: 'fn', body: 'function ${1:name}(${2:args}) {\n\t$0\n}', description: 'function' },
  { prefix: 'af', body: 'const ${1:name} = (${2:args}) => {\n\t$0\n}', description: 'arrow function' },
  { prefix: 'afe', body: 'const ${1:name} = async (${2:args}) => {\n\t$0\n}', description: 'async arrow function' },
  { prefix: 'imp', body: "import { $2 } from '$1'$0", description: 'import { } from' },
  { prefix: 'impd', body: "import $2 from '$1'$0", description: 'import default' },
  { prefix: 'tc', body: 'try {\n\t$1\n} catch (${2:err}) {\n\t$0\n}', description: 'try / catch' },
  { prefix: 'fe', body: '${1:list}.forEach((${2:item}) => {\n\t$0\n})', description: 'forEach' },
  { prefix: 'map', body: '${1:list}.map((${2:item}) => $0)', description: 'map' },
  { prefix: 'fil', body: '${1:list}.filter((${2:item}) => $0)', description: 'filter' },
  { prefix: 'red', body: '${1:list}.reduce((${2:acc}, ${3:cur}) => $0, ${4:init})', description: 'reduce' },
  { prefix: 'prom', body: 'new Promise((resolve, reject) => {\n\t$0\n})', description: 'new Promise' },
  { prefix: 'setto', body: 'setTimeout(() => {\n\t$0\n}, ${1:200})', description: 'setTimeout' },
  { prefix: 'jsonp', body: 'JSON.parse($1)$0', description: 'JSON.parse' },
  { prefix: 'jsons', body: 'JSON.stringify($1, null, 2)$0', description: 'JSON.stringify' }
]

const REACT: Snip[] = [
  {
    prefix: 'rfc',
    body:
      "export default function ${1:Component}() {\n\treturn (\n\t\t<div>$0</div>\n\t)\n}",
    description: 'React function component'
  },
  {
    prefix: 'rfce',
    body:
      "function ${1:Component}({ $2 }) {\n\treturn (\n\t\t<div>$0</div>\n\t)\n}\n\nexport default ${1:Component}",
    description: 'React component w/ props'
  },
  { prefix: 'us', body: 'const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = useState(${2:null})$0', description: 'useState' },
  { prefix: 'ue', body: 'useEffect(() => {\n\t$0\n}, [$1])', description: 'useEffect' },
  { prefix: 'ucb', body: 'const ${1:fn} = useCallback((${2:args}) => {\n\t$0\n}, [$3])', description: 'useCallback' },
  { prefix: 'um', body: 'const ${1:value} = useMemo(() => $0, [$2])', description: 'useMemo' }
]

const HTML_SNIPS: Snip[] = [
  {
    prefix: 'html5',
    body:
      '<!doctype html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8" />\n\t<meta name="viewport" content="width=device-width, initial-scale=1" />\n\t<title>${1:Document}</title>\n</head>\n<body>\n\t$0\n</body>\n</html>',
    description: 'HTML5 boilerplate'
  }
]

const BUILT_IN: Record<string, Snip[]> = {
  javascript: [...JS_TS, ...REACT],
  typescript: [...JS_TS, ...REACT],
  html: HTML_SNIPS
}

let userSnips: Record<string, Snip[]> = {}

async function loadUserSnippets(): Promise<void> {
  userSnips = {}
  if (!store.rootPath) return
  try {
    const raw = await window.xcode.fs.read(store.rootPath + '/.xcode/snippets.json')
    const j = JSON.parse(raw.replace(/\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'))
    for (const [lang, arr] of Object.entries(j)) {
      if (Array.isArray(arr)) {
        userSnips[lang] = (arr as any[])
          .map((s) => ({
            prefix: s.prefix,
            body: Array.isArray(s.body) ? s.body.join('\n') : String(s.body ?? ''),
            description: s.description
          }))
          .filter((s) => s.prefix && s.body)
      }
    }
  } catch {
    /* no user snippets */
  }
}

function snippetProvider(): monaco.languages.CompletionItemProvider {
  return {
    provideCompletionItems(model, position) {
      if (!store.settings.snippets) return { suggestions: [] }
      const lang = model.getLanguageId()
      const jsLike = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(lang)
      const key = jsLike ? (lang.includes('type') ? 'typescript' : 'javascript') : lang
      const list = [...(BUILT_IN[key] || []), ...(userSnips[lang] || []), ...(userSnips[key] || [])]
      if (!list.length) return { suggestions: [] }
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      return {
        suggestions: list.map((s) => ({
          label: s.prefix,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: s.description || 'snippet',
          documentation: { value: '```\n' + s.body.replace(/\$\{?\d+:?|\}/g, '') + '\n```' },
          range
        }))
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Path completion inside string literals ('./  ../  /)
 * ------------------------------------------------------------------ */

const dirCache = new Map<string, { name: string; isDirectory: boolean }[]>()

function pathProvider(): monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['/', '.'],
    async provideCompletionItems(model, position) {
      if (!store.settings.pathCompletion || !model.uri.fsPath) return { suggestions: [] }
      const line = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      })
      const m = line.match(/(['"`])([^'"`]*?)$/)
      if (!m) return { suggestions: [] }
      let frag = m[2]
      if (!/^\.{0,2}\//.test(frag) && !frag.startsWith('/')) return { suggestions: [] }

      const fileDir = model.uri.fsPath.replace(/[\\/][^\\/]*$/, '')
      const sep = fileDir.includes('\\') ? '\\' : '/'
      let baseRel = frag
      let typed = ''
      const lastSlash = frag.lastIndexOf('/')
      if (lastSlash >= 0) {
        baseRel = frag.slice(0, lastSlash + 1)
        typed = frag.slice(lastSlash + 1)
      }
      let dir: string
      if (frag.startsWith('/') && store.rootPath) dir = store.rootPath + baseRel.replace(/\//g, sep)
      else dir = fileDir + sep + baseRel.replace(/\//g, sep)
      dir = dir.replace(new RegExp(`\\${sep}$`), '')

      let entries = dirCache.get(dir)
      if (!entries) {
        try {
          entries = ((await window.xcode.fs.list(dir)) as any[]).map((e) => ({
            name: e.name,
            isDirectory: e.isDirectory
          }))
          dirCache.set(dir, entries)
          setTimeout(() => dirCache.delete(dir), 4000)
        } catch {
          return { suggestions: [] }
        }
      }

      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber,
        position.column - typed.length,
        position.lineNumber,
        word.endColumn
      )
      return {
        suggestions: entries
          .filter((e) => !e.name.startsWith('.') || typed.startsWith('.'))
          .map((e) => ({
            label: e.isDirectory ? e.name + '/' : e.name,
            kind: e.isDirectory
              ? monaco.languages.CompletionItemKind.Folder
              : monaco.languages.CompletionItemKind.File,
            insertText: e.isDirectory ? e.name + '/' : e.name,
            command: e.isDirectory
              ? { id: 'editor.action.triggerSuggest', title: '' }
              : undefined,
            range,
            sortText: (e.isDirectory ? '0' : '1') + e.name
          }))
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 *  .env variable suggestions after process.env.  /  import.meta.env.
 * ------------------------------------------------------------------ */

let envKeys: string[] = []

async function loadEnvKeys(): Promise<void> {
  envKeys = []
  if (!store.rootPath) return
  try {
    const list = (await window.xcode.fs.list(store.rootPath)) as any[]
    const files = list.filter((e) => !e.isDirectory && /^\.env(\.|$)/.test(e.name)).map((e) => e.path)
    const seen = new Set<string>()
    for (const f of files) {
      try {
        const txt = await window.xcode.fs.read(f)
        for (const l of txt.split(/\r?\n/)) {
          const mm = l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
          if (mm) seen.add(mm[1])
        }
      } catch {
        /* skip */
      }
    }
    envKeys = [...seen]
  } catch {
    /* none */
  }
}

function envProvider(): monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      if (!envKeys.length) return { suggestions: [] }
      const line = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      })
      if (!/(process\.env|import\.meta\.env)\.\w*$/.test(line)) return { suggestions: [] }
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      return {
        suggestions: envKeys.map((k) => ({
          label: k,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: k,
          detail: 'env variable',
          range
        }))
      }
    }
  }
}

export function initLanguageExtras(): void {
  const langs = ['javascript', 'typescript', 'html', 'css', 'scss', 'less', 'json', 'markdown', 'python']
  for (const l of langs) {
    monaco.languages.registerCompletionItemProvider(l, snippetProvider())
    monaco.languages.registerCompletionItemProvider(l, pathProvider())
  }
  monaco.languages.registerCompletionItemProvider(['javascript', 'typescript'], envProvider() as any)

  void loadUserSnippets()
  void loadEnvKeys()
  bus.on(Ev.workspaceOpened, () => {
    void loadUserSnippets()
    void loadEnvKeys()
  })
  bus.on(Ev.fileSaved, (p: string) => {
    if (typeof p === 'string' && p.endsWith('.xcode/snippets.json')) void loadUserSnippets()
    if (typeof p === 'string' && /\.env(\.|$)/.test(p.split(/[\\/]/).pop() || '')) void loadEnvKeys()
  })
}

export async function configureSnippets(): Promise<void> {
  if (!store.rootPath) return
  const file = store.rootPath + '/.xcode/snippets.json'
  try {
    await window.xcode.fs.read(file)
  } catch {
    await window.xcode.fs.write(
      file,
      JSON.stringify(
        {
          javascript: [{ prefix: 'hello', body: "console.log('hello $1')$0", description: 'sample snippet' }]
        },
        null,
        2
      )
    )
  }
  await openPath(file.replace(/\//g, store.rootPath.includes('\\') ? '\\' : '/'))
  void loadUserSnippets()
}
