# Scratch

<img src="docs/app-icon.png" alt="Scratch" width="128" height="128" style="border-radius: 22px; margin-bottom: 8px;">

A minimalist, offline-first markdown note-taking app for macOS, Windows, and Linux.

![macOS](https://img.shields.io/badge/platform-macOS-lightgrey) ![Windows](https://img.shields.io/badge/platform-Windows-blue) ![Linux](https://img.shields.io/badge/platform-Linux-orange)

[Website](https://www.ericli.io/scratch) · [Releases](https://github.com/erictli/scratch/releases)

## Features

- **Offline-first** - No cloud, no account, no internet required
- **Markdown-based** - Notes stored as plain `.md` files you own
- **WYSIWYG editing** - Rich text editing that saves as markdown
- **Preview mode** - Open any `.md` file via drag-and-drop or "Open With" without a notes folder
- **Markdown source mode** - Toggle to view and edit raw markdown (`Cmd+Shift+M`)
- **Syntax highlighting** - 20 languages with GitHub-inspired color scheme
- **Mermaid diagrams** - Render flowcharts, sequence diagrams, and more in fenced code blocks
- **KaTeX math** - Render block `$$...$$` math equations
- **Typeset PDF export** - Real typesetting via an embedded Typst engine: page size, margins, typography, and correct bidirectional (Hebrew/Arabic) layout
- **Wikilinks** - Type `[[` to link between notes with autocomplete
- **Slash commands** - Type `/` to quickly insert headings, lists, code blocks, diagrams, and more
- **Focus mode** - Distraction-free writing with animated sidebar/toolbar fade (`Cmd+Shift+Enter`)
- **Edit with Claude Code, OpenAI Codex, OpenCode, or Ollama** - Use your local CLI to edit notes with AI (including fully offline via Ollama)
- **Works with other AI agents** - Detects external file changes
- **Folders** - Opt-in collapsible folder tree with drag-and-drop to organize notes
- **Keyboard optimized** - Lots of shortcuts and a command palette
- **Customizable** - Theme, typography, page width, and RTL text direction
- **Git integration** - Optional version control with push/pull for multi-device sync
- **Lightweight** - 5-10x smaller than Obsidian or Notion

## Screenshot

![Screenshot](docs/screenshot.png)

## Installation

### macOS

**Homebrew (Recommended)**

```bash
brew tap erictli/tap
brew install --cask erictli/tap/scratch
```

**Manual Download**

1. Download the latest `.dmg` from [Releases](https://github.com/erictli/scratch/releases)
2. Open the DMG and drag Scratch to Applications
3. Open Scratch from Applications

### Windows

Download the latest `.exe` installer from [Releases](https://github.com/erictli/scratch/releases) and run it. WebView2 will be downloaded automatically if needed.

### Linux

Download the latest `.AppImage` or `.deb` from [Releases](https://github.com/erictli/scratch/releases).

### From Source

**Prerequisites:** Node.js 18+, Rust 1.70+

**macOS:** Xcode Command Line Tools · **Windows:** WebView2 Runtime (pre-installed on Windows 11)

```bash
git clone https://github.com/erictli/scratch.git
cd scratch
npm install
npm run tauri dev      # Development
npm run tauri build    # Production build
```

## Keyboard Shortcuts

Scratch is designed to be usable without a mouse. Here are the essentials to get started:

| Shortcut          | Action                 |
| ----------------- | ---------------------- |
| `Cmd+N`           | New note               |
| `Cmd+D`           | Duplicate note         |
| `Delete`          | Delete note            |
| `Cmd+Backspace`   | Delete note            |
| `Cmd+P`           | Command palette        |
| `Cmd+K`           | Add/edit link          |
| `Cmd+F`           | Find in note           |
| `Cmd+Shift+C`     | Copy & Export menu     |
| `Cmd+Shift+M`     | Toggle Markdown source |
| `Cmd+Shift+Enter` | Toggle Focus mode      |
| `Cmd+Shift+F`     | Search notes           |
| `Cmd+R`           | Reload current note    |
| `Cmd+,`           | Open settings          |
| `Cmd+\`           | Toggle sidebar         |
| `Cmd+B/I`         | Bold/Italic            |
| `Cmd+=/-/0`       | Zoom in/out/reset      |
| `↑/↓`             | Navigate notes         |

**Note:** On Windows, use `Ctrl` instead of `Cmd` for all shortcuts.

Many more shortcuts and features are available in the app—explore via the command palette (`Cmd+P` / `Ctrl+P`) or view the full reference in Settings → Shortcuts.

## PDF Export

Two paths, side by side in the export menu:

- **Print as PDF** - hands the note to the system print dialog. Page size and margins
  come from that dialog (on Linux the webview ignores CSS page rules entirely).
- **Export PDF (typeset)** - compiles the note with an embedded [Typst](https://typst.app)
  engine. Page size, margins, font size, line spacing, direction, and page numbers are
  configured in Settings and applied deterministically on every platform.

Typeset export supports headings, emphasis, strikethrough, inline and fenced code with
syntax highlighting, ordered/unordered/nested lists, task lists, tables with alignment,
blockquotes, footnotes, links, reference links, images, thematic breaks, and inline
(`$...$`) and display (`$$...$$`) math in LaTeX syntax. YAML frontmatter is omitted from
the output. Each block is typeset in its own text direction, so notes that mix Hebrew or
Arabic with English render correctly in both.

Known limitations:

- Task list checkboxes render as `☐`/`☑` glyphs, not interactive form fields.
- Wikilinks (`[[Note]]`) become plain text - there is no target to link to in a PDF.
- Remote images (`http(s):`, `data:`) are not fetched; missing or remote images fall back
  to their alt text.
- Nested blockquotes render as indented text inside a single quote block.
- Display math inside a list item is placed below the item rather than inline with it.
- Mirrored characters typed as literal text (for example `∋`) are mirrored by the Unicode
  bidi algorithm inside right-to-left paragraphs. Write them as math (`$\ni$`) to keep
  the typed direction.
- Copying formulas out of the produced PDF can yield garbled characters; the rendered
  output is unaffected.

## Built With

[Tauri](https://tauri.app/) · [React](https://react.dev/) · [TipTap](https://tiptap.dev/) · [Tailwind CSS](https://tailwindcss.com/) · [Tantivy](https://github.com/quickwit-oss/tantivy)

## Contributing

Scratch is mostly stable and intentionally minimal, so I'm no longer monitoring issues and PRs regularly. You're welcome to open them, but I can't guarantee I'll get to everything, and it may take a while when I do.

What makes Scratch special is its minimal feature set and focus on user experience. We're not trying to build Obsidian or Notion, so not every feature will be a fit. If you want to make major changes or take Scratch in a new direction, you should fork it – it's MIT licensed.

**If you open a PR:** keep it small and focused, and try to address any CodeRabbit comments. I generally won't go back and forth with review comments – if I merge, I'll make any additional changes directly.

## License

MIT
