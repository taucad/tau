import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { publicationRehypeSanitize } from '#components/markdown/markdown-sanitize.js';

/* oxlint-disable typescript-eslint/no-explicit-any, typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-member-access -- bridging unified plugin tuple types across mdast/hast pipeline */
async function renderHtml(markdown: string): Promise<string> {
  const processor: any = unified().use(remarkParse).use(remarkRehype, { allowDangerousHtml: true });

  for (const entry of publicationRehypeSanitize) {
    const [plugin, options] = entry as readonly [unknown, unknown?];
    if (options === undefined) {
      processor.use(plugin);
    } else {
      processor.use(plugin, options);
    }
  }

  const file = await processor.use(rehypeStringify, { allowDangerousHtml: true }).process(markdown);
  return String(file);
}
/* oxlint-enable typescript-eslint/no-explicit-any, typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-member-access -- end unified pipeline window */

describe('publicationRehypeSanitize', () => {
  it('strips <script> tags entirely', async () => {
    const html = await renderHtml('<script>alert(1)</script>\n\nhello');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('hello');
  });

  it('strips <iframe> tags entirely', async () => {
    const html = await renderHtml('<iframe src="https://evil.example"></iframe>\n\nhello');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('hello');
  });

  it('strips javascript: URLs from anchors', async () => {
    // oxlint-disable-next-line no-script-url -- intentionally testing the dangerous URL is stripped
    const html = await renderHtml('[click](javascript:alert(1))');
    // oxlint-disable-next-line no-script-url -- substring check on the stripped output
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('alert(1)');
  });

  it('forces rel="nofollow noopener noreferrer" + target="_blank" on every anchor', async () => {
    const html = await renderHtml('[external](https://example.com/path)');
    expect(html).toContain('href="https://example.com/path"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it('preserves code-block language classes for syntax highlighting', async () => {
    const html = await renderHtml('```ts\nconst x = 1;\n```');
    expect(html).toContain('language-ts');
  });
});
