import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { ReactElement } from "react";

import { CircleDotIcon } from "../src/components/icons";
import {
  resolveEditorWindowState,
  resolveLeaveNotesCommand,
} from "../src/lib/appNavigation";
import {
  currentDocumentContent,
  currentDocumentIsEmpty,
  DocumentSaveQueue,
} from "../src/lib/editorDocument";
import { applyInterfaceZoom } from "../src/lib/interfaceZoom";
import { saveDocumentToFolder } from "../src/lib/saveToFolder";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/.test(entry.name)
        ? [path]
        : [];
  });
}

function saveOperations(events: string[], withOpenNotes = true) {
  return {
    flushCurrentDocument: async () => {
      events.push("flush");
    },
    importDocument: async () => {
      events.push("import");
      return { id: "imported-note" };
    },
    retireDraft: async () => {
      events.push("retire-draft");
    },
    openNotes: withOpenNotes
      ? (noteId: string) => {
          events.push(`open-notes:${noteId}`);
        }
      : undefined,
    closeWindow: async () => {
      events.push("close-window");
    },
  };
}

test("a blank draft is not imported into Notes", async () => {
  const events: string[] = [];

  const result = await saveDocumentToFolder(
    { isDraft: true, isEmpty: true },
    saveOperations(events),
  );

  assert.equal(result, "ignored-blank-draft");
  assert.deepEqual(events, []);
});

test("an edited draft is flushed, imported, retired, and opened in Notes without closing the window", async () => {
  const events: string[] = [];

  const result = await saveDocumentToFolder(
    { isDraft: true, isEmpty: false },
    saveOperations(events),
  );

  assert.equal(result, "opened-notes");
  assert.deepEqual(events, [
    "flush",
    "import",
    "retire-draft",
    "open-notes:imported-note",
  ]);
});

test("a failed editor flush aborts before import", async () => {
  const events: string[] = [];
  const operations = saveOperations(events);
  operations.flushCurrentDocument = async () => {
    events.push("flush-failed");
    throw new Error("write failed");
  };

  await assert.rejects(
    saveDocumentToFolder(
      { isDraft: true, isEmpty: false },
      operations,
    ),
    /write failed/,
  );
  assert.deepEqual(events, ["flush-failed"]);
});

test("a host without in-window Notes closes only after importing", async () => {
  const events: string[] = [];

  const result = await saveDocumentToFolder(
    { isDraft: false, isEmpty: false },
    saveOperations(events, false),
  );

  assert.equal(result, "closed-window");
  assert.deepEqual(events, ["flush", "import", "close-window"]);
});

test("opening Notes retains the exact single-document return target", () => {
  assert.deepEqual(
    resolveEditorWindowState({
      showNotes: true,
      previewFile: null,
      editorFile: "/documents/original.md",
    }),
    {
      activeFile: null,
      returnFile: "/documents/original.md",
    },
  );
});

test("source mode is authoritative for Save in Folder content and emptiness", () => {
  const state = {
    sourceMode: true,
    sourceContent: "# Edited in source mode",
    richContent: "# Stale formatted content",
    richIsEmpty: true,
  };

  assert.equal(currentDocumentContent(state), "# Edited in source mode");
  assert.equal(currentDocumentIsEmpty(state), false);
});

test("Save in Folder imports the flushed source-mode snapshot", async () => {
  const state = {
    sourceMode: true,
    sourceContent: "# Edited in source mode",
    richContent: "# Stale formatted content",
    richIsEmpty: false,
  };
  let storedContent = state.richContent;

  await saveDocumentToFolder(
    { isDraft: true, isEmpty: currentDocumentIsEmpty(state) },
    {
      flushCurrentDocument: async () => {
        storedContent = currentDocumentContent(state);
      },
      importDocument: async () => {
        assert.equal(storedContent, state.sourceContent);
        return { id: "source-note" };
      },
      retireDraft: async () => undefined,
      openNotes: () => undefined,
      closeWindow: async () => undefined,
    },
  );
});

test("an empty source buffer remains an empty document", () => {
  const state = {
    sourceMode: true,
    sourceContent: "  \n\t",
    richContent: "# Hidden formatted content",
    richIsEmpty: false,
  };

  assert.equal(currentDocumentIsEmpty(state), true);
});

