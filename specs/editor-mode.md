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

## Milestones

- E1: settings become folder-optional — category split, `update_settings` no longer
  requires a folder, folder-scoped tabs hidden, one-time seed. Acceptance: appearance
  changes persist with no folder set.
- E2: app starts without a folder — `defaultWindow` setting, editor window opens to a
  draft, folder picker only when the notes window is requested.
- E3: header menu — New, Open, Settings, Open notes folder.
- E4: recents and drafts — app-config list, stale handling, draft save-as and recovery,
  startup cleanup.

## Known limits / risks

- Editing an arbitrary file inherits Scratch's autosave: changes are written ~300 ms after
  typing, with no explicit save step. This already applies to preview windows today.
- Folder-dependent features must degrade in editor windows: wikilink autocomplete, note
  search commands, git status, note-name templates. Each needs an audit for a null folder.
- Opening many files from a file manager produces many windows.
- Existing installs also default to `"editor"`; the notes window is one menu item away,
  but the first launch after upgrading will look different (accepted — no migration).
