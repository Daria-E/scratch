export interface EditorWindowStateInput {
  showNotes: boolean;
  previewFile: string | null;
  editorFile: string | null;
}

export interface EditorWindowState {
  activeFile: string | null;
  returnFile: string | null;
}

export interface LeaveNotesCommand {
  id: "back-to-document" | "blank-document";
  label: "Back to document" | "Blank document (no notes folder)";
}

export function resolveEditorWindowState({
  showNotes,
  previewFile,
  editorFile,
}: EditorWindowStateInput): EditorWindowState {
  const file = previewFile ?? editorFile;
  return {
    activeFile: showNotes ? null : file,
    returnFile: file,
  };
}

export function resolveLeaveNotesCommand(
  returnToDocument: boolean,
): LeaveNotesCommand {
  return returnToDocument
    ? { id: "back-to-document", label: "Back to document" }
    : {
        id: "blank-document",
        label: "Blank document (no notes folder)",
      };
}
