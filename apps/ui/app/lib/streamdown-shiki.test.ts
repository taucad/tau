import { describe, expect, it } from 'vitest';
import { createHighlighter } from '#lib/streamdown-shiki.js';

describe('Streamdown Shiki facade', () => {
  it('should preserve bundled language and theme highlighting with the JavaScript engine', async () => {
    const highlighter = await createHighlighter({
      langs: ['typescript'],
      themes: ['github-light', 'github-dark'],
    });
    const html = highlighter.codeToHtml('const answer: number = 42;', {
      lang: 'typescript',
      themes: { dark: 'github-dark', light: 'github-light' },
    });

    expect(html).toContain('class="shiki shiki-themes github-light github-dark"');
    expect(html).toMatch(/<span style="color:#[^;]+;--shiki-dark:#[^"]+">const<\/span>/u);
    highlighter.dispose();
  });
});