test("a strict document flush waits for an in-flight autosave", async () => {
  const queue = new DocumentSaveQueue();
  const events: string[] = [];
  let finishAutosave: (() => void) | undefined;

  const autosave = queue.enqueue(
    () =>
      new Promise<void>((resolve) => {
        events.push("autosave-start");
        finishAutosave = () => {
          events.push("autosave-finish");
          resolve();
        };
      }),
  );
  const strictFlush = queue.enqueue(async () => {
    events.push("strict-flush");
  });

  await Promise.resolve();
  assert.deepEqual(events, ["autosave-start"]);
  finishAutosave?.();
  await Promise.all([autosave, strictFlush]);
  assert.deepEqual(events, [
    "autosave-start",
    "autosave-finish",
    "strict-flush",
  ]);
});

test("a failed autosave does not prevent the queued strict flush", async () => {
  const queue = new DocumentSaveQueue();
  const autosave = queue.enqueue(async () => {
    throw new Error("autosave failed");
  });
  let strictFlushRan = false;
  const strictFlush = queue.enqueue(async () => {
    strictFlushRan = true;
  });

  await assert.rejects(autosave, /autosave failed/);
  await strictFlush;
  assert.equal(strictFlushRan, true);
});

test("a delayed rich autosave re-reads newer source-mode content", () => {
  const state = {
    sourceMode: false,
    sourceContent: "",
    richContent: "# Rich text before source mode",
    richIsEmpty: false,
  };
  const readWhenTimerFires = () => currentDocumentContent(state);

  state.sourceMode = true;
  state.sourceContent = "# Newer source-mode edit";

  assert.equal(readWhenTimerFires(), "# Newer source-mode edit");
});

test("Notes navigation distinguishes returning from creating a blank document", () => {
  assert.deepEqual(resolveLeaveNotesCommand(true), {
    id: "back-to-document",
    label: "Back to document",
  });
  assert.deepEqual(resolveLeaveNotesCommand(false), {
    id: "blank-document",
    label: "Blank document (no notes folder)",
  });
});

test("interface zoom clears legacy CSS zoom before applying native webview zoom", async () => {
  const events: string[] = [];
  const root = {
    style: {
      removeProperty: (property: string) => {
        events.push(`clear-css:${property}`);
        return "";
      },
    },
  };
  const webview = {
    setZoom: async (zoom: number) => {
      events.push(`native-zoom:${zoom}`);
    },
  };

  await applyInterfaceZoom(0.85, root, webview);

  assert.deepEqual(events, ["clear-css:zoom", "native-zoom:0.85"]);
});

test("dirty save status renders a filled center dot inside its outline", () => {
  const icon = CircleDotIcon({ className: "dirty-marker" });
  const children = icon.props.children as ReactElement<{
    d?: string;
    cx?: string;
    cy?: string;
    r?: string;
    fill?: string;
  }>[];
  const outline = children.find(
    (child) =>
      child.type === "path" &&
      child.props.d === "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
  );
  const dot = children.find((child) => child.type === "circle");

  assert.equal(outline?.props.d, "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0");
  assert.equal(dot?.props.cx, "12");
  assert.equal(dot?.props.cy, "12");
  assert.equal(dot?.props.r, "1.5");
  assert.equal(dot?.props.fill, "currentColor");
});

test("every popup menu is constrained to the window viewport", () => {
  const menuTags = sourceFiles("src/components").flatMap((file) =>
    [
      ...readFileSync(file, "utf8").matchAll(
        /<(?:DropdownMenu|ContextMenu)\.Content\b[\s\S]*?>/g,
      ),
    ].map((match) => ({ file, tag: match[0] })),
  );

  assert.ok(menuTags.length > 0);
  for (const { file, tag } of menuTags) {
    assert.match(tag, /collisionPadding=\{8\}/, file);
    assert.match(tag, /max-w-\[calc\(100vw-1rem\)\]/, file);
    assert.doesNotMatch(tag, /\bmin-w-\d+\b/, file);
    assert.match(
      tag,
      /max-h-\[var\(--radix-(?:dropdown|context)-menu-content-available-height\)\]/,
      file,
    );
  }
});
