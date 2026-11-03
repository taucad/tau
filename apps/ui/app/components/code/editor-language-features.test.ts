import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  availableLanguageActions,
  languageFeatures,
  promptRename,
  symbolPathAt,
} from '#components/code/editor-language-features.js';
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

describe('inline rename', () => {
  const source = 'ringTeeth = 54\nplanetTeeth = (ringTeeth - 18) / 2\n';
  let view: EditorView | undefined;

  beforeAll(() => {
    // The jsdom environment has no text layout; the tooltip measures its anchor through Range rectangles.
    Object.assign(Range.prototype, { getClientRects: () => [], getBoundingClientRect: () => new DOMRect() });
  });

  afterAll(() => {
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
  });

  function open(cursor: number): EditorView {
    const parent = document.createElement('div');
    document.body.append(parent);
    view = new EditorView({ parent, state: EditorState.create({ doc: source, selection: { anchor: cursor } }) });
    return view;
  }

  function box(): HTMLInputElement | undefined {
    return document.querySelector<HTMLInputElement>('.cm-rename-input') ?? undefined;
  }

  function press(key: string): void {
    box()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  it('opens under the symbol with its name selected and the symbol marked', () => {
    const editor = open(source.lastIndexOf('ringTeeth') + 3);
    void promptRename(editor);
    const input = box()!;
    expect(input.value).toBe('ringTeeth');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'ringTeeth'.length]);
    expect(input.closest('.cm-tooltip')?.getAttribute('aria-label')).toBe('Rename symbol');
    expect(editor.dom.querySelector('.cm-rename-target')?.textContent).toBe('ringTeeth');
  });

  it('resolves the trimmed new name on Enter, closes and returns focus to the editor', async () => {
    const editor = open(2);
    const result = promptRename(editor);
    box()!.value = '  ringTeethCount ';
    press('Enter');
    await expect(result).resolves.toBe('ringTeethCount');
    expect(box()).toBeUndefined();
    expect(editor.dom.querySelector('.cm-rename-target')).toBeNull();
    expect(editor.hasFocus).toBe(true);
  });

  it.each([
    [
      'Escape cancels',
      (input: HTMLInputElement) => {
        input.value = 'other';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      },
    ],
    [
      'an unchanged name is a no-op',
      (input: HTMLInputElement) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      },
    ],
    [
      'a blank name is a no-op',
      (input: HTMLInputElement) => {
        input.value = '   ';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      },
    ],
    [
      'clicking away cancels',
      (input: HTMLInputElement) => {
        input.blur();
      },
    ],
  ])('%s', async (_name, act) => {
    const result = promptRename(open(2));
    act(box()!);
    await expect(result).resolves.toBeUndefined();
    expect(box()).toBeUndefined();
  });

  it('cancels when the document changes underneath it', async () => {
    const editor = open(2);
    const result = promptRename(editor);
    editor.dispatch({ changes: { from: source.length, insert: '// edit\n' } });
    await expect(result).resolves.toBeUndefined();
    expect(box()).toBeUndefined();
  });

  it('replaces an open rename and anchors on an explicit range', async () => {
    const editor = open(2);
    const first = promptRename(editor);
    const from = source.indexOf('planetTeeth');
    const second = promptRename(editor, { from, to: from + 'planetTeeth'.length });
    await expect(first).resolves.toBeUndefined();
    expect(box()!.value).toBe('planetTeeth');
    box()!.value = 'planetCount';
    press('Enter');
    await expect(second).resolves.toBe('planetCount');
  });
});
