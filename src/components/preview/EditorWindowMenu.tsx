import { useCallback, useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { IconButton } from "../ui";
import {
  AddNoteIcon,
  FileExportIcon,
  FolderIcon,
  MoreVerticalIcon,
  SettingsIcon,
} from "../icons";
import { mod, shortcut } from "../../lib/platform";
import {
  listRecentFiles,
  listUnsavedDrafts,
  newEditorWindow,
  openFilePreview,
  removeRecentFile,
  type DraftEntry,
  type RecentEntry,
} from "../../services/files";
import { cn } from "../../lib/utils";

interface EditorWindowMenuProps {
  onOpenSettings?: () => void;
  onOpenNotes?: () => void;
  onOpenFile?: (path: string) => void;
  onNewDocument?: () => void;
  onSaveAs?: () => void;
}

const itemClass =
  "px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2";

export async function pickMarkdownFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export function EditorWindowMenu({
  onOpenSettings,
  onOpenNotes,
  onOpenFile,
  onNewDocument,
  onSaveAs,
}: EditorWindowMenuProps) {
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [unsaved, setUnsaved] = useState<DraftEntry[]>([]);

  const refreshLists = useCallback(() => {
    listRecentFiles()
      .then(setRecents)
      .catch(() => setRecents([]));
    listUnsavedDrafts()
      .then(setUnsaved)
      .catch(() => setUnsaved([]));
  }, []);

  useEffect(refreshLists, [refreshLists]);

  const openEntry = async (entry: RecentEntry) => {
    if (!entry.exists) {
      await removeRecentFile(entry.path).catch(() => undefined);
      refreshLists();
      toast.error(`${entry.name} no longer exists; removed from recents`);
      return;
    }
    if (onOpenFile) {
      onOpenFile(entry.path);
    } else {
      await openFilePreview(entry.path).catch((error) => {
        console.error("Failed to open recent file:", error);
        toast.error("Failed to open file");
      });
    }
  };

  const newDocument = async () => {
    if (onNewDocument) {
      onNewDocument();
      return;
    }
    try {
      await newEditorWindow();
    } catch (error) {
      console.error("Failed to open new document:", error);
      toast.error("Failed to open a new document");
    }
  };

  const openFile = async () => {
    try {
      const picked = await pickMarkdownFile();
      if (!picked) return;
      if (onOpenFile) {
        onOpenFile(picked);
      } else {
        await openFilePreview(picked);
      }
    } catch (error) {
      console.error("Failed to open file:", error);
      toast.error("Failed to open file");
    }
  };

  return (
    <DropdownMenu.Root
      onOpenChange={(isOpen) => {
        if (isOpen) refreshLists();
      }}
    >
      <DropdownMenu.Trigger asChild>
        <IconButton title="Menu" className="shrink-0">
          <MoreVerticalIcon className="w-4.5 h-4.5 stroke-[1.5]" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-52 bg-bg border border-border rounded-md shadow-lg py-1 z-50"
          sideOffset={5}
          align="start"
        >
          <DropdownMenu.Item className={itemClass} onSelect={newDocument}>
            <AddNoteIcon className="w-4 h-4 stroke-[1.6]" />
            <span className="flex-1">
              {onNewDocument ? "Blank document" : "New document"}
            </span>
            <span className="text-xs text-text-muted">
              {shortcut(mod, "N")}
            </span>
          </DropdownMenu.Item>

          <DropdownMenu.Item className={itemClass} onSelect={openFile}>
            <FolderIcon className="w-4 h-4 stroke-[1.6]" />
            <span className="flex-1">Open file…</span>
            <span className="text-xs text-text-muted">
              {shortcut(mod, "O")}
            </span>
          </DropdownMenu.Item>

          {onSaveAs && (
            <DropdownMenu.Item className={itemClass} onSelect={onSaveAs}>
              <FileExportIcon className="w-4 h-4 stroke-[1.6]" />
              <span className="flex-1">Save as…</span>
              <span className="text-xs text-text-muted">
                {shortcut(mod, "S")}
              </span>
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className="h-px bg-border my-1" />

          {(recents.length > 0 || unsaved.length > 0) && (
            <>
              <DropdownMenu.Separator className="h-px bg-border my-1" />
              <DropdownMenu.Label className="px-3 py-1 text-xs text-text-muted">
                Recent
              </DropdownMenu.Label>
              {unsaved.map((draft) => (
                <DropdownMenu.Item
                  key={draft.path}
                  className={itemClass}
                  onSelect={() => onOpenFile?.(draft.path)}
                >
                  <span className="flex-1 truncate">{draft.title}</span>
                  <span className="text-xs text-text-muted shrink-0">
                    Unsaved
                  </span>
                </DropdownMenu.Item>
              ))}
              {recents.slice(0, 10).map((entry) => (
                <DropdownMenu.Item
                  key={entry.path}
                  className={cn(itemClass, !entry.exists && "opacity-50")}
                  onSelect={() => void openEntry(entry)}
                >
                  <span className="truncate">{entry.name}</span>
                  <span className="flex-1 truncate text-xs text-text-muted">
                    {entry.dir}
                  </span>
                </DropdownMenu.Item>
              ))}
            </>
          )}

          {onOpenNotes && (
            <DropdownMenu.Item className={itemClass} onSelect={onOpenNotes}>
              <FolderIcon className="w-4 h-4 stroke-[1.6]" />
              Open notes…
            </DropdownMenu.Item>
          )}

          {onOpenSettings && (
            <DropdownMenu.Item className={itemClass} onSelect={onOpenSettings}>
              <SettingsIcon className="w-4 h-4 stroke-[1.6]" />
              <span className="flex-1">Settings</span>
              <span className="text-xs text-text-muted">
                {shortcut(mod, ",")}
              </span>
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
