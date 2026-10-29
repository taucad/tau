import { describe, expect, it } from 'vitest';
import { renderEditorDocumentation } from '#components/code/editor-documentation.js';

describe('editor documentation', () => {
  it('keeps formatted documentation without loading images or executable markup', () => {
    const dom = renderEditorDocumentation(
      '**Shape** `size`\n\n![remote](https://example.com/track)\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))',
    );
    expect(dom.querySelector('strong')?.textContent).toBe('Shape');
    expect(dom.querySelector('code')?.textContent).toBe('size');
    expect(dom.querySelector('img, script, [href^="javascript:"]')).toBeNull();
  });
});
