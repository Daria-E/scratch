# Editor Mode (folder-optional single-file editing)

## Goal

Make Scratch usable as a plain markdown editor — open a file, edit, save, close — without
a notes folder, and make that the default way it opens. The notes library becomes an
optional mode rather than a precondition.

## Non-goals

- Tabs. Multiple files means multiple windows (the existing behavior).
- Search across arbitrary files. Full-text search stays folder-scoped; recents are
  filtered by name only.
- Removing the notes library. Both window kinds remain first-class.

## What already exists

- `.md`/`.markdown` file associations, plus CLI argument handling (`lib.rs:3861`), so
  double-click, "Open With", drag-and-drop and `scratch file.md` all work today.
- `create_preview_window` (`lib.rs:3798`) opens a standalone window at
  `index.html?mode=preview&file=…`; `PreviewApp` loads via `read_file_direct`, saves via
  `save_file_direct`, and detects external modification on focus.
- That window renders the full editor — formatting, find, math, typeset export — minus
  the sidebar.

## Gaps this closes

1. The app cannot start without a notes folder (`App.tsx:465` renders the folder picker).
2. No way to open or create a file from inside an editor window.
3. Settings are unreachable from an editor window (`SettingsPage` is rendered only in the
   folder-mode branch, `App.tsx:473`), and `update_settings` refuses to write without a
   folder (`lib.rs:1793`), so appearance changes would silently fail to persist.
4. No recent-files list.

## Model

There is no global mode. A window is either an **editor window** (one file, no sidebar)
or the **notes window** (library, sidebar, search, git). Both may be open at once.

One app-config setting, `defaultWindow: "editor" | "notes"`, decides which kind opens
when Scratch is launched with no file argument. Default is `"editor"`. Switching kinds at
runtime never changes the setting.

## Settings must become folder-optional

Split by category rather than layering:

- **Global (app config)**: theme, editor font settings, text direction, editor width and
  custom width, sidebar width, interface zoom, custom colors, export presets (already
  there), `defaultWindow`, recents.
- **Per-folder (`.scratch/settings.json`)**: git enabled, folders enabled, pinned notes,
  default note name, ignored patterns.

`update_settings` stops failing when no folder is set: global keys always persist, folder
keys are skipped. The Folder and Integrations tabs hide when no folder is set. On first
run after the change, if app config has no appearance values and a notes folder exists,
seed them from that folder's settings so nothing appears to reset.

## Editor window additions

A single icon button in the header's empty left slot (where the sidebar toggle sits in
notes mode, `Editor.tsx:2446`) opens a menu:

- New document — `mod+N`
- Open file… — `mod+O`
- Recent files — up to 15 entries, most recent first, name plus dimmed parent directory
- Open notes folder… — opens or focuses the notes window, picking a folder if unset
- Settings — `mod+,`

Recents live in app config and record files opened in editor windows. Files opened in the
notes window are already listed under Notes and are not duplicated. A recent whose file
no longer exists is shown dimmed and is removed when clicked, with a toast.

## Drafts

A new document is backed by a real file in `{APP_DATA}/drafts/<uuid>.md`, so the existing
autosave path (300 ms, `save_file_direct`) works unchanged and nothing is lost to a crash.

- The window titles it "Untitled" and shows no path.
- `mod+S` in a draft opens a save dialog and moves the draft to the chosen location; the
  window then targets the new path and the file enters recents.

Draft buffers are ephemeral (decision 2026-08-27, superseding "drafts persist across
sessions"): the draft file exists for crash safety, not as a document store. Abandoning
a non-empty draft — closing the window, opening another file in it, or switching to the
notes view — prompts Save / Discard / Cancel (invariant D). "Save" runs the save-as
flow; a cancelled save dialog cancels the abandonment. "Discard" deletes the draft file
and its asset subfolder (`discard_draft`). An empty draft is deleted silently on
abandonment. "Save to folder" imports the draft into the notes folder (with asset
migration) and then discards it without prompting — it is a save.

What survives on disk is therefore only what a crash or kill left behind; those drafts
appear in the header menu labeled "Recovered" and prompt normally when next abandoned.
Startup cleanup stays as the backstop: empty drafts and unreferenced draft assets older
than 7 days are deleted.

## Images

Image paste and image insertion go through one Editor helper (`importImageAsset`) that
invokes `save_clipboard_image` / `copy_image_to_assets` with a target directory and the
document's stem. Every write lands in a per-document subfolder (decision 2026-08-27,
implemented same day):

