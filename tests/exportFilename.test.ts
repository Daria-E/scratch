import assert from "node:assert/strict";
import test from "node:test";

import {
  exportFileStem,
  sanitizeFilename,
} from "../src/lib/exportFilename";

test("a saved document uses its file stem instead of its title", () => {
  assert.equal(
    exportFileStem({
      path: "/notes/Weekly Plan 2026.md",
      title: "My weekly planning doc",
      isDraft: false,
    }),
    "Weekly Plan 2026",
  );
});

test("a saved file stem preserves sanitizer-hostile characters", () => {
  assert.equal(
    exportFileStem({
      path: "/notes/100% done.md",
      title: "x",
      isDraft: false,
    }),
    "100% done",
  );
});

test("a draft uses its sanitized title instead of its path", () => {
  assert.equal(
    exportFileStem({
      path: "/app-data/drafts/3f2a.md",
      title: "Trip: Plans/Ideas",
      isDraft: true,
    }),
    "Trip- Plans-Ideas",
  );
});

test("an empty sanitized title falls back to note", () => {
  assert.equal(sanitizeFilename("   "), "note");
  assert.equal(
    exportFileStem({ path: null, title: "   ", isDraft: true }),
    "note",
  );
});

test("an unresolved draft state maps to the title-safe path", () => {
  const unresolvedDraftState: boolean | null = null;

  assert.equal(
    exportFileStem({
      path: "/app-data/drafts/3f2a.md",
      title: "Working title",
      isDraft: unresolvedDraftState ?? true,
    }),
    "Working title",
  );
});
