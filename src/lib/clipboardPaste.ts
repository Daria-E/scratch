import type { JSONContent } from "@tiptap/core";

export type ClipboardFile = {
  path: string;
  isImage: boolean;
};

export type ResolvedClipboardFile = ClipboardFile & {
  assetUrl?: string;
};

// The DOM's view of a copied file varies per webview; the backend clipboard
// command is authoritative. This only decides whether a paste is worth asking about.
export function pasteSmellsLikeFiles(
  types: readonly string[],
  text: string,
): boolean {
  if (types.includes("Files") || types.includes("text/uri-list")) return true;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.length > 0 &&
    lines.every(
      (line) =>
        line.startsWith("file://") ||
        line.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(line),
    )
  );
}

export function clipboardPasteRoute(
  types: readonly string[],
  text: string,
  hasBitmap: boolean,
): "files" | "bitmap" | "text" {
  if (pasteSmellsLikeFiles(types, text)) return "files";
  return hasBitmap ? "bitmap" : "text";
}

export function clipboardFilesToContent(
  files: readonly ResolvedClipboardFile[],
): JSONContent[] {
  const blocks: JSONContent[] = [];
  let pathContent: JSONContent[] = [];

  const flushPaths = () => {
    if (pathContent.length === 0) return;
    blocks.push({ type: "paragraph", content: pathContent });
    pathContent = [];
  };

  for (const file of files) {
    if (!file.isImage) {
      if (pathContent.length > 0) pathContent.push({ type: "hardBreak" });
      pathContent.push({ type: "text", text: file.path });
      continue;
    }

    flushPaths();
    if (file.assetUrl) {
      blocks.push({ type: "image", attrs: { src: file.assetUrl } });
    }
  }

  flushPaths();
  return blocks;
}
