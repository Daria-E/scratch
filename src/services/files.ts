import { invoke } from "@tauri-apps/api/core";

export interface FileContent {
  path: string;
  content: string;
  title: string;
  modified: number;
}

export async function readFileDirect(path: string): Promise<FileContent> {
  return invoke("read_file_direct", { path });
}

export async function saveFileDirect(
  path: string,
  content: string,
): Promise<FileContent> {
  return invoke("save_file_direct", { path, content });
}

export async function openFilePreview(path: string): Promise<void> {
  return invoke("open_file_preview", { path });
}

export interface ImportedNote {
  id: string;
  title: string;
  preview: string;
  modified: number;
}

export async function importFileToFolder(
  path: string,
): Promise<ImportedNote> {
  return invoke("import_file_to_folder", { path });
}

export async function newEditorWindow(): Promise<void> {
  return invoke("new_editor_window");
}

export async function saveDraftAs(
  draftPath: string,
  targetPath: string
): Promise<string[]> {
  return invoke("save_draft_as", { draftPath, targetPath });
}

export interface RecentEntry {
  path: string;
  name: string;
  dir: string;
  exists: boolean;
}

export interface DraftEntry {
  path: string;
  title: string;
}

export async function listRecentFiles(): Promise<RecentEntry[]> {
  return invoke("list_recent_files");
}

export async function addRecentFile(path: string): Promise<void> {
  return invoke("add_recent_file", { path });
}

export async function removeRecentFile(path: string): Promise<void> {
  return invoke("remove_recent_file", { path });
}

export async function listUnsavedDrafts(): Promise<DraftEntry[]> {
  return invoke("list_unsaved_drafts");
}
