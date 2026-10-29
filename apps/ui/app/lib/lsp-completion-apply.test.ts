import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type * as LSP from 'vscode-languageserver-protocol';
import { applyLspCompletion } from '#lib/lsp-completion-apply.js';

function view(text: string): EditorView {
  return new EditorView({ state: EditorState.create({ doc: text, selection: { anchor: text.length } }) });
}

describe('applyLspCompletion', () => {
  const item: LSP.CompletionItem = {
    label: 'gear',
    textEdit: { range: { start: { line: 1, character: 4 }, end: { line: 1, character: 6 } }, newText: 'gear($1)' },
    insertTextFormat: 2,
    additionalTextEdits: [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'use <gear.scad>\n' },
    ],
  };

  it('applies the import edit and the snippet at the server range for the answered revision', () => {
    const editor = view('one\nx = ge');
    applyLspCompletion(editor, { label: 'gear' }, { item, from: 4, to: 10, current: true });
    expect(editor.state.doc.toString()).toBe('use <gear.scad>\none\nx = gear()');
    expect(editor.state.selection.main.head).toBe('use <gear.scad>\none\nx = gear('.length);
  });

  it('keeps only edits before the typed word once typing has narrowed the list', () => {
    const editor = view('one\nx = gea;');
    const trailing = {
      range: { start: { line: 1, character: 8 }, end: { line: 1, character: 8 } },
      newText: ' // gear',
    };
    const stale = { ...item, additionalTextEdits: [...(item.additionalTextEdits ?? []), trailing] };
    applyLspCompletion(editor, { label: 'gear' }, { item: stale, from: 8, to: 11, current: false });
    expect(editor.state.doc.toString()).toBe('use <gear.scad>\none\nx = gear();');
  });
});
