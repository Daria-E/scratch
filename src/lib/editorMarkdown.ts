import type { Editor } from "@tiptap/react";

export function markdownFromEditor(editor: Editor | null | undefined): string {
  if (!editor) return "";
  const manager = editor.storage.markdown?.manager;
  if (!manager) return editor.getText();
  return manager.serialize(editor.getJSON()).replace(/&nbsp;|&#160;/g, " ");
}
