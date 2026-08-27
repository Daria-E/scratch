/**
 * Platform detection utilities for cross-platform shortcut labels.
 * On macOS: ⌘, ⌥, ⇧
 * On Windows/Linux: Ctrl, Alt, Shift
 */

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export const isWindows =
  typeof navigator !== "undefined" && /Windows/.test(navigator.userAgent);

/** Modifier key symbol/label */
export const mod = isMac ? "⌘" : "Ctrl";
export const alt = isMac ? "⌥" : "Alt";
export const shift = isMac ? "⇧" : "Shift";

/**
 * Build a shortcut label string.
 * e.g. shortcut("B") => "⌘B" on Mac, "Ctrl+B" on Windows
 */
export function shortcut(...parts: string[]): string {
  if (isMac) {
    return parts.join("");
  }
  return parts.join("+");
}

// Physical-key fallback so shortcuts work on non-Latin layouts (Hebrew, Cyrillic…):
// e.key is matched first so Latin layouts (AZERTY, Dvorak) keep their own letters;
// e.code is consulted only when the layout produced a non-ASCII character.
const US_CODE: Record<string, string> = {
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  "\\": "Backslash",
  "=": "Equal",
  "+": "Equal",
  "-": "Minus",
  _: "Minus",
  ";": "Semicolon",
  "'": "Quote",
  "[": "BracketLeft",
  "]": "BracketRight",
  "`": "Backquote",
};

for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(97 + i);
  US_CODE[letter] = `Key${letter.toUpperCase()}`;
}
for (let digit = 0; digit <= 9; digit++) {
  US_CODE[String(digit)] = `Digit${digit}`;
}

export function keyIs(e: KeyboardEvent, key: string): boolean {
  if (key.length > 1) {
    return e.key === key;
  }
  if (e.key.length === 1 && e.key.toLowerCase() === key.toLowerCase()) {
    return true;
  }
  if (e.key.length === 1 && /^[\x20-\x7e]$/.test(e.key)) {
    return false;
  }
  return US_CODE[key.toLowerCase()] === e.code;
}
