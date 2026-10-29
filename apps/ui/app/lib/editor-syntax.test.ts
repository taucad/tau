import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { syntaxTree, ensureSyntaxTree, getIndentation } from '@codemirror/language';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import { loadEditorSyntax } from '#lib/editor-syntax.js';
import { getEditorLanguage, isJsLikeFile } from '#lib/editor-languages.js';

const fixtures = [
  ['typescript', 'const radius: number = 12; // dimension'],
  ['typescriptreact', 'const mesh = <box name="測定" />;'],
  ['javascript', 'const radius = 12; // dimension'],
  ['javascriptreact', 'const mesh = <box name="測定" />;'],
  ['python', 'def radius(value):\n    return "測定" # label'],
  ['json', '{"nested":{"radius":12}}'],
  ['jsonc', '{ // radius\n "radius":12}'],
  ['jsonl', '{"radius":12}\n{"radius":13}'],
  ['markdown', '# Title\n**strong** and `code`'],
  ['yaml', 'radius: 12\nname: "測定"'],
  ['bash', '#!/bin/bash\necho "測定"'],
  ['csharp', 'public class Model { public double Radius = 12; }'],
  ['kcl', '/* measurement */\nradius = 12\nname = "測定"'],
  ['openscad', 'module part() { cube([1,2,3]); } // solid'],
  ['stepfile', "ISO-10303-21;\nDATA;\n#1=CARTESIAN_POINT('',(0.,0.,0.));\nENDSEC;"],
  ['stl', 'solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nendloop\nendfacet\nendsolid test'],
  ['usd', '#usda 1.0\ndef Xform "part" {\n double radius = 12\n}'],
  ['sysml', 'package Example { part def Wheel; }'],
] as const;

const tokens = (state: EditorState): string[] => {
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  const output: string[] = [];
  highlightTree(tree, classHighlighter, (from, to, classes) => output.push(`${classes}:${state.sliceDoc(from, to)}`));
  return output;
};

describe('editor syntax', () => {
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
      /tok-(keyword|string|number|comment|heading|strong|typeName|variableName)/u,
    );
    const updated = state.update({ changes: { from: state.doc.length, insert: '\n"unfinished' } }).state;
    expect(updated.doc.toString()).toBe(`${source}\n"unfinished`);
    expect(tokens(updated).length).toBeGreaterThan(0);
  });

  it('should carry multiline custom grammar state without leaking into another document', async () => {
    const syntax = await loadEditorSyntax('kcl');
    const state = EditorState.create({ doc: '/*\ninside comment\n*/\nradius = 2', extensions: [syntax] });
    expect(tokens(state).join('\n')).toContain('tok-comment:inside comment');
    const independent = EditorState.create({ doc: 'radius = 2', extensions: [syntax] });
    expect(tokens(independent).join('\n')).not.toContain('tok-comment');
    const updated = state.update({ changes: { from: 0, to: 2, insert: '//' } }).state;
    expect(tokens(updated).join('\n')).not.toContain('tok-comment:inside comment');
  });

  it.each(['main.cts', 'main.mts', 'main.cjs', 'main.mjs', 'MAIN.TSX'])(
    'should resolve the JavaScript family alias %s',
    (path) => {
      expect(isJsLikeFile(path)).toBe(true);
      expect(getEditorLanguage(path)).toBeDefined();
    },
  );
});
