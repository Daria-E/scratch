import { fileStem } from "./editorMarkdown";

export interface ExportableDocument {
  path: string | null;
  title: string;
  isDraft: boolean;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim() || "note";
}

export function exportFileStem(doc: ExportableDocument): string {
  return !doc.isDraft && doc.path
    ? fileStem(doc.path)
    : sanitizeFilename(doc.title);
}
