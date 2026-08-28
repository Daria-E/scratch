import assert from "node:assert/strict";
import test from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import {
  clipboardPasteRoute,
  clipboardFilesToContent,
  type ResolvedClipboardFile,
} from "../src/lib/clipboardPaste.ts";
import {
  addClipboardPastePlaceholder,
  clipboardPastePlaceholderPlugin,
  findClipboardPasteRange,
  removeClipboardPastePlaceholder,
} from "../src/lib/clipboardPastePlaceholder.ts";

test("file-shaped clipboard data takes the native file path", () => {
  assert.equal(clipboardPasteRoute(["Files"], "", true), "files");
  assert.equal(clipboardPasteRoute(["image/png"], "", true), "bitmap");
});

test("clipboard file content preserves mixed native order", () => {
  const files: ResolvedClipboardFile[] = [
    { path: "/tmp/first.txt", isImage: false },
    {
      path: "/tmp/picture.png",
      isImage: true,
      assetUrl: "asset://localhost/tmp/assets/picture.png",
    },
    { path: "/tmp/second.txt", isImage: false },
    { path: "/tmp/third.txt", isImage: false },
  ];

  assert.deepEqual(clipboardFilesToContent(files), [
    {
      type: "paragraph",
      content: [{ type: "text", text: "/tmp/first.txt" }],
    },
    {
      type: "image",
      attrs: { src: "asset://localhost/tmp/assets/picture.png" },
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "/tmp/second.txt" },
        { type: "hardBreak" },
        { type: "text", text: "/tmp/third.txt" },
      ],
    },
  ]);
});

test("clipboard paste range maps unrelated edits and cancels when replaced", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { content: "text*", group: "block" },
      text: { group: "inline" },
    },
  });
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, schema.text("abc")),
  ]);
  const id = {};
  let state = EditorState.create({
    schema,
    doc,
    plugins: [clipboardPastePlaceholderPlugin],
  });

  state = state.apply(
    addClipboardPastePlaceholder(state.tr, id, { from: 2, to: 4 }),
  );
  assert.equal(state.doc.textContent, "abc");
  assert.deepEqual(findClipboardPasteRange(state, id), { from: 2, to: 4 });

  state = state.apply(state.tr.insertText("x", 1));
  assert.deepEqual(findClipboardPasteRange(state, id), { from: 3, to: 5 });

  state = state.apply(state.tr.insertText("z", 3, 5));
  assert.equal(findClipboardPasteRange(state, id), null);

  state = state.apply(removeClipboardPastePlaceholder(state.tr, id));
  assert.equal(findClipboardPasteRange(state, id), null);
});

test("clipboard paste range excludes boundary edits and requires both endpoints", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { content: "text*", group: "block" },
      text: { group: "inline" },
    },
  });
  const createState = (text: string) =>
    EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, schema.text(text)),
      ]),
      plugins: [clipboardPastePlaceholderPlugin],
    });

  const boundaryId = {};
  let boundaryState = createState("abc");
  boundaryState = boundaryState.apply(
    addClipboardPastePlaceholder(boundaryState.tr, boundaryId, {
      from: 2,
      to: 4,
    }),
  );
  boundaryState = boundaryState.apply(boundaryState.tr.insertText("y", 4));
  assert.deepEqual(findClipboardPasteRange(boundaryState, boundaryId), {
    from: 2,
    to: 4,
  });
  boundaryState = boundaryState.apply(boundaryState.tr.insertText("x", 2));
  assert.deepEqual(findClipboardPasteRange(boundaryState, boundaryId), {
    from: 3,
    to: 5,
  });

  const missingEndId = {};
  let missingEndState = createState("abcdef");
  missingEndState = missingEndState.apply(
    addClipboardPastePlaceholder(missingEndState.tr, missingEndId, {
      from: 2,
      to: 5,
    }),
  );
  missingEndState = missingEndState.apply(missingEndState.tr.delete(4, 6));
  assert.equal(findClipboardPasteRange(missingEndState, missingEndId), null);
});
