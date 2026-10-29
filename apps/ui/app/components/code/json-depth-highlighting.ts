import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import { Decoration, ViewPlugin } from '@codemirror/view';
import type { EditorView, ViewUpdate } from '@codemirror/view';

function depthDecorations(view: EditorView): ReturnType<typeof Decoration.set> {
  const ranges: Array<Range<Decoration>> = [];
  const tree = ensureSyntaxTree(view.state, view.viewport.to, 10) ?? syntaxTree(view.state);
  tree.iterate({
    enter: (node) => {
      let depth = 0;
      const { parent: initialParent } = node.node;
      for (let parent = initialParent; parent; parent = parent.parent) {
        if (parent.name === 'Object') {
          depth += 1;
        }
      }
      if (node.name === 'PropertyName' && node.to - node.from >= 2) {
        const colorIndex = Math.max(0, depth - 1) % 7;
        ranges.push(
          Decoration.mark({ class: `cm-json-key-depth${String(colorIndex)}` }).range(node.from + 1, node.to - 1),
        );
        ranges.push(Decoration.mark({ class: 'cm-json-key-quote' }).range(node.from, node.from + 1));
        ranges.push(Decoration.mark({ class: 'cm-json-key-quote' }).range(node.to - 1, node.to));
      }
      if (node.name === 'Object' && node.to - node.from >= 2) {
        const colorIndex = depth % 3;
        ranges.push(
          Decoration.mark({ class: `cm-json-bracket-depth${String(colorIndex)}` }).range(node.from, node.from + 1),
        );
        ranges.push(
          Decoration.mark({ class: `cm-json-bracket-depth${String(colorIndex)}` }).range(node.to - 1, node.to),
        );
      }
    },
  });
  ranges.sort((left, right) => left.from - right.from || left.to - right.to);
  return Decoration.set(ranges, true);
}

/** Preserve depth-colored JSON keys and braces while Lezer owns parsing. */
export const jsonDepthHighlighting = ViewPlugin.fromClass(
  class {
    public decorations: ReturnType<typeof Decoration.set>;
    public constructor(view: EditorView) {
      this.decorations = depthDecorations(view);
    }
    public update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((transaction) => transaction.reconfigured)
      ) {
        this.decorations = depthDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
