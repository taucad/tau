import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { remarkLLMs } from 'fumadocs-core/mdx-plugins/remark-llms';
import { remarkLlmStringifyMdx } from '#lib/fumadocs/llm-stringify-mdx.js';
import { getLlmText } from '#lib/fumadocs/get-llms-text.js';
import { source } from '#lib/fumadocs/source.js';

const pageText = async (slugs: string[]): Promise<string> => {
  const page = source.getPage(slugs);
  if (!page) {
    throw new Error(`Missing documentation fixture: ${slugs.join('/')}`);
  }
  return getLlmText(page);
};

describe('processed documentation Markdown', () => {
  it('should retain generated type properties without JSX or escaped braces', async () => {
    const text = await pageText(['runtime', 'api', 'types']);
    expect(text).toContain('# Core Types');
    expect(text).toContain('success');
    expect(text).toContain('- **`success`** (`true`, required)');
    expect(text).not.toContain('<auto-type-table');
    expect(text).not.toContain('<TypeTable');
    expect(text).not.toContain(String.raw`\{`);
  });

  it('should retain Mermaid diagrams as fenced code', async () => {
    const text = await pageText(['runtime', 'concepts', 'architecture']);
    expect(text).toContain('```mermaid');
    expect(text).toContain('flowchart');
    expect(text).not.toContain('<Mermaid');
  });

  it('should replace interactive diagrams with a caption and omit module exports', async () => {
    const text = await pageText(['runtime', 'concepts', 'interactive-architecture']);
    expect(text).toContain('_[Diagram: Runtime Thread Topology —');
    expect(text).toContain('[architecture diagram](</runtime/concepts/architecture>)');
    expect(text).not.toContain('](./architecture)');
    expect(text).not.toContain('<InteractiveDiagram\n');
    expect(text).not.toContain('export const architectureNodes');
  });
});

describe('processed Markdown links', () => {
  it('should preserve rich labels, titles, parentheses and reference definitions', async () => {
    const file = {
      value:
        '[**Read me**](/runtime/path(with-parentheses) "Read the docs")\n\n[reference][guide]\n\n[guide]: /runtime/reference "Reference title"',
      data: { markdown: '' },
    };
    const processor = unified().use(remarkParse).use(remarkLlmStringifyMdx).use(remarkLLMs, { _data: true });
    await processor.run(processor.parse(file), file);
    expect(file.data.markdown).toContain('[**Read me**](</runtime/path(with-parentheses)> "Read the docs")');
    expect(file.data.markdown).toContain('[reference][guide]');
    expect(file.data.markdown).toContain('[guide]: </runtime/reference> "Reference title"');
  });
});
