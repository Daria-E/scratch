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
- Drafts with content that were never saved reappear in the recents menu under "Unsaved"
  on next launch.
- Empty drafts older than 7 days are deleted at startup.

## Images

Image paste (`Editor.tsx:1362` → `save_clipboard_image`) and image insertion
(`Editor.tsx:1922` → `copy_image_to_assets`) currently write into
`<notes folder>/assets/` and are the only editor features that hard-fail without a
folder. Both commands gain a target directory instead of resolving the notes folder
themselves:

- Saved file — images go to `<directory of the file>/assets/`.
- Draft — images go to the draft's own directory under `{APP_DATA}/drafts/`.

Saving a draft (`mod+S`) therefore has to move its assets too:

1. Scan the markdown for image links that are relative and resolve inside the draft
   directory. Absolute paths, `http(s):` and `data:` URLs are left untouched.
2. Copy each referenced file once into `<target directory>/assets/`, suffixing the name
   on collision.
3. Rewrite those links to the new relative paths, then write the markdown to the target.
4. If any copy fails, still save the document and report which images were left behind —
   never lose the text over an asset.

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

## Known limits / risks

- Editing an arbitrary file inherits Scratch's autosave: changes are written ~300 ms after
  typing, with no explicit save step. This already applies to preview windows today.
- Opening many files from a file manager produces many windows.
- Existing installs also default to `"editor"`; the notes window is one menu item away,
  but the first launch after upgrading will look different (accepted — no migration).
