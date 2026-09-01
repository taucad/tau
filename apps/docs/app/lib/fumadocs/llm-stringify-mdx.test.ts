import { describe, expect, it } from 'vitest';
import type { GeneratedDoc } from 'fumadocs-typescript';
import { llmStringifyMdx } from '#lib/fumadocs/llm-stringify-mdx.js';

type MdxJsxFlowFixture = {
  type: 'mdxJsxFlowElement';
  name: string;
  attributes: Array<
    | { type: 'mdxJsxAttribute'; name: string; value: string }
    | {
        type: 'mdxJsxAttribute';
        name: string;
        value: { type: 'mdxJsxAttributeValueExpression'; value: string; data: unknown };
      }
  >;
  children: readonly never[];
};

const typeTableFixture = (generatedDocument: GeneratedDoc): MdxJsxFlowFixture => ({
  type: 'mdxJsxFlowElement',
  name: 'TypeTable',
  attributes: [
    {
      type: 'mdxJsxAttribute',
      name: 'id',
      value: `type-table-${generatedDocument.id}`,
    },
    {
      type: 'mdxJsxAttribute',
      name: 'type',
      value: {
        type: 'mdxJsxAttributeValueExpression',
        value: JSON.stringify(generatedDocument, null, 2),
        data: { estree: { type: 'Program', sourceType: 'module', body: [] } },
      },
    },
  ],
  children: [],
});

