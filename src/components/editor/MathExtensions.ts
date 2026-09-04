import { InputRule } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Standard number-field shortcuts for KaTeX (shared by nodes and the popup).
export const katexMacros: Record<string, string> = {
  "\\R": "\\mathbb{R}",
  "\\N": "\\mathbb{N}",
  "\\Z": "\\mathbb{Z}",
  "\\Q": "\\mathbb{Q}",
  "\\C": "\\mathbb{C}",
};

export function normalizeBlockMath(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^\$\$([\s\S]*?)\$\$$/);
  return (match?.[1] ?? trimmed).trim();
}

export function normalizeInlineMath(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^\$([\s\S]*?)\$$/);
  return (match?.[1] ?? trimmed).trim();
}

// A line with `dir="auto"` takes its direction from its first strong character.
// KaTeX renders Latin letters, so math at the start of an RTL line would flip
// the whole line to LTR. HTML's auto-directionality skips text inside
// descendants that carry their own `dir`, so tagging the node keeps the formula
// out of that decision — and keeps the formula itself rendering LTR.
function mathDirectionDecorations(
  doc: ProseMirrorNode,
  typeName: string,
): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== typeName) return true;
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir: "ltr" }));
    return false;
  });

  return DecorationSet.create(doc, decorations);
}

function createMathSelectionPlugin(
  typeName: "blockMath" | "inlineMath",
  onClick?: (node: ProseMirrorNode, pos: number) => void,
) {
  const key = new PluginKey<DecorationSet>(`${typeName}Selection`);

  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => mathDirectionDecorations(state.doc, typeName),
      apply: (tr, decorations) =>
        tr.docChanged
          ? mathDirectionDecorations(tr.doc, typeName)
          : decorations,
    },
    view() {
      return {
        // Clear native DOM selection when a math node is selected.
        // ProseMirror's NodeSelection can otherwise leave a browser highlight
        // bleeding beyond the atom node.
        update(view) {
          const { selection } = view.state;
          if (
            selection instanceof NodeSelection &&
            selection.node.type.name === typeName
          ) {
            window.getSelection()?.removeAllRanges();
          }
        },
      };
    },
    props: {
      decorations: (state) => key.getState(state),

      // Open the editor on Enter or Space when a math node is selected.
      handleKeyDown(view, event) {
        if (event.key !== "Enter" && event.key !== " ") return false;
        const { selection } = view.state;
        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === typeName &&
          onClick
        ) {
          event.preventDefault();
          onClick(selection.node, selection.from);
          return true;
        }
        return false;
      },
    },
  });
}

export const ScratchBlockMath = BlockMath.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$([^$]+)\$\$$/,
        handler: ({ state, range, match }) => {
          const latex = (match[1] ?? "").trim();
          if (!latex) return;

          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ latex }),
          );
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [createMathSelectionPlugin("blockMath", this.options.onClick)];
  },
});

export const ScratchInlineMath = InlineMath.extend({
  addInputRules() {
    return [
      new InputRule({
        find: (text) => {
          const match = text.match(
            /(^|[^\w$])\$(?!\d)([^$\n]+?)\$(?!\$)$/,
          );
          if (!match) return null;

          const latex = (match[2] ?? "").trim();
          if (!latex) return null;

          const prefix = match[1] ?? "";
          return {
            index: (match.index ?? 0) + prefix.length,
            text: match[0].slice(prefix.length),
            data: { latex },
          };
        },
        handler: ({ state, range, match }) => {
          const latex = String(match.data?.latex ?? "").trim();
          if (!latex) return;

          state.tr.replaceWith(
            range.from,
            range.to,
            state.schema.nodes.inlineMath.create({ latex }),
          );
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      createMathSelectionPlugin("inlineMath", this.options.onClick),
    ];
  },
});
