import { forceLinting, linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { StateEffect, StateField } from '@codemirror/state';
import type { Extension, Text } from '@codemirror/state';
import { ViewPlugin } from '@codemirror/view';
import type { EditorDiagnostic, EditorDiagnostics } from '#lib/editor-diagnostics.js';

type DiagnosticRange = Readonly<{ from: number; to: number }>;

/**
 * Moves a range's start past the line breaks it begins with. The lint gutter marks the line holding `from` while the
 * underline only paints visible text, so a range starting on the previous line's break draws its marker one row above
 * its squiggle. The KCL server reports every column-0 start that way.
 */
export function startAfterLineBreaks(text: string | Text, range: DiagnosticRange): DiagnosticRange {
  const read =
    typeof text === 'string' ? (at: number) => text.slice(at, at + 1) : (at: number) => text.sliceString(at, at + 1);
  const { length } = text;
  const to = Math.max(0, Math.min(range.to, length));
  let from = Math.max(0, Math.min(range.from, to));
  while (from < to && (read(from) === '\n' || read(from) === '\r')) {
    from += 1;
  }
  return { from, to };
}

/** The CodeMirror diagnostic for an editor diagnostic, clamped to the document and starting on its first drawn row. */
export function codeMirrorDiagnostic(text: Text, diagnostic: EditorDiagnostic): Diagnostic {
  const { from, to } = startAfterLineBreaks(text, diagnostic);
  const { message, severity, source } = diagnostic;
  return source === undefined ? { from, to, message, severity } : { from, to, message, severity, source };
}

/**
 * Shows one diagnostics owner as a lint source. Lint sources combine, where `setDiagnostics` replaces every other
 * source's diagnostics. Between publications the owner's diagnostics move with the edits, so a re-lint never puts one
 * back at the offsets of an older text.
 */
export function storeDiagnostics(
  diagnostics: EditorDiagnostics,
  document: Readonly<{ uri: string }>,
  owner: string,
): Extension {
  const read = (text: Text): readonly Diagnostic[] =>
    (diagnostics.get(document.uri).get(owner) ?? []).map((diagnostic) => codeMirrorDiagnostic(text, diagnostic));
  const publish = StateEffect.define<readonly Diagnostic[]>();
  const shown = StateField.define<readonly Diagnostic[]>({
    create: (state) => read(state.doc),
    update(value, transaction) {
      const effect = transaction.effects.findLast((candidate) => candidate.is(publish));
      if (effect) {
        return effect.value;
      }
      if (!transaction.docChanged) {
        return value;
      }
      return value.map((diagnostic) => {
        const from = transaction.changes.mapPos(diagnostic.from, 1);
        return { ...diagnostic, from, to: Math.max(from, transaction.changes.mapPos(diagnostic.to, -1)) };
      });
    },
  });
  return [
    shown,
    linter((view) => view.state.field(shown), {
      delay: 100,
      needsRefresh: (update) =>
        update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(publish))),
    }),
    ViewPlugin.define((view) => {
      const unsubscribe = diagnostics.subscribe((event) => {
        if (event.uri === document.uri && event.owner === owner) {
          view.dispatch({ effects: publish.of(read(view.state.doc)) });
          forceLinting(view);
        }
      });
      return { destroy: unsubscribe };
    }),
  ];
}
