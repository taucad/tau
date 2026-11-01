import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TreeFragment } from '@lezer/common';
import type { Tree } from '@lezer/common';
import { highlightTree } from '@lezer/highlight';
import { describe, expect, it } from 'vitest';
import { grammarFixtures } from '#fixtures.js';
import { generateParser, grammarNames } from '#generate-parsers.js';
import { highlightLines } from '#highlight.js';
import { tauHighlighter } from '#highlighter.js';
import { highlightLanguages, resolveHighlightLanguageId, resolveHighlightLanguageIdForPath } from '#languages.js';
import { loadLanguage, peekLanguage } from '#registry.js';

const tokens = (lines: ReturnType<typeof highlightLines>): Array<readonly [string, string]> =>
  lines.flat().map((segment) => [segment.text, segment.className] as const);

const errorCount = (tree: Tree): number => {
  let errors = 0;
  tree.iterate({
    enter(node) {
      if (node.type.isError) {
        errors++;
      }
    },
  });
  return errors;
};

/** Whether some segment class list holds every class of `className`. */
const hasClasses = (found: readonly string[], className: string): boolean =>
  found.some((classNames) => className.split(' ').every((name) => classNames.split(' ').includes(name)));

const highlightRuns = (tree: Tree): string[] => {
  const runs: string[] = [];
  highlightTree(tree, tauHighlighter, (from, to, classes) => {
    runs.push(`${String(from)}-${String(to)}:${classes}`);
  });
  return runs;
};

describe('grammars', () => {
  it('should cover every highlight language with a fixture', () => {
    expect(Object.keys(grammarFixtures).sort()).toEqual([...highlightLanguages].sort());
  });

  it.each(grammarNames)('should commit the %s parser exactly as its grammar generates it', (name) => {
    const generated = generateParser(name, import.meta.dirname);
    expect(readFileSync(join(import.meta.dirname, name, `${name}.parser.ts`), 'utf8')).toBe(generated.parser);
    expect(readFileSync(join(import.meta.dirname, name, `${name}.parser.terms.ts`), 'utf8')).toBe(generated.terms);
  });

  describe.each(highlightLanguages)('%s', (language) => {
    const fixture = grammarFixtures[language];

    it('should parse its fixture without error nodes', async () => {
      const support = await loadLanguage(language);
      expect(errorCount(support.language.parser.parse(fixture.source))).toBe(0);
    });

    it.each(fixture.expect)('should highlight %j as %s', async (text, className) => {
      const highlighted = tokens(highlightLines(fixture.source, await loadLanguage(language)));
      const classes = highlighted.filter(([segment]) => segment === text).map(([, classNames]) => classNames);
      expect(hasClasses(classes, className), `classes for ${text}: ${JSON.stringify(classes)}`).toBe(true);
    });

    it('should reparse an edit incrementally to the same highlighting as a fresh parse', async () => {
      const support = await loadLanguage(language);
      const { parser } = support.language;
      const { source } = fixture;
      const tree = parser.parse(source);
      for (const at of [0, Math.floor(source.length / 3), Math.floor(source.length / 2), source.length]) {
        for (const insert of ['x', '\n', '"', '/*', '(']) {
          const edited = source.slice(0, at) + insert + source.slice(at);
          const fragments = TreeFragment.applyChanges(TreeFragment.addTree(tree), [
            { fromA: at, toA: at, fromB: at, toB: at + insert.length },
          ]);
          expect(highlightRuns(parser.parse(edited, fragments))).toEqual(highlightRuns(parser.parse(edited)));
        }
      }
    });

    it('should keep highlighting through unterminated strings and comments', async () => {
      const support = await loadLanguage(language);
      for (const tail of ['\n"unfinished', "\n'unfinished", '\n/* unfinished', '\n(((']) {
        const lines = highlightLines(fixture.source + tail, support);
        expect(lines.map((line) => line.map((segment) => segment.text).join('')).join('\n')).toBe(
          fixture.source + tail,
        );
        expect(lines.flat().some((segment) => segment.className !== '')).toBe(true);
      }
    });

    it('should load once and be available synchronously afterwards', async () => {
      const first = await loadLanguage(language);
      expect(await loadLanguage(language)).toBe(first);
      expect(peekLanguage(language)).toBe(first);
    });
  });

  it('should highlight fenced code in markdown with the fence language', async () => {
    const support = await loadLanguage('markdown');
    await loadLanguage('kcl');
    const source = '# Example\n\n```kcl\nfn mk(@d) {\n  return d\n}\n```\n';
    // The nested language loads lazily; parse twice so the second parse sees it.
    highlightLines(source, support);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    const highlighted = tokens(highlightLines(source, support));
    expect(highlighted).toContainEqual(['fn', 'tok-keyword']);
  });

  it.each([
    ['KCL', 'kcl'],
    ['.scad', 'openscad'],
    ['typescriptreact', 'tsx'],
    ['sh', 'bash'],
    ['ndjson', 'jsonl'],
    ['c#', 'csharp'],
    ['text', undefined],
    [undefined, undefined],
  ] as const)('should resolve %s to %s', (input, language) => {
    expect(resolveHighlightLanguageId(input)).toBe(language);
  });

  it('should resolve languages from paths', () => {
    expect(resolveHighlightLanguageIdForPath('lib/std/sketch.kcl')).toBe('kcl');
    expect(resolveHighlightLanguageIdForPath('__typescript_lib__/lib.es5.d.ts')).toBe('typescript');
    expect(resolveHighlightLanguageIdForPath('Makefile')).toBeUndefined();
  });

  it('should render plain lines without a language', () => {
    expect(highlightLines('a\n\nb')).toEqual([[{ text: 'a', className: '' }], [], [{ text: 'b', className: '' }]]);
  });
});
