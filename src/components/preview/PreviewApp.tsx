import { keyIs } from "../../lib/platform";
import { useState, useCallback, useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { Editor, type PreviewModeData } from "../editor/Editor";
import * as filesService from "../../services/files";
import { SettingsPage } from "../settings";
import { EditorWindowMenu, pickMarkdownFile } from "./EditorWindowMenu";
import { CommandPalette } from "../command-palette/CommandPalette";
import { useWindowShell } from "../WindowShell";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { isDraftPath } from "../../services/notes";

interface PreviewAppProps {
  filePath: string;
  onOpenNotes?: () => void;
}

export function PreviewApp({
  filePath: initialFilePath,
  onOpenNotes,
}: PreviewAppProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const editorRef = useRef<TiptapEditor | null>(null);
  const { openShortcutsModal } = useWindowShell();
  const [filePath, setFilePath] = useState(initialFilePath);
  const [isDraft, setIsDraft] = useState(false);

  useEffect(() => setFilePath(initialFilePath), [initialFilePath]);

  useEffect(() => {
    isDraftPath(filePath)
      .then(setIsDraft)
      .catch(() => setIsDraft(false));
  }, [filePath]);
  const [content, setContent] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [modified, setModified] = useState(0);
  const [hasExternalChanges, setHasExternalChanges] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const recentlySavedRef = useRef(false);

  // Load the file whenever the window targets a different path
  useEffect(() => {
    setContent(null);
    filesService
      .readFileDirect(filePath)
      .then((result) => {
        setContent(result.content);
        setTitle(result.title);
        setModified(result.modified);
        isDraftPath(filePath)
          .then((draft) => {
            if (!draft) {
              filesService.addRecentFile(filePath).catch(() => undefined);
            }
          })
          .catch(() => undefined);
      })
      .catch((error) => {
        console.error("Failed to load file:", error);
        toast.error(`Failed to load file: ${error}`);
      });
  }, [filePath]);

  // Listen for window focus to detect external changes
  useEffect(() => {
    const handleFocus = async () => {
      if (recentlySavedRef.current) {
        recentlySavedRef.current = false;
        return;
      }
      try {
        const result = await filesService.readFileDirect(filePath);
        if (result.modified !== modified && content !== null) {
          setHasExternalChanges(true);
        }
      } catch {
        // File may have been deleted
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [filePath, modified, content]);

  const save = useCallback(
    async (newContent: string) => {
      try {
        const result = await filesService.saveFileDirect(filePath, newContent);
        recentlySavedRef.current = true;
        setModified(result.modified);
        setTitle(result.title);
        setHasExternalChanges(false);
      } catch (error) {
        console.error("Failed to save file:", error);
        toast.error(`Failed to save: ${error}`);
      }
    },
    [filePath],
  );

  const openFileDialog = useCallback(() => {
    pickMarkdownFile()
      .then((picked) => {
        if (picked) setFilePath(picked);
      })
      .catch((error) => {
        console.error("Failed to open file:", error);
        toast.error("Failed to open file");
      });
  }, []);

  const newDocument = useCallback(() => {
    filesService.newEditorWindow().catch((error) => {
      console.error("Failed to open new document:", error);
      toast.error("Failed to open a new document");
    });
  }, []);

  const saveAs = useCallback(async () => {
    const target = await saveDialog({
      defaultPath: "untitled.md",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!target) return;

    try {
      const failedAssets = await filesService.saveDraftAs(filePath, target);
      setFilePath(target);
      if (failedAssets.length > 0) {
        toast.warning(
          `Saved, but some images could not be copied: ${failedAssets.join(", ")}`
        );
      } else {
        toast.success("Saved");
      }
    } catch (error) {
      console.error("Failed to save document:", error);
      toast.error(typeof error === "string" ? error : "Failed to save");
    }
  }, [filePath]);

  const reload = useCallback(async () => {
    try {
      const result = await filesService.readFileDirect(filePath);
      setContent(result.content);
      setTitle(result.title);
      setModified(result.modified);
      setHasExternalChanges(false);
      setReloadVersion((v) => v + 1);
    } catch (error) {
      console.error("Failed to reload file:", error);
      toast.error(`Failed to reload: ${error}`);
    }
  }, [filePath]);

  // Listen for preview-file-change events
  useEffect(() => {
    const unlisten = listen<string>("preview-file-change", () => {
      setHasExternalChanges(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Keyboard shortcuts for preview mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modKey = e.metaKey || e.ctrlKey;

      // Cmd+Shift+Enter: Toggle focus mode
      if (modKey && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        setFocusMode((prev) => !prev);
        return;
      }

      // Cmd+Shift+M: Toggle markdown source mode
      if (modKey && e.shiftKey && keyIs(e, "m")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("toggle-source-mode"));
        return;
      }

      // Cmd+Shift+P: Print
      if (modKey && e.shiftKey && keyIs(e, "p")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("print-note"));
        return;
      }

      // Cmd+P: Command palette (also blocks the browser print dialog)
      if (modKey && !e.shiftKey && keyIs(e, "p")) {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      // Cmd+N: New document in its own window
      if (modKey && !e.shiftKey && keyIs(e, "n")) {
        e.preventDefault();
        filesService.newEditorWindow().catch((error) => {
          console.error("Failed to open new document:", error);
          toast.error("Failed to open a new document");
        });
        return;
      }

      // Cmd+O: Open an existing markdown file
      if (modKey && !e.shiftKey && keyIs(e, "o")) {
        e.preventDefault();
        pickMarkdownFile()
          .then((picked) => {
            if (picked) setFilePath(picked);
          })
          .catch((error) => {
            console.error("Failed to open file:", error);
            toast.error("Failed to open file");
          });
        return;
      }

      // Cmd+,: Settings
      if (modKey && keyIs(e, ",")) {
        e.preventDefault();
        setShowSettings((prev) => !prev);
        return;
      }

      // Cmd+S: drafts need a destination; saved files autosave already
      if (modKey && !e.shiftKey && keyIs(e, "s")) {
        e.preventDefault();
        if (isDraft) {
          saveAs().catch((error) => {
            console.error("Failed to save document:", error);
            toast.error("Failed to save");
          });
        } else {
          toast.success("Saved");
        }
        return;
      }

      // Cmd+R: Reload file from disk
      if (modKey && keyIs(e, "r")) {
        e.preventDefault();
        reload();
        return;
      }

      // Escape: Exit focus mode
      if (e.key === "Escape" && focusMode) {
        e.preventDefault();
        setFocusMode(false);
        return;
      }

      // Trap Tab to prevent focus leaving editor (only when editor is focused)
      if (e.key === "Tab") {
        const active = document.activeElement;
        const editorEl = document.querySelector(".ProseMirror");
        if (editorEl && editorEl.contains(active)) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusMode, reload, isDraft, saveAs]);

  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const handleSaveToFolder = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await filesService.importFileToFolder(filePath);
      // Backend emits select-note + focuses main window; close this preview
      await getCurrentWindow().close();
    } catch (error) {
      console.error("Failed to save to folder:", error);
      toast.error(`Failed to save to folder: ${error}`);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [filePath]);

  const previewData: PreviewModeData = {
    content,
    title,
    filePath,
    modified,
    hasExternalChanges,
    reloadVersion,
    save,
    reload,
  };

  if (showSettings) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-bg text-text">
        <SettingsPage
          onBack={() => setShowSettings(false)}
          folderFeatures={false}
        />
      </div>
    );
  }

  const previewNote =
    content !== null
      ? {
          id: filePath,
          title,
          content,
          path: filePath,
          modified,
        }
      : null;

  return (
    <div className="h-full min-h-0 flex flex-col bg-bg text-text">
      <Editor
        key={filePath}
        focusMode={focusMode}
        previewMode={previewData}
        onSaveToFolder={handleSaveToFolder}
        saveToFolderDisabled={isSaving}
        onEditorReady={(editor) => {
          editorRef.current = editor;
        }}
        leadingMenu={
          <EditorWindowMenu
            onOpenSettings={() => setShowSettings(true)}
            onOpenNotes={() => onOpenNotes?.()}
            onOpenFile={setFilePath}
            onSaveAs={isDraft ? saveAs : undefined}
          />
        }
      />

      {paletteOpen && (
        <div
          className="fixed inset-0 bg-text/50 backdrop-blur-sm z-40 animate-fade-in"
          onClick={() => setPaletteOpen(false)}
        />
      )}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenShortcuts={openShortcutsModal}
        focusMode={focusMode}
        onToggleFocusMode={() => setFocusMode((prev) => !prev)}
        editorRef={editorRef}
        previewNote={previewNote}
        onNewDocument={newDocument}
        onOpenFileDialog={openFileDialog}
        onOpenNotes={onOpenNotes}
      />
    </div>
  );
}