- Saved file — images go to `<directory of the file>/assets/<file stem>/`.
- Note — images go to `<notes folder>/assets/<note stem>/`.
- Draft — images go to `{APP_DATA}/drafts/assets/<draft stem>/`.

Pre-existing flat `assets/name.png` links keep resolving; documents are never rewritten
in place. Notes with the same stem in different subfolders share an asset subfolder —
harmless (collisions inside get `-1` suffixes) and no GC runs in the notes folder.

Pasting a copied image *file* (as opposed to bitmap data) reaches the DOM in
webview-specific shapes — WebKitGTK hands the page only the path as text — so the DOM
is not where file pastes are detected. The backend command `clipboard_image_files`
reads the OS clipboard directly (GTK clipboard on Linux, `clipboard-win` on Windows,
NSPasteboard on macOS) and returns the local image files it holds. The paste handler's
shared flow on all platforms: bitmap items → save as screenshot; paste that smells like
files (`pasteSmellsLikeFiles`: a Files/uri-list type, or all-path text) → ask the
backend and import each returned file via `copy_image_to_assets`, falling back to plain
text insertion when the backend finds none; otherwise the normal text/markdown path.

Image classification is by file content (`sniff_image`: magic bytes via `infer`, plus
an XML sniff for SVG), not by extension — `copy_image_to_assets` uses the same
classifier, so a misnamed image imports and a non-image with an image extension is
rejected. Extension lists survive only in the Insert → Image dialog filter, which is a
UI convention.

The asset protocol excludes hidden path segments (`requireLiteralLeadingDot`), and both
drafts and arbitrary opened files can live under them, so `read_file_direct` grants the
loaded document's directory to the asset scope at load time — the same runtime grant the
notes folder receives. Consequence: opening a markdown file makes its directory
asset-servable for the session; that is the deliberate cost of rendering its images.

Asset folders are named `assets` and stay visible (decision 2026-08-27). Hidden
folders get left behind by GUI copies and skipped by some backup tools, and hidden path
segments re-enter the asset-protocol exclusion that caused the 403 class. If the shared
folder proves annoying, the upgrade path is per-document folders (`<name>.assets/`),
not hiding.

Markdown on disk references images relative to the document (`assets/name.png`);
`asset://` URLs exist only in the DOM. `editorMarkdown.ts` owns both boundary
transforms (relativize on serialize, absolutize on load).

Saving a draft (`mod+S`) therefore has to move its assets too:

1. Scan the markdown for image links that are relative and resolve inside the draft
   directory. Absolute paths, `http(s):` and `data:` URLs are left untouched.
2. Copy each referenced file once into `<target directory>/assets/<target stem>/`,
   suffixing the name on collision.
3. Rewrite those links to the new relative paths, then write the markdown to the target.
4. If any copy fails, still save the document and report which images were left behind —
   never lose the text over an asset.

Draft assets are garbage-collected at startup (`sweep_unreferenced_assets`): mark =
every relative image link across all draft files, sweep = any file under
`{APP_DATA}/drafts/assets/` that is unreferenced and older than 7 days, then empty
folders. The grace period protects images pasted into a buffer that never flushed.
The sweep never touches the notes folder or any user-chosen directory. It is the
backstop for crash leftovers; the direct paths clean up immediately — save-as removes
the source subfolder after a clean migration, and discard removes it with the draft.

"Save to folder" (`import_file_to_folder`) runs the same asset migration as save-as
(added 2026-08-27; it previously copied raw content, breaking a draft's relative image
links in the notes folder). Failed copies keep their original links silently — the
command's return shape has no failure channel; accepted for now.

## Folder-dependent features

Audited against a null notes folder. 30 backend commands require one; they sort into
three groups.

Unreachable from an editor window, so no work needed: notes CRUD (`list_notes`,
`read_note`, `save_note`, `delete_note`, `create_note`), folder CRUD and moves,
`import_file_to_folder`, `start_file_watcher`, `rebuild_search_index`, the nine git
commands, and the AI executors. The command palette, AI modal, footer and sidebar are all
rendered in App's folder-mode branch (`App.tsx:512`, `525`), and `Editor.tsx` uses no
React context, so nothing folder-bound is mounted.

