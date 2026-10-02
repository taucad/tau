import { describe, expect, it } from 'vitest';
import { getHighlighter } from '#lib/shiki.lib.js';
import { supportedHighlightLanguages } from '#lib/code-language-resolution.js';

describe('shiki.lib', () => {
  it('should return a highlighter instance on first call', async () => {
    const highlighter = await getHighlighter();
    expect(highlighter).toBeDefined();
    expect(typeof highlighter.codeToHtml).toBe('function');
  });

  it('should return the same instance on subsequent calls', async () => {
    const first = await getHighlighter();
    const second = await getHighlighter();
    expect(first).toBe(second);
  });

  it('should load every supported highlight language', async () => {
    const highlighter = await getHighlighter();
    const loadedLanguages = highlighter.getLoadedLanguages();

    for (const language of supportedHighlightLanguages) {
      expect(loadedLanguages).toContain(language);
    }
  });

  it('should load standard and high-contrast GitHub themes', async () => {
    const highlighter = await getHighlighter();

    expect(highlighter.getLoadedThemes()).toEqual(
      expect.arrayContaining([
        'github-light',
        'github-dark',
        'github-light-high-contrast',
        'github-dark-high-contrast',
      ]),
    );
  });

  it.each(['"""', "'''"])('should end Python docstrings delimited by %s', async (delimiter) => {
    const highlighter = await getHighlighter();
    const source = `${delimiter}\nA Python module.\n${delimiter}\ndef polar(radius):\n    return 2.0 # scale`;

    for (const theme of highlighter.getLoadedThemes()) {
      const { tokens } = highlighter.codeToTokens(source, { lang: 'python', theme });
      expect(tokens[3]?.[0]?.content).toBe('def');
      expect(new Set(tokens[4]?.map(({ color }) => color)).size).toBeGreaterThan(2);
    }
  });

  it.each(['', 'r', 'R', 'u', 'b', 'br', 'f', 'fr', 'rf'])(
    'should preserve Python string delimiters with prefix "%s"',
    async (prefix) => {
      const highlighter = await getHighlighter();
      for (const delimiter of ['"', "'", '"""', "'''"]) {
        const opposite = (delimiter.includes('"') ? "'" : '"').repeat(delimiter.length);
        const source = `value = ${prefix}${delimiter}opposite: ${opposite} tail {1 + 2}${delimiter}\ndef polar(radius):\n    return 2.0 # scale`;
        const { tokens } = highlighter.codeToTokens(source, { lang: 'python', theme: 'github-light' });
        expect(tokens[0]?.find(({ content }) => content.includes('tail'))?.color).toBe('#032F62');
        expect(tokens[1]?.[0]?.content).toBe('def');
        expect(new Set(tokens[2]?.map(({ color }) => color)).size).toBeGreaterThan(2);
      }
    },
  );
});
