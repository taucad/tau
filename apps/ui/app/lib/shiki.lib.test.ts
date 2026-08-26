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
});