Fixed by E1: `update_settings`, `update_git_enabled`.

Fixed by E4: `save_clipboard_image`, `copy_image_to_assets` (see Images).

Degrades on its own: wikilink autocomplete reads its note list from editor storage and
returns no suggestions when absent (`WikilinkSuggestion.tsx:40`).

## Invariants (added after E3 review)

Three bug classes surfaced while testing E3; each is an invariant to hold, not a list of
patches.

**A. No dual-host capability drift.** The notes window (`AppContent`) and editor windows
(`PreviewApp`) are two hosts for the same app; every window-level capability must live in
a shared shell, not be hand-copied. Symptoms found: zoom shortcuts, settings access, and
save existed in one host only (zoom is applied in `ThemeProvider`, so only the bindings
were missing). Fix: a `WindowShell` owning providers, Toaster, error boundary, and the
window-agnostic shortcuts (zoom, settings). The AI modal stays notes-only. The command
palette is capability-gated (decision revised 2026-08-27): it uses optional contexts and
builds its command list from what the window provides, so editor windows get the
document commands (copy, export, view toggles, settings) and notes windows additionally
get note, search, git and AI commands.

**B. One Editor instance edits exactly one document.** `Editor.tsx` assumes its note id
changes only when a save renames the file; its rename heuristic
(`Editor.tsx:1625`) adopts a new id without reloading content when the content matches
the last save. Swapping the file path inside a live instance violates this and produced
the E3 open-file failures plus a stale-flush risk (a pending autosave writing the old
document into the newly opened file). Rule: changing the document means remounting the
Editor (`key={filePath}`); never thread a path swap through the instance. The unmount
cleanup flushes pending saves (`Editor.tsx:1756`) before the new path is adopted, which
makes the remount ordering-safe.

**C. No silent failure.** A render error must show an in-window message, not a blank
screen; load/save failures must surface as toasts, not console lines. Every window kind
mounts an error boundary.

**D. A non-empty draft buffer is never abandoned without user choice.** Every path that
navigates away from a draft (window close, in-window open, open-notes switch) funnels
through one guard (`confirmAbandonDraft` in `PreviewApp`) that prompts Save / Discard /
Cancel; empty drafts are deleted silently. Corollaries: a discarded draft must stay
deleted — `save()` suppresses writes to discarded paths, because the editor's unmount
flush and debounced autosave would otherwise resurrect the file; and the host's notion
of the window's file (`App.editorFile`) must be synced on every in-window path change
(`onFilePathChange`), or leaving and re-entering the editor view reopens a stale or
deleted path.

## Milestones

- E1: settings become folder-optional — category split, `update_settings` no longer
  requires a folder, folder-scoped tabs hidden, one-time seed. Acceptance: appearance
  changes persist with no folder set.
- E2: app starts without a folder — `defaultWindow` setting, editor window opens to a
  draft, folder picker only when the notes window is requested.
- E3: header menu — New, Open, Settings, Open notes folder.
- E3h: hardening from review — per-window error boundary, surfaced load/save errors,
  keyed Editor remount for in-window file switching, `WindowShell` for the shared
  window-level layer (invariants A–C).
- E4: recents, drafts and assets — app-config recents list with stale handling; draft
  creation, save-as and recovery; startup cleanup; target-directory image commands and
  asset migration on save.
- E5: per-document asset subfolders (`assets/<doc stem>/`) and the unreferenced-asset
  sweep.
- E6: ephemeral draft lifecycle — abandonment guard with Save/Discard/Cancel prompt,
  `discard_draft`, "Recovered" relabel, host path sync, asset migration in
  `import_file_to_folder` (invariant D).

## Known limits / risks

- Shortcuts are layout-aware via `keyIs` (`lib/platform.ts`): `e.key` is matched first
  so Latin layouts keep their own letters, with an `e.code` physical-position fallback
  when the layout produced a non-ASCII character (fixed 2026-08-27; formerly shortcuts
  did not fire on non-Latin layouts). New handlers must use `keyIs`, not raw `e.key`.

- Editing an arbitrary file inherits Scratch's autosave: changes are written ~300 ms after
  typing, with no explicit save step. This already applies to preview windows today.
- Opening many files from a file manager produces many windows.
- Existing installs also default to `"editor"`; the notes window is one menu item away,
  but the first launch after upgrading will look different (accepted — no migration).