describe('llmStringifyMdx', () => {
  it('returns undefined for non-TypeTable, non-Mermaid mdx elements', () => {
    const node: MdxJsxFlowFixture = {
      type: 'mdxJsxFlowElement',
      name: 'Callout',
      attributes: [],
      children: [],
    };
    expect(llmStringifyMdx(node)).toBeUndefined();
  });

  it('returns undefined for TypeTable without a type attribute JSON string', () => {
    const node: MdxJsxFlowFixture = {
      type: 'mdxJsxFlowElement',
      name: 'TypeTable',
      attributes: [{ type: 'mdxJsxAttribute', name: 'id', value: 'x' }],
      children: [],
    };
    expect(llmStringifyMdx(node)).toBeUndefined();
  });

  it('returns undefined when type JSON is not a valid GeneratedDoc', () => {
    const node: MdxJsxFlowFixture = {
      type: 'mdxJsxFlowElement',
      name: 'TypeTable',
      attributes: [
        {
          type: 'mdxJsxAttribute',
          name: 'type',
          value: {
            type: 'mdxJsxAttributeValueExpression',
            value: '{"foo":1}',
            data: { estree: { type: 'Program', sourceType: 'module', body: [] } },
          },
        },
      ],
      children: [],
    };
    expect(llmStringifyMdx(node)).toBeUndefined();
  });

  it('returns undefined when type JSON parse throws', () => {
    const node: MdxJsxFlowFixture = {
      type: 'mdxJsxFlowElement',
      name: 'TypeTable',
      attributes: [
        {
          type: 'mdxJsxAttribute',
          name: 'type',
          value: {
            type: 'mdxJsxAttributeValueExpression',
            value: '{not json',
            data: { estree: { type: 'Program', sourceType: 'module', body: [] } },
          },
        },
      ],
      children: [],
    };
    expect(llmStringifyMdx(node)).toBeUndefined();
  });

  it('renders type header and a required prop bullet with description', () => {
    const generatedDocument: GeneratedDoc = {
      id: 't.ts-Foo',
      name: 'Foo',
      description: 'A test type.',
      entries: [
        {
          name: 'bar',
          description: 'Bar field.',
          type: 'string',
          simplifiedType: 'string',
          tags: [],
          required: true,
          deprecated: false,
        },
      ],
    };
    const out = llmStringifyMdx(typeTableFixture(generatedDocument));
    expect(out).toContain('**`Foo`** — A test type.');
    expect(out).toContain('- **`bar`** (`string`, required) — Bar field.');
    expect(out).not.toContain('| Prop |');
    expect(out).not.toMatch(/<br>/u);
    expect(out).not.toContain(String.raw`\|`);
  });

  it('joins multiple property bullets with single newlines (no blank lines between items)', () => {
    const generatedDocument: GeneratedDoc = {
      id: 't.ts-MultiProp',
      name: 'Opts',
      entries: [
        {
          name: 'a',
          description: 'one',
          type: 'string',
          simplifiedType: 'string',
          tags: [],
          required: true,
          deprecated: false,
        },
        {
          name: 'b',
          description: 'two',
          type: 'number',
          simplifiedType: 'number',
          tags: [],
          required: false,
          deprecated: false,
        },
      ],
    };
    const out = llmStringifyMdx(typeTableFixture(generatedDocument));
    expect(out).toContain('- **`a`** (`string`, required) — one\n- **`b`** (`number`, optional) — two');
    expect(out).not.toContain('- **`a`**\n\n- **`b`**');
  });

  it('renders optional props without required label', () => {
    const generatedDocument: GeneratedDoc = {
      id: 't.ts-Union',
      name: 'UnionType',
      entries: [
        {
          name: 'x',
          description: 'd',
          type: 'string[] | undefined',
          simplifiedType: 'union',
          tags: [],
          required: false,
          deprecated: false,
        },
      ],
    };
    const out = llmStringifyMdx(typeTableFixture(generatedDocument));
    expect(out).toContain('- **`x`** (`string[] | undefined`, optional) — d');
    expect(out).not.toContain(String.raw`\|`);
  });

  it('renders multiline descriptions as loose-list continuation without br tags', () => {
    const generatedDocument: GeneratedDoc = {
      id: 't.ts-Multi',
      name: 'Multi',
      entries: [
        {
          name: 'a',
          description: 'Line one.\nLine two.',
          type: 'number',
          simplifiedType: 'number',
          tags: [],
          required: true,
          deprecated: false,
        },
      ],
    };
    const out = llmStringifyMdx(typeTableFixture(generatedDocument));
    expect(out).toContain('— Line one. Line two.');
    expect(out).not.toMatch(/<br>/u);
  });

  it('splits description paragraphs with blank lines and two-space indent', () => {
    const generatedDocument: GeneratedDoc = {
      id: 't.ts-Para',
      name: 'Para',
      entries: [
        {
          name: 'p',
          description: 'First block.\n\nSecond block.',
          type: 'string',
          simplifiedType: 'string',
          tags: [],
          required: true,
          deprecated: false,
        },
      ],
    };
    const out = llmStringifyMdx(typeTableFixture(generatedDocument));
    expect(out).toContain('— First block.\n\n  Second block.');
  });

  it('marks deprecated props with strikethrough', () => {
    const generatedDocument: GeneratedDoc = {
      id: 't.ts-Dep',
      name: 'Dep',
      entries: [
        {
          name: 'old',
          description: 'gone',
          type: 'string',
          simplifiedType: 'string',
          tags: [],
          required: false,
          deprecated: true,
        },
      ],
    };
    const out = llmStringifyMdx(typeTableFixture(generatedDocument));
    expect(out).toContain('- **~~`old`~~**');
  });

  it('includes default tag in meta with relaxed curly escapes', () => {
    const generatedDocument: GeneratedDoc = {
      id: 't.ts-Def',
      name: 'Def',
      entries: [
        {
          name: 'n',
          description: 'count',
          type: 'number',
          simplifiedType: 'number',
          tags: [{ name: 'default', text: '\\{\\}' }],
          required: false,
          deprecated: false,
        },
      ],
    };
    const out = llmStringifyMdx(typeTableFixture(generatedDocument));
    expect(out).toContain('default `{}`');
    expect(out).not.toContain(String.raw`\{`);
    expect(out).not.toContain(String.raw`\}`);
  });

  it('surfaces non-default tags on a Tags continuation line', () => {
    const generatedDocument: GeneratedDoc = {
      id: 't.ts-Tags',
      name: 'Tags',
      entries: [
        {
          name: 'p',
          description: 'body',
          type: 'string',
          simplifiedType: 'string',
          tags: [{ name: 'example', text: '`x`' }],
          required: true,
          deprecated: false,
        },
      ],
    };
    const out = llmStringifyMdx(typeTableFixture(generatedDocument));
    expect(out).toContain('Tags: @example `x`');
  });

  it('emits _No properties._ when entries is empty', () => {
    const generatedDocument: GeneratedDoc = {
      id: 't.ts-Empty',
      name: 'Empty',
      entries: [],
    };
    const out = llmStringifyMdx(typeTableFixture(generatedDocument));
    expect(out).toContain('**`Empty`**');
    expect(out).toContain('_No properties._');
    expect(out).not.toContain('| Prop |');
  });

  it('accepts a plain string type attribute (no mdxJsxAttributeValueExpression)', () => {
    const generatedDocument: GeneratedDoc = {
      id: 'plain',
      name: 'Plain',
      entries: [
        {
          name: 'x',
          description: 'y',
          type: 'boolean',
          simplifiedType: 'boolean',
          tags: [],
          required: true,
          deprecated: false,
        },
      ],
    };
    const node: MdxJsxFlowFixture = {
      type: 'mdxJsxFlowElement',
      name: 'TypeTable',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'id', value: 'id' },
        { type: 'mdxJsxAttribute', name: 'type', value: JSON.stringify(generatedDocument) },
      ],
      children: [],
    };
    const out = llmStringifyMdx(node);
    expect(out).toContain('- **`x`** (`boolean`, required) — y');
  });

  it('returns undefined for non-mdx root nodes', () => {
    const paragraphLikeNode: unknown = { type: 'paragraph', children: [] };
    expect(llmStringifyMdx(paragraphLikeNode)).toBeUndefined();
  });

  it('stringifies Mermaid chart to a fenced mermaid block', () => {
    const node: MdxJsxFlowFixture = {
      type: 'mdxJsxFlowElement',
      name: 'Mermaid',
      attributes: [{ type: 'mdxJsxAttribute', name: 'chart', value: '  flowchart TD\n  A-->B  ' }],
      children: [],
    };
    const out = llmStringifyMdx(node);
    expect(out).toBe('```mermaid\nflowchart TD\n  A-->B\n```');
  });

  it('returns undefined for Mermaid without chart attribute', () => {
    const node: MdxJsxFlowFixture = {
      type: 'mdxJsxFlowElement',
      name: 'Mermaid',
      attributes: [],
      children: [],
    };
    expect(llmStringifyMdx(node)).toBeUndefined();
  });

  it('returns undefined for Mermaid with empty chart', () => {
    const node: MdxJsxFlowFixture = {
      type: 'mdxJsxFlowElement',
      name: 'Mermaid',
      attributes: [{ type: 'mdxJsxAttribute', name: 'chart', value: '' }],
      children: [],
    };
    expect(llmStringifyMdx(node)).toBeUndefined();
  });
});
