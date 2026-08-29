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
});
