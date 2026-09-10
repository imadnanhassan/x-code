# Xcode

A fast, lightweight personal code editor — built with **Electron** + **Monaco** + **xterm.js**.

> The name is just a personal project name. This is **not** Apple's Xcode and is unrelated to Apple.

## Features

- **Editor** — Monaco engine (the core of VS Code): 50+ language syntax, IntelliSense for JS/TS/JSON/CSS/HTML, multi-cursor, minimap, sticky scroll, bracket-pair colours, format document, find & replace.
- **File explorer** — colour-coded language icons, lazy folder loading, context menu (new / rename / delete / copy path), reveal-in-tree.
- **Tabs** — dirty indicators, middle-click close, close others / all, drag-free overflow scroll, breadcrumbs.
- **Command palette** — `Ctrl+Shift+P` for every command, `Ctrl+P` fuzzy file open.
- **Integrated terminal** — real PTY (PowerShell / bash / zsh) via `node-pty`, multiple sessions, resizable panel.
- **Search across files** — regex / case / whole-word, grouped results, **replace all**.
- **Themes** — 9 built-in: Xcode Dark, Xcode Light, Dracula, One Dark, Monokai, Nord, Tokyo Night, Solarized Dark, GitHub Dark. Live preview while picking.
- **Settings panel** — font, ligatures, tab size, word wrap, whitespace, cursor, auto-save, format-on-save, and more. Persisted to disk.
- **Session restore** — reopens your last folder and open files on launch.
- **Custom title bar** with File / Edit / View / Terminal / Help menus and window controls.

## Low-memory design

Target: keep RAM well under a full VS Code install.

- **Lazy editor** — the Monaco engine is only instantiated the first time you open a file. Browsing the tree alone keeps ~40 MB out of the heap.
- **Lean editor defaults** — CodeLens, inlay hints, cross-file occurrence highlight and word-based suggestions are off; minimap defaults off.
- **V8 `--optimize-for-size`** and an 8 MB semi-space, applied to every process.
- **Single renderer** — no spare/site-isolated processes; capped 48 MB disk cache; WebGL disabled; background throttling on.
- **Hardware Acceleration toggle** (Settings → Performance) — turning it off drops the GPU process and saves ~40–80 MB. Restart required.
- **Memory read-out** — enable *Settings → Performance → Show Memory in Status Bar* to watch it live.

Typical idle footprint on a real GPU: ~150–230 MB depending on the hardware-acceleration setting (VS Code idles ~350 MB–1 GB+).

## Getting started

```bash
npm install
npm run dev
```

`npm install` runs a post-install step that rebuilds `node-pty` for Electron. If you don't have a C/C++ toolchain, that step is skipped and the editor still works — only the **integrated terminal** is disabled until you build it:

**Windows** — install the "Desktop development with C++" workload (Visual Studio Build Tools) + Python 3, then:

```bash
npm run rebuild
```

**macOS** — `xcode-select --install`, then `npm run rebuild`.
**Linux** — `sudo apt install build-essential python3`, then `npm run rebuild`.

## Build a distributable

```bash
npm run dist        # installer for the current OS (see electron-builder.yml)
npm run dist:dir    # unpacked app folder only
```

Windows output: `release/Xcode-1.0.0-setup.exe`.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+P` | Go to file |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / Save As |
| `Ctrl+N` / `Ctrl+O` | New file / Open file |
| `Ctrl+K Ctrl+O` | Open folder |
| `Ctrl+W` | Close editor |
| `Ctrl+B` | Toggle sidebar |
| `` Ctrl+` `` | Toggle terminal |
| `Ctrl+Shift+E` / `Ctrl+Shift+F` | Explorer / Search |
| `Ctrl+,` | Settings |
| `Ctrl+K Ctrl+T` | Colour theme |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |
| `Ctrl+F` / `Ctrl+H` | Find / Replace |
| `Ctrl+/` | Toggle comment |
| `Alt+↑` / `Alt+↓` | Move line |
| `Shift+Alt+F` | Format document |
| `F11` | Toggle full window |

## Project layout

```
src/
  main/        Electron main process — window, fs/dialog IPC, PTY host
  preload/     contextBridge API surface (window.xcode)
  renderer/
    src/
      core/        event bus + settings/state store
      features/    editor, explorer, terminal, search, themes, icons,
                   command palette, settings panel, status bar, title bar
      styles/      base / layout / widgets CSS (theme-driven CSS variables)
```

## Tech

- [electron-vite](https://electron-vite.org/) build tooling
- [monaco-editor](https://microsoft.github.io/monaco-editor/)
- [@xterm/xterm](https://xtermjs.org/) + `node-pty`
- No UI framework — plain TypeScript modules, ~0 runtime deps in the renderer chrome.
