export interface NoteMetadata {
  id: string;
  title: string;
  preview: string;
  modified: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  path: string;
  modified: number;
}

export interface ThemeSettings {
  mode: "light" | "dark" | "system";
}

export type FontFamily = "system-sans" | "serif" | "monospace";
export type TextDirection = "auto" | "ltr" | "rtl";
export type EditorWidth = "narrow" | "normal" | "wide" | "full" | "custom";

export interface EditorFontSettings {
  baseFontFamily?: FontFamily;
  baseFontSize?: number; // in px, default 16
  boldWeight?: number; // 600, 700, 800 for headings and bold text
  lineHeight?: number; // default 1.6
}

// Customizable theme color keys (maps to CSS --color-* variables)
export type ThemeColorKey =
  | "bg"
  | "bg-secondary"
  | "bg-muted"
  | "bg-emphasis"
  | "text"
  | "text-muted"
  | "border"
  | "accent"
  | "selection";

// Partial map of color overrides (hex strings)
export type CustomColors = Partial<Record<ThemeColorKey, string>>;

export type PaperSize = "a4" | "letter" | "a5";

export interface ExportSettings {
  paperSize?: PaperSize;
  marginMm?: number;
  fontSizePt?: number;
  lineSpacing?: number;
  fontFamily?: string;
  direction?: TextDirection;
  pageNumbers?: boolean;
  justify?: boolean;
  hyphenate?: boolean;
  paragraphSpacingEm?: number;
  firstLineIndentEm?: number;
  headingNumbering?: string;
  pageNumberFormat?: string;
  headerText?: string;
  footerText?: string;
  columns?: number;
  footnoteSizePt?: number;
  equationNumbering?: string;
  preamble?: string;
  params?: Record<string, string>;
}

export interface ExportPreset {
  name: string;
  settings: ExportSettings;
  templateFile?: string;
}

export interface TemplateImport {
  fileName: string;
  missingFonts: string[];
  declaredParams: string[];
}

// Per-folder settings (stored in .scratch/settings.json)
export interface Settings {
  theme: ThemeSettings;
  editorFont?: EditorFontSettings;
  gitEnabled?: boolean;
  foldersEnabled?: boolean;
  pinnedNoteIds?: string[];
  textDirection?: TextDirection;
  editorWidth?: EditorWidth;
  customEditorWidthPx?: number;
  sidebarWidthPx?: number;
  defaultNoteName?: string;
  interfaceZoom?: number;
  ollamaModel?: string;
  ignoredPatterns?: string[];
  customColorsLight?: CustomColors;
  customColorsDark?: CustomColors;
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  notes: NoteMetadata[];
}
