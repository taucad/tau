import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { availableLanguageActions, languageFeatures, symbolPathAt } from '#components/code/editor-language-features.js';
import type { EditorSymbol } from '#components/code/editor-language-features.js';

function symbol(
  name: string,
  [from, to]: readonly [number, number],
  children: readonly EditorSymbol[] = [],
): EditorSymbol {
  return { name, kind: 'function', from, to, selectionFrom: from, children };
}

describe('editor language features', () => {
  it('returns the outermost-to-innermost symbol chain around a position', () => {
    const symbols = [
      symbol('Gear', [0, 40], [symbol('teeth', [5, 10]), symbol('mesh', [12, 30], [symbol('ratio', [15, 20])])]),
    ];
    expect(symbolPathAt(symbols, 16).map((entry) => entry.name)).toEqual(['Gear', 'mesh', 'ratio']);
    expect(symbolPathAt(symbols, 35).map((entry) => entry.name)).toEqual(['Gear']);
    expect(symbolPathAt(symbols, 50)).toEqual([]);
  });

  it('merges language contributions and only offers editing commands in a writable editor', () => {
    const contributions = [
      languageFeatures.of({ references: async () => [], rename: () => undefined }),
      languageFeatures.of({ format: () => undefined }),
    ];
    const writable = EditorState.create({ extensions: contributions });
    expect(availableLanguageActions(writable).map((action) => [action.label, action.disabled])).toEqual([
      ['Find All References', false],
      ['Rename Symbol', false],
      ['Format Document', false],
    ]);
    const readOnly = EditorState.create({ extensions: [contributions, EditorState.readOnly.of(true)] });
    expect(availableLanguageActions(readOnly).map((action) => action.disabled)).toEqual([false, true, true]);
    expect(availableLanguageActions(EditorState.create())).toEqual([]);
  });
});
