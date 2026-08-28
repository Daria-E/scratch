import { Extension } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

type ClipboardPastePlaceholderId = object;
export type ClipboardPasteRange = { from: number; to: number };
type ClipboardPastePlaceholderMeta =
  | {
      add: {
        id: ClipboardPastePlaceholderId;
        range: ClipboardPasteRange;
      };
    }
  | { remove: { id: ClipboardPastePlaceholderId } };

const clipboardPastePlaceholderKey = new PluginKey<DecorationSet>(
  "clipboardPastePlaceholder",
);

export const clipboardPastePlaceholderPlugin = new Plugin<DecorationSet>({
  key: clipboardPastePlaceholderKey,
  state: {
    init: () => DecorationSet.empty,
    apply(transaction, oldSet) {
      let set = oldSet.map(transaction.mapping, transaction.doc);
      const meta = transaction.getMeta(
        clipboardPastePlaceholderKey,
      ) as ClipboardPastePlaceholderMeta | undefined;

      if (meta && "add" in meta) {
        const markers = [
          Decoration.widget(
            meta.add.range.from,
            () => document.createElement("span"),
            {
              id: meta.add.id,
              edge: "from",
              collapsed: meta.add.range.from === meta.add.range.to,
              side: 1,
            },
          ),
        ];
        if (meta.add.range.to !== meta.add.range.from) {
          markers.push(
            Decoration.widget(
              meta.add.range.to,
              () => document.createElement("span"),
              { id: meta.add.id, edge: "to", side: -1 },
            ),
          );
        }
        set = set.add(transaction.doc, markers);
      } else if (meta && "remove" in meta) {
        set = set.remove(
          set.find(undefined, undefined, (spec) => spec.id === meta.remove.id),
        );
      }

      return set;
    },
  },
  props: {
    decorations(state) {
      return clipboardPastePlaceholderKey.getState(state) ?? null;
    },
  },
});

export const ClipboardPastePlaceholder = Extension.create({
  name: "clipboardPastePlaceholder",
  addProseMirrorPlugins() {
    return [clipboardPastePlaceholderPlugin];
  },
});

export function addClipboardPastePlaceholder(
  transaction: Transaction,
  id: ClipboardPastePlaceholderId,
  range: ClipboardPasteRange,
): Transaction {
  return transaction.setMeta(clipboardPastePlaceholderKey, {
    add: { id, range },
  });
}

export function removeClipboardPastePlaceholder(
  transaction: Transaction,
  id: ClipboardPastePlaceholderId,
): Transaction {
  return transaction.setMeta(clipboardPastePlaceholderKey, { remove: { id } });
}

export function findClipboardPasteRange(
  state: EditorState,
  id: ClipboardPastePlaceholderId,
): ClipboardPasteRange | null {
  const markers = clipboardPastePlaceholderKey
    .getState(state)
    ?.find(undefined, undefined, (spec) => spec.id === id);
  const fromMarker = markers?.find((marker) => marker.spec.edge === "from");
  if (!fromMarker) return null;
  const from = fromMarker.from;
  if (fromMarker.spec.collapsed) return { from, to: from };
  const to = markers?.find((marker) => marker.spec.edge === "to")?.from;
  if (to === undefined) return null;
  return { from, to };
}
