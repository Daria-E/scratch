import type { Editor } from "@tiptap/react";
import { convertFileSrc } from "@tauri-apps/api/core";

export function parentDirectory(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut > 0 ? path.slice(0, cut) : path;
}

export function fileStem(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name = cut >= 0 ? path.slice(cut + 1) : path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function decodeAssetUrl(url: string): string | null {
  const match = url.match(/^(?:asset:\/\/localhost\/|https?:\/\/asset\.localhost\/)(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\\/g, "/");
  } catch {
    return null;
  }
}

// Markdown on disk references images relative to the document; asset:// URLs
// exist only in the DOM. These two transforms are the boundary.
export function relativizeImageLinks(markdown: string, baseDir: string): string {
  const base = baseDir.replace(/\\/g, "/").replace(/\/+$/, "");
  return markdown.replace(
    /!\[([^\]]*)\]\(<?([^)>\s]+)>?\)/g,
    (full, alt: string, url: string) => {
      const decoded = decodeAssetUrl(url);
      if (!decoded) return full;
      const absolute = decoded.startsWith("/") ? decoded : `/${decoded}`;
      if (!absolute.startsWith(`${base}/`)) return full;
      const relative = absolute.slice(base.length + 1);
      return `![${alt}](<${relative}>)`;
    }
  );
}

export function absolutizeImageLinks(markdown: string, baseDir: string): string {
  const base = baseDir.replace(/\\/g, "/").replace(/\/+$/, "");
  return markdown.replace(
    /!\[([^\]]*)\]\(<?([^)>\s]+)>?\)/g,
    (full, alt: string, url: string) => {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith("/")) {
        return full;
      }
      let decoded = url;
      try {
        decoded = decodeURIComponent(url);
      } catch {
        // keep the raw url
      }
      return `![${alt}](<${convertFileSrc(`${base}/${decoded}`)}>)`;
    }
  );
}

export function markdownFromEditor(
  editor: Editor | null | undefined,
  baseDir?: string
): string {
  if (!editor) return "";
  const manager = editor.storage.markdown?.manager;
  const markdown = manager
    ? manager.serialize(editor.getJSON()).replace(/&nbsp;|&#160;/g, " ")
    : editor.getText();
  return baseDir ? relativizeImageLinks(markdown, baseDir) : markdown;
}
