import type { Editor } from "@tiptap/react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { ExportPreset, TemplateImport } from "../types/note";

/**
 * Triggers the native print dialog for the editor content.
 * Users can save as PDF or print to a physical printer.
 * Uses the browser's native print functionality which produces high-quality PDFs.
 *
 * @param editor - The TipTap editor instance
 * @param _noteTitle - The note title (currently unused, but kept for API consistency)
 */
function afterOverlaysRepaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

export async function downloadPdf(
  editor: Editor,
  _noteTitle: string
): Promise<void> {
  if (!editor) throw new Error("Editor not available");

  await afterOverlaysRepaint();
  window.print();
}

/**
 * Downloads the markdown content as a .md file.
 *
 * @param markdown - The markdown content to save
 * @param noteTitle - The note title for the default filename
 * @returns Promise<boolean> - Returns true if file was saved successfully, false if user cancelled
 */
export async function downloadMarkdown(
  markdown: string,
  noteTitle: string
): Promise<boolean> {
  const sanitizedTitle = sanitizeFilename(noteTitle);

  // Show native save dialog
  const filePath = await save({
    defaultPath: `${sanitizedTitle}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!filePath) return false; // User cancelled

  // Convert string to bytes and write file using Tauri command
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(markdown);
  await invoke("write_file", {
    path: filePath,
    contents: Array.from(uint8Array)
  });

  return true;
}

/**
 * Typesets the markdown to PDF via the Typst backend.
 *
 * @param markdown - The markdown content to typeset
 * @param noteTitle - The note title for the default filename
 * @param notePath - Path of the source note, used to resolve relative image paths
 * @returns Promise<boolean> - Returns true if the PDF was written, false if user cancelled
 */
export async function exportTypesetPdf(
  markdown: string,
  noteTitle: string,
  notePath?: string
): Promise<boolean> {
  const filePath = await save({
    defaultPath: `${sanitizeFilename(noteTitle)}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (!filePath) return false;

  await invoke("export_pdf", { markdown, path: filePath, notePath });

  return true;
}

/**
 * Sanitizes a filename by removing invalid characters.
 * Replaces filesystem-unsafe characters with dashes.
 *
 * @param name - The filename to sanitize
 * @returns A filesystem-safe filename
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim() || "note";
}

export async function listExportFonts(): Promise<string[]> {
  return invoke("list_export_fonts");
}

export async function listExportPresets(): Promise<ExportPreset[]> {
  return invoke("list_export_presets");
}

export async function getActiveExportPreset(): Promise<string | null> {
  return invoke("get_active_export_preset");
}

export async function saveExportPreset(preset: ExportPreset): Promise<void> {
  return invoke("save_export_preset", { preset });
}

export async function deleteExportPreset(name: string): Promise<void> {
  return invoke("delete_export_preset", { name });
}

export async function setActiveExportPreset(
  name: string | null
): Promise<void> {
  return invoke("set_active_export_preset", { name });
}

export async function importExportTemplate(
  sourcePath: string
): Promise<TemplateImport> {
  return invoke("import_export_template", { sourcePath });
}
