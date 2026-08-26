# Typeset PDF Export (Typst)

## Goal

Replace naive `window.print()` PDF export with deterministic, cross-platform typeset
output: page size, margins, line spacing, font size/family, page numbers — LyX-grade
results for markdown notes, including mixed Hebrew/English text with LaTeX math.

## Non-goals

- Live typeset preview while editing (edit-time WYSIWYM). The TipTap editor remains the
  editing surface; Typst is an export-time backend only. Crossing this line converts
  Scratch into a Typst editor and is explicitly out of scope.
- Replacing "Print…" (native dialog). It stays alongside the new export.
- Typst as a note format. Markdown files remain the sole source of truth.

## Evidence

- PoC 1 (hand-written Typst, `typst` 0.15.1 CLI): Hebrew RTL paragraphs with embedded
  LTR math islands render correctly; A4/margins/leading/page numbers all controllable.
  Rejected alternatives: Tectonic/XeLaTeX (heavy C/C++ cross-platform build, slow),
  headless Chromium (ships a browser for `@page` alone), JS PDF libs (weak RTL + math).
- PoC 2 (`@preview/cmarker` 0.1.6 + `@preview/mitex` 0.2.6 on Typst 0.15.1): full
  markdown pipeline works — headings, nested/ordered lists, tables, syntax-highlighted
  code blocks, blockquotes, links, inline/display math passed verbatim to mitex.
- WebKitGTK ignores `@page` entirely (size and margin; verified empirically), so the
  webview can never provide page geometry on Linux. Tideflow (Typst-based markdown
  editor) fails on RTL because its template never sets direction — engine is not the
  limiting factor.

## Architecture

```
note.md ──(Rust preprocess)──> note.prep.md ──┐
                                              ├─ typst compile ──> PDF bytes ──> save dialog
template.typ + exportSettings (JSON) ─────────┘
```

- `src-tauri/src/export.rs`: new module, one command `export_pdf(note_id, settings)`.
  Compiles in-memory via `typst` + `typst-pdf` crates (same engine as PoC CLI).
- Template asset (`src-tauri/assets/export/template.typ`): mirrors PoC 2 —
  `#set page/text/par` from settings JSON, `cmarker.render(..., math: mitex)`,
  `show raw` rules forcing code blocks LTR.
- Packages vendored under `src-tauri/assets/export/packages/` (cmarker, mitex, pinned
  versions). No network at export time; app stays offline-first. Pinning is deliberate:
  mitex 0.2.5 is incompatible with Typst 0.15 — registry drift is a real failure mode.
- Fonts: system font discovery plus explicit fallback chain ending in a Hebrew-capable
  face; embed a fallback font only if a target platform lacks one (open question O1).

## Preprocess pass (Rust)

1. Per-block direction: first-strong-character heuristic per markdown block; wrap
   minority-direction blocks in raw-typst direction markers cmarker passes through.
   Global direction default comes from `exportSettings.direction`, which defaults to
   the folder's existing `textDirection` setting. Rationale: a single global `dir`
   visually scrambles minority-direction paragraphs and reorders code tokens (PoC 2).
2. Wikilinks: rewrite `[[target]]` to plain styled text (v1); linking is meaningless
   in a PDF.
3. Image paths: resolve relative asset paths against the note's folder so Typst can
   read them (compile root = notes folder).

## Settings

`exportSettings` block in the existing per-folder `Settings`
(`src/types/note.ts`, stored in `.scratch/settings.json`):

```ts
exportSettings?: {
  paperSize?: "a4" | "letter" | "a5";     // default a4
  marginMm?: number;                       // default 20
  fontSizePt?: number;                     // default 11
  lineSpacing?: number;                    // leading em, default 0.75
  fontFamily?: string;                     // default template chain
  direction?: "auto" | "ltr" | "rtl";      // default: folder textDirection
  pageNumbers?: boolean;                   // default true
}
```

## UI

- Export dropdown gains "Export PDF (typeset)…" above "Print as PDF"; command palette
  entry likewise. Opens save dialog; export runs async with toast on completion/error.
- Settings UI: new "PDF export" section alongside existing editor-font settings.

## Milestones

- M1: `export.rs` end-to-end — fixed template, hardcoded settings, vendored packages;
  PoC 2 note exports identically to the CLI result. Acceptance: byte-comparable PDF.
- M2: settings schema + UI + template parameterization.
- M3: preprocess pass (direction detection, wikilinks, image paths).
- M4: coverage hardening — footnotes, task lists, nested quotes, huge notes; document
  unsupported constructs in README.

## Known limits / risks

- PDF text-extraction of math glyphs is partially garbled (copy/search of formulas);
  visual output unaffected. Pre-existing in webview prints too.
- RTL tables mirror column order (typographically conventional; revisit if unwanted).
- Release binary grows 32.3 MB -> 86.7 MB. Measured split: ~44 MB typst compiler code
  (includes `wasmi` — cmarker/mitex are WASM plugins — `hayagriva`, Unicode/ICU tables),
  9.7 MB embedded fonts, 0.8 MB vendored packages. Accepted (O2).
- cmarker/mitex pinned: upgrades are deliberate maintenance events with re-run of the
  PoC 2 fixture as regression test.

## Decisions

- O1: keep typst-assets embedded fonts (New Computer Modern etc.) for cross-platform
  determinism of Latin and math; Hebrew comes from system fonts via the font fallback
  chain. Do not bundle a Hebrew face.
- O2: accept the binary size. Rejected: dropping embedded fonts (saves 9.7 MB, costs
  math-font determinism), sidecar typst binary (same download, adds per-platform binary
  management and a failure mode observed in the wild — Tideflow's sidecar segfaults).

## Open questions

- O3: per-note frontmatter overrides for export settings (LyX-style per-document
  layout) — v2 candidate.
