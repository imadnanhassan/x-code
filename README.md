# Xcode

A fast, lightweight code editor — built with **Electron** + **Monaco** + **xterm.js**.
Landing page & downloads: **xcode.datadropx.net**

> The name is just the project name. This is **not** Apple's Xcode and is unrelated to Apple.

## Features

- **Editor** — Monaco engine (the core of VS Code): 50+ language syntax, IntelliSense for JS/TS/JSON/CSS/HTML, multi-cursor, minimap, sticky scroll, bracket-pair colours, colour decorators/picker, format document, find & replace.
- **Integrated terminal** — real PTY (PowerShell 7 / Windows PowerShell / zsh / bash) via `@lydell/node-pty` **prebuilt binaries** — no C/C++ toolchain, works on every OS out of the box. Multiple sessions, "open terminal here", run-command palette.
- **Emmet** — `ul>li*3` + Tab abbreviation expansion for HTML, JSX and CSS.
- **Markdown preview** — live side-by-side GitHub-flavoured render (`Ctrl+Shift+V`), sanitised, links open in the OS browser.
- **File explorer** — colour-coded language icons, lazy folders, context menu (new / rename / delete / copy path / reveal in OS / open in default app).
- **Tabs** — dirty indicators, middle-click close, close others / all, breadcrumbs.
- **Command palette** — `Ctrl+Shift+P` for every command, `Ctrl+P` fuzzy file open.
- **Search across files** — regex / case / whole-word, grouped results, **replace all**.
- **Themes** — 9 built-in (Xcode Dark/Light, Dracula, One Dark, Monokai, Nord, Tokyo Night, Solarized Dark, GitHub Dark) with live preview.
- **Import VS Code settings** — reads your `settings.json` (VS Code / Insiders / VSCodium / Cursor) and maps font, theme, tabs, wrap, format-on-save, auto-save, trim-on-save, Emmet, zoom.
- **On-save cleanups** — trim trailing whitespace, insert / trim final newline, format on save & paste.
- **Auto-update** — `electron-updater` against GitHub Releases; downloads in the background, installs on restart.
- **Session restore**, **custom title bar** with full menus, per-viewer settings persisted to disk.

## Low-memory design

- **Lazy editor** — Monaco is only instantiated on first file open (~40 MB stays out of the heap while you browse).
- **Lean defaults** — CodeLens, inlay hints, cross-file occurrence highlight, word-based suggestions off; minimap off by default.
- **V8 `--optimize-for-size`** + 8 MB semi-space on every process; single renderer, no spare processes; 48 MB disk-cache cap; WebGL off; background throttling on.
- **Hardware Acceleration toggle** (*Settings → Performance*) — off drops the GPU process, ~40–80 MB saved. **Show Memory in Status Bar** to watch it live.

Typical idle footprint on a real GPU: **~150–230 MB** (VS Code idles ~350 MB – 1 GB+).

## Develop

```bash
npm install
npm run dev
```

No native build step — `@lydell/node-pty` ships prebuilt binaries for Windows, macOS and Linux.

## Package

```bash
npm run dist         # local: portable Windows .zip (release/Xcode-<ver>-x64.zip)
npm run dist:full    # local: .zip + NSIS installer (needs Windows Developer Mode)
npm run release      # CI: build + publish every target to a GitHub Release
```

## Publish a release

```bash
npm version patch          # bumps package.json, creates tag vX.Y.Z
git push --follow-tags     # → .github/workflows/release.yml builds & publishes
```

`.github/workflows/release.yml` runs on `windows-latest` and uploads
`Xcode-<ver>-x64.zip` + `Xcode-Setup-<ver>.exe` to the GitHub Release for the tag.
Add `macos-latest` / `ubuntu-latest` to the matrix to ship those too.
The landing page (`site/`) reads the latest release from the GitHub API and wires
its download buttons automatically — see `site/README.md` for deploy steps.

## Keyboard shortcuts

| Key | Action | | Key | Action |
| --- | --- | --- | --- | --- |
| `Ctrl+P` | Go to file | | `Ctrl+F` / `Ctrl+H` | Find / Replace |
| `Ctrl+Shift+P` | Command palette | | `Ctrl+Shift+F` | Search in files |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / Save As | | `Ctrl+/` | Toggle comment |
| `Ctrl+N` / `Ctrl+O` | New / Open file | | `Alt+↑` / `Alt+↓` | Move line |
| `Ctrl+K Ctrl+O` | Open folder | | `Shift+Alt+F` | Format document |
| `Ctrl+W` | Close editor | | `Ctrl+Shift+V` | Markdown preview |
| `Ctrl+B` / `` Ctrl+` `` | Sidebar / Terminal | | `Ctrl+K Ctrl+T` | Colour theme |
| `Ctrl+,` | Settings | | `Ctrl+=` `Ctrl+-` `Ctrl+0` | Zoom |

## Project layout

```
src/
  main/        Electron main — window, fs/dialog IPC, PTY host, auto-update, VS Code import
  preload/     contextBridge API (window.xcode)
  renderer/src/
    core/        event bus + settings/state store
    features/    editor, explorer, terminal, search, themes, icons, commands,
                 markdownPreview, vscodeImport, updater, settings panel, status/title bar
    styles/      base / layout / widgets CSS (theme-driven CSS variables)
scripts/gen-icon.mjs   SVG → build/icon.ico + build/icon.png
site/                  static landing page for xcode.datadropx.net
.github/workflows/     ci.yml (typecheck+build) · release.yml (tag → GitHub Release)
```

## Tech

- [electron-vite](https://electron-vite.org/), [monaco-editor](https://microsoft.github.io/monaco-editor/), [@xterm/xterm](https://xtermjs.org/) + [@lydell/node-pty](https://github.com/lydell/node-pty), [emmet-monaco-es], [marked] + [DOMPurify], [electron-updater]
- No UI framework — plain TypeScript modules.
