import { keyIs } from "../../lib/platform";
import { useState, useCallback, useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import {
  Editor,
  type EditorDocumentController,
  type PreviewModeData,
} from "../editor/Editor";
import * as filesService from "../../services/files";
import { SettingsPage } from "../settings";
import { EditorWindowMenu, pickMarkdownFile } from "./EditorWindowMenu";
import { CommandPalette } from "../command-palette/CommandPalette";
import { useWindowShell } from "../WindowShell";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { isDraftPath } from "../../services/notes";
import { saveDocumentToFolder } from "../../lib/saveToFolder";
import {
  resolveDraftEmptiness,
  saveDraftDocumentAs,
} from "../../lib/draftLifecycle";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  Button,
} from "../ui";

interface PreviewAppProps {
  filePath: string;
  onOpenNotes?: (noteId?: string) => void;
  onFilePathChange?: (path: string | null) => void;
}

type AbandonChoice = "save" | "discard" | "cancel";
interface AbandonOutcome {
  proceed: boolean;
  newPath?: string | null;
}

export function PreviewApp({
  filePath: initialFilePath,
  onOpenNotes,
  onFilePathChange,
}: PreviewAppProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const editorRef = useRef<TiptapEditor | null>(null);
  const documentControllerRef = useRef<EditorDocumentController | null>(null);
  const [documentControllerReady, setDocumentControllerReady] =
    useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const { openShortcutsModal } = useWindowShell();
  const [filePath, setFilePath] = useState(initialFilePath);
  const [draftInfo, setDraftInfo] = useState<{
    path: string;
    isDraft: boolean | null;
  }>({ path: initialFilePath, isDraft: null });
  const isDraft = draftInfo.path === filePath ? draftInfo.isDraft : null;
  const [abandonPrompt, setAbandonPrompt] = useState<{
    resolve: (choice: AbandonChoice) => void;
  } | null>(null);
  const isDraftRef = useRef<boolean | null>(null);
  const filePathRef = useRef(initialFilePath);
  const discardedPathsRef = useRef<Set<string>>(new Set());
  const guardActiveRef = useRef(false);
  const skipCloseGuardRef = useRef(false);

  isDraftRef.current = isDraft;
  filePathRef.current = filePath;

  useEffect(() => setFilePath(initialFilePath), [initialFilePath]);
  useEffect(() => onFilePathChange?.(filePath), [filePath, onFilePathChange]);

  const handleDocumentControllerReady = useCallback(
    (controller: EditorDocumentController | null) => {
      documentControllerRef.current = controller;
      setDocumentControllerReady(controller !== null);
    },
    [],
  );

  useEffect(() => {
    if (!isSaving) return;
    const blockKeyboardInteraction = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", blockKeyboardInteraction, true);
    return () => {
      window.removeEventListener("keydown", blockKeyboardInteraction, true);
    };
  }, [isSaving]);

  useEffect(() => {
    let cancelled = false;
    setDraftInfo({ path: filePath, isDraft: null });
    isDraftPath(filePath)
      .then((draft) => {
        if (!cancelled) setDraftInfo({ path: filePath, isDraft: draft });
      })
      .catch(() => {
        if (!cancelled) setDraftInfo({ path: filePath, isDraft: false });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);
  const [content, setContent] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [modified, setModified] = useState(0);
  const [hasExternalChanges, setHasExternalChanges] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [isDocumentEmpty, setIsDocumentEmpty] = useState(true);
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
      // A discarded draft must stay deleted; late autosaves would resurrect it
      if (discardedPathsRef.current.has(filePath)) return;
      const result = await filesService.saveFileDirect(filePath, newContent);
      recentlySavedRef.current = true;
      setModified(result.modified);
      setTitle(result.title);
      setHasExternalChanges(false);
    },
    [filePath],
  );

  const newDocument = useCallback(() => {
    filesService.newEditorWindow().catch((error) => {
      console.error("Failed to open new document:", error);
      toast.error("Failed to open a new document");
    });
  }, []);

  const saveAs = useCallback(async (): Promise<string | null> => {
    if (savingRef.current) return null;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const controller = documentControllerRef.current;
      const result = await saveDraftDocumentAs({
        pickTarget: () =>
          saveDialog({
            defaultPath: "untitled.md",
            filters: [{ name: "Markdown", extensions: ["md"] }],
          }),
        flushDocument: controller?.contentLoaded()
          ? async () => {
              await controller.flush();
            }
          : null,
        persistDraft: (target) => filesService.saveDraftAs(filePath, target),
        markDraftRetired: () => {
          discardedPathsRef.current.add(filePath);
        },
        adoptTarget: setFilePath,
      });
      if (result.outcome === "cancelled") return null;
      if (result.failedAssets.length > 0) {
        toast.warning(
          `Saved, but some images could not be copied: ${result.failedAssets.join(", ")}`
        );
      } else {
        toast.success("Saved");
      }
      return result.target;
    } catch (error) {
      console.error("Failed to save document:", error);
      toast.error(typeof error === "string" ? error : "Failed to save");
      return null;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [filePath]);

  const draftIsEmpty = useCallback(
    (path: string): Promise<boolean> =>
      resolveDraftEmptiness(documentControllerRef.current, async () => {
        try {
          return (
            (await filesService.readFileDirect(path)).content.trim() === ""
          );
        } catch {
          return true;
        }
      }),
    [],
  );

  const confirmAbandonDraft =
    useCallback(async (): Promise<AbandonOutcome> => {
      if (savingRef.current) return { proceed: false };
      const path = filePathRef.current;
      const draft =
        isDraftRef.current ??
        (await isDraftPath(path).catch(() => false));
      if (!draft) return { proceed: true };
      if (discardedPathsRef.current.has(path)) {
        return { proceed: true, newPath: null };
      }
      if (await draftIsEmpty(path)) {
        discardedPathsRef.current.add(path);
        await filesService.discardDraft(path).catch(() => undefined);
        return { proceed: true, newPath: null };
      }
      if (guardActiveRef.current) return { proceed: false };
      guardActiveRef.current = true;
      try {
        const choice = await new Promise<AbandonChoice>((resolve) =>
          setAbandonPrompt({ resolve }),
        );
        if (choice === "cancel") return { proceed: false };
        if (choice === "save") {
          const target = await saveAs();
          return target ? { proceed: true, newPath: target } : { proceed: false };
        }
        discardedPathsRef.current.add(path);
        try {
          await filesService.discardDraft(path);
        } catch (error) {
          console.error("Failed to discard draft:", error);
        }
        return { proceed: true, newPath: null };
      } finally {
        guardActiveRef.current = false;
        setAbandonPrompt(null);
      }
    }, [saveAs, draftIsEmpty]);

  const confirmAbandonDraftRef = useRef(confirmAbandonDraft);
  confirmAbandonDraftRef.current = confirmAbandonDraft;

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      if (skipCloseGuardRef.current) return;
      // Owning the destroy (instead of the API wrapper) surfaces its errors
      event.preventDefault();
      const { proceed } = await confirmAbandonDraftRef.current();
      if (proceed) {
        win.destroy().catch((error) => {
          console.error("Failed to close window:", error);
          toast.error(`Failed to close window: ${error}`);
        });
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const openFileInWindow = useCallback(
    async (picked: string) => {
      if (picked === filePathRef.current) return;
      const { proceed } = await confirmAbandonDraft();
      if (proceed) setFilePath(picked);
    },
    [confirmAbandonDraft],
  );

  const openFileDialog = useCallback(() => {
    pickMarkdownFile()
      .then((picked) => {
        if (picked) return openFileInWindow(picked);
      })
      .catch((error) => {
        console.error("Failed to open file:", error);
        toast.error("Failed to open file");
      });
  }, [openFileInWindow]);

  const openNotes = useCallback(async () => {
    if (!onOpenNotes) return;
    const { proceed, newPath } = await confirmAbandonDraft();
    if (!proceed) return;
    // Sync the host before this component unmounts with the switch
    if (newPath !== undefined) onFilePathChange?.(newPath);
    onOpenNotes();
  }, [onOpenNotes, confirmAbandonDraft, onFilePathChange]);

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
        openFileDialog();
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
        if (isDraft !== false) {
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
  }, [focusMode, reload, isDraft, saveAs, openFileDialog]);

  const handleSaveToFolder = useCallback(async () => {
    if (savingRef.current) return;
    const controller = documentControllerRef.current;
    if (!controller || !controller.contentLoaded()) {
      toast.error("Document is not ready to save");
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      const isEmpty = controller.isEmpty();
      const draft =
        isDraftRef.current ??
        (await isDraftPath(filePath).catch(() => false));
      await saveDocumentToFolder(
        { isDraft: draft, isEmpty },
        {
          flushCurrentDocument: async () => {
            await controller.flush();
          },
          importDocument: () => filesService.importFileToFolder(filePath),
          retireDraft: async () => {
            discardedPathsRef.current.add(filePath);
            await filesService.discardDraft(filePath).catch(() => undefined);
            onFilePathChange?.(null);
          },
          // The default editor lives in the main window and can switch hosts in
          // place. Standalone preview windows keep the existing close-and-focus
          // behavior after the backend notifies the main Notes window.
          openNotes: onFilePathChange ? onOpenNotes : undefined,
          closeWindow: async () => {
            skipCloseGuardRef.current = true;
            await getCurrentWindow().close();
          },
        },
      );
    } catch (error) {
      console.error("Failed to save to folder:", error);
      toast.error(`Failed to save to folder: ${error}`);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [filePath, onFilePathChange, onOpenNotes]);

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

  const abandonDialog = (
    <AlertDialog
      open={abandonPrompt !== null}
      onOpenChange={(open) => {
        if (!open) abandonPrompt?.resolve("cancel");
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved document</AlertDialogTitle>
          <AlertDialogDescription>
            This document has not been saved to a file. Save it, or discard it
            permanently?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => abandonPrompt?.resolve("cancel")}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => abandonPrompt?.resolve("discard")}
          >
            Discard
          </Button>
          <Button onClick={() => abandonPrompt?.resolve("save")}>Save…</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (showSettings) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-bg text-text">
        <SettingsPage
          onBack={() => setShowSettings(false)}
          folderFeatures={false}
        />
        {abandonDialog}
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
        interactionLocked={isSaving}
        onSaveToFolder={handleSaveToFolder}
        saveToFolderDisabled={
          isSaving ||
          !documentControllerReady ||
          isDraft === null ||
          (isDraft && isDocumentEmpty)
        }
        saveToFolderDisabledReason={
          isDraft === true && isDocumentEmpty
            ? "Start writing to save in Notes"
            : undefined
        }
        onEditorReady={(editor) => {
          editorRef.current = editor;
        }}
        onDocumentControllerReady={handleDocumentControllerReady}
        onDocumentEmptyChange={setIsDocumentEmpty}
        leadingMenu={
          <EditorWindowMenu
            onOpenSettings={() => setShowSettings(true)}
            onOpenNotes={onOpenNotes ? openNotes : undefined}
            onOpenFile={openFileInWindow}
            onSaveAs={isDraft === true ? saveAs : undefined}
          />
        }
      />

      {isSaving && (
        <div
          className="fixed inset-0 z-[100] cursor-progress"
          role="status"
          aria-label="Saving document to Notes"
        />
      )}

      {abandonDialog}

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
        onOpenNotes={onOpenNotes ? openNotes : undefined}
      />
    </div>
  );
}
