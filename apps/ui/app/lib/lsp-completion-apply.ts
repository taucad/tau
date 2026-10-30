import { snippet } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import type { Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type * as LSP from 'vscode-languageserver-protocol';
import { lspSnippetToCodeMirror } from '#lib/lsp-completion-snippet.js';

function offsetIn(text: Text, position: LSP.Position): number {
  if (position.line >= text.lines) {
    return text.length;
  }
  const line = text.line(position.line + 1);
  return Math.min(line.from + position.character, line.to);
}

export type LspCompletionAcceptance = Readonly<{
  item: LSP.CompletionItem;
  /** CodeMirror's completion range, mapped to the current text. */
  from: number;
  to: number;
  /** Whether the text still matches the revision the server answered for. */
  current: boolean;
}>;

/**
 * Apply an accepted LSP completion with its `additionalTextEdits`, such as an added import.
 *
 * Typing that narrows an open list only changes text from `from` on, so a stale item keeps its edits before
 * `from` and replaces CodeMirror's range instead of the server's.
 */
export function applyLspCompletion(
  view: EditorView,
  completion: Completion,
  { item, from, to, current }: LspCompletionAcceptance,
): void {
  const text = view.state.doc;
  const edit = item.textEdit;
  const range = current && edit && 'range' in edit ? edit.range : undefined;
  const insertText = edit ? edit.newText : (item.insertText ?? item.label);
  const replaceFrom = range ? offsetIn(text, range.start) : from;
  const replaceTo = range ? offsetIn(text, range.end) : to;
  const additions = (item.additionalTextEdits ?? [])
    .map((addition) => ({
      from: offsetIn(text, addition.range.start),
      to: offsetIn(text, addition.range.end),
      insert: addition.newText,
    }))
    .filter((addition) => current || addition.to <= from);
  const imports = view.state.changes(additions);
  if (additions.length > 0) {
    view.dispatch({ changes: imports, userEvent: 'input.complete' });
  }
  const start = imports.mapPos(replaceFrom, 1);
  const end = imports.mapPos(replaceTo, 1);
  if (item.insertTextFormat === 2) {
    snippet(lspSnippetToCodeMirror(insertText))(view, completion, start, end);
  } else {
    view.dispatch({ changes: { from: start, to: end, insert: insertText }, userEvent: 'input.complete' });
  }
}
