import { editorSyntaxFixtures as fixtures } from '#lib/editor-syntax.fixtures.js';
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { syntaxTree, ensureSyntaxTree, getIndentation } from '@codemirror/language';
import { highlightTree } from '@lezer/highlight';
import { highlightLanguages, tauHighlighter } from '@taucad/grammars';
import { loadEditorSyntax } from '#lib/editor-syntax.js';
import { getEditorLanguage, isJsLikeFile } from '#lib/editor-languages.js';

const tokens = (state: EditorState): string[] => {
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  const output: string[] = [];
  highlightTree(tree, tauHighlighter, (from, to, classes) => output.push(`${classes}:${state.sliceDoc(from, to)}`));
  return output;
};

describe('editor syntax', () => {
  it('covers every supported language with a syntax fixture', () => {
    const ids = fixtures.map(([id]) => (id === 'typescriptreact' ? 'tsx' : id === 'javascriptreact' ? 'jsx' : id));
    expect([...ids].sort()).toEqual([...highlightLanguages].sort());
  });
  it('indents SysML blocks without counting braces inside strings or comments', async () => {
    const source = 'package Example {\n  // }\n  attribute label = "{";\n\n}';
    const state = EditorState.create({ doc: source, extensions: [await loadEditorSyntax('sysml')] });
    ensureSyntaxTree(state, source.length, 1000);
    expect(getIndentation(state, state.doc.line(4).from)).toBe(2);
    expect(getIndentation(state, state.doc.line(5).from)).toBe(0);
  });

  it.each([
    ['stl', undefined, []],
    ['jsonl', undefined, ['{', '[', '"']],
    ['stepfile', { block: { open: '/*', close: '*/' } }, ['(', '[', '{', "'"]],
    ['usd', { line: '#', block: { open: '/*', close: '*/' } }, ['(', '[', '{', "'", '"', '@', '<']],
  ] as const)('preserves valid comment and bracket commands for %s', async (language, comments, brackets) => {
    const state = EditorState.create({ doc: '', extensions: [await loadEditorSyntax(language)] });
    expect(state.languageDataAt('commentTokens', 0)[0]).toEqual(comments);
    expect(state.languageDataAt<{ brackets: readonly string[] }>('closeBrackets', 0)[0]?.brackets).toEqual(brackets);
  });

  it.each(fixtures)('should highlight actual %s tokens and keep edits parseable', async (language, source) => {
    const syntax = await loadEditorSyntax(language);
    const state = EditorState.create({ doc: source, extensions: [syntax] });
    expect(tokens(state).join('\n')).toMatch(
      /tok-(keyword|string|number|comment|heading|strong|type|variable|function)/u,
    );
    const updated = state.update({ changes: { from: state.doc.length, insert: '\n"unfinished' } }).state;
    expect(updated.doc.toString()).toBe(`${source}\n"unfinished`);
    expect(tokens(updated).length).toBeGreaterThan(0);
  });

  it('should carry multiline custom grammar state without leaking into another document', async () => {
    const syntax = await loadEditorSyntax('kcl');
    const state = EditorState.create({ doc: '/*\ninside comment\n*/\nradius = 2', extensions: [syntax] });
    expect(tokens(state).join('\n')).toContain('tok-comment:/*\ninside comment\n*/');
    const independent = EditorState.create({ doc: 'radius = 2', extensions: [syntax] });
    expect(tokens(independent).join('\n')).not.toContain('tok-comment');
    const updated = state.update({ changes: { from: 0, to: 2, insert: '//' } }).state;
    expect(tokens(updated).join('\n')).not.toContain('tok-comment:inside comment');
  });

  it('should parse every KCL standard library module without errors and keep its comments and keywords', async () => {
    const [syntax, { loadKclStdlib }, { kclStdlibExport }] = await Promise.all([
      loadEditorSyntax('kcl'),
      import('#lib/kcl-language/kcl-stdlib.js'),
      import('@taucad/api-extractor/kcl-stdlib'),
    ]);
    const library = await loadKclStdlib();
    const modules = [...new Set(kclStdlibExport.functions.map((definition) => definition.module))];
    expect(modules.length).toBeGreaterThan(3);
    for (const module of modules) {
      const source = library.source(module);
      expect(source, module).toBeDefined();
      const state = EditorState.create({ doc: source, extensions: [syntax] });
      const tree = ensureSyntaxTree(state, state.doc.length, 10_000) ?? syntaxTree(state);
      let errors = 0;
      tree.iterate({
        enter(node) {
          errors += node.type.isError ? 1 : 0;
        },
      });
      expect(errors, module).toBe(0);
      const output = tokens(state);
      // A body-less declaration such as `): Sketch` must not swallow the declarations after it.
      expect(output.filter((token) => token.includes(':///')).every((token) => token.startsWith('tok-comment'))).toBe(
        true,
      );
      const exports = output.filter((token) => token.endsWith(':export'));
      expect(exports.length, module).toBeGreaterThan(0);
      expect(
        exports.every((token) => token === 'tok-keyword:export'),
        module,
      ).toBe(true);
    }
  });

  it.each(['main.cts', 'main.mts', 'main.cjs', 'main.mjs', 'MAIN.TSX'])(
    'should resolve the JavaScript family alias %s',
    (path) => {
      expect(isJsLikeFile(path)).toBe(true);
      expect(getEditorLanguage(path)).toBeDefined();
    },
  );
});
