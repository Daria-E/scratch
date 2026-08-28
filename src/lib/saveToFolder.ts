interface SaveToFolderInput {
  isDraft: boolean;
  isEmpty: boolean;
}

interface ImportedDocument {
  id: string;
}

interface SaveToFolderOperations {
  flushCurrentDocument(): Promise<void>;
  importDocument(): Promise<ImportedDocument>;
  retireDraft(): Promise<void>;
  openNotes?: (noteId: string) => void;
  closeWindow(): Promise<void>;
}

export type SaveToFolderResult =
  | "ignored-blank-draft"
  | "opened-notes"
  | "closed-window";

export async function saveDocumentToFolder(
  input: SaveToFolderInput,
  operations: SaveToFolderOperations,
): Promise<SaveToFolderResult> {
  if (input.isDraft && input.isEmpty) return "ignored-blank-draft";

  await operations.flushCurrentDocument();
  const imported = await operations.importDocument();
  if (input.isDraft) await operations.retireDraft();
  if (operations.openNotes) {
    operations.openNotes(imported.id);
    return "opened-notes";
  }
  await operations.closeWindow();
  return "closed-window";
}
