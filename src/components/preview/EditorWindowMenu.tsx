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
import { newEditorWindow, openFilePreview } from "../../services/files";

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
    <DropdownMenu.Root>
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
