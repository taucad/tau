import { describe, it, expect } from 'vitest';
import type { Root } from 'hast';
import { rehypeAtReferences } from '#components/markdown/rehype-at-references.js';

type TextNode = { type: 'text'; value: string };
type ElementNode = { type: 'element'; tagName: string; properties: Record<string, unknown>; children: HastNode[] };
type RootNode = { type: 'root'; children: HastNode[] };
type HastNode = TextNode | ElementNode;

function text(value: string): TextNode {
  return { type: 'text', value };
}

function element(tagName: string, ...children: HastNode[]): ElementNode {
  return { type: 'element', tagName, properties: {}, children };
}

function tree(...children: ElementNode[]): RootNode {
  return { type: 'root', children };
}

function runPlugin(root: RootNode): RootNode {
  rehypeAtReferences()(root as unknown as Root);
  return root;
}

describe('rehypeAtReferences', () => {
  it('should transform @path references into mark elements', () => {
    const root = tree(element('p', text('check @src/app.ts please')));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    expect(p.children).toHaveLength(3);
    expect((p.children[0] as TextNode).value).toBe('check ');
    expect((p.children[1] as ElementNode).tagName).toBe('mark');
    expect((p.children[1] as ElementNode).properties['data-at-reference']).toBe('src/app.ts');
    expect((p.children[2] as TextNode).value).toBe(' please');
  });

  it('should handle multiple references in one text node', () => {
    const root = tree(element('p', text('compare @src/a.ts and @src/b.ts')));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    expect(p.children).toHaveLength(4);
    expect((p.children[0] as TextNode).value).toBe('compare ');
    expect((p.children[1] as ElementNode).tagName).toBe('mark');
    expect((p.children[1] as ElementNode).properties['data-at-reference']).toBe('src/a.ts');
    expect((p.children[2] as TextNode).value).toBe(' and ');
    expect((p.children[3] as ElementNode).tagName).toBe('mark');
    expect((p.children[3] as ElementNode).properties['data-at-reference']).toBe('src/b.ts');
  });

  it('should skip @path patterns inside code elements', () => {
    const root = tree(element('p', element('code', text('@src/app.ts'))));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    const code = p.children[0] as ElementNode;
    expect(code.tagName).toBe('code');
    expect((code.children[0] as TextNode).value).toBe('@src/app.ts');
  });

  it('should skip @path patterns inside pre > code elements', () => {
    const root = tree(element('pre', element('code', text('@src/app.ts'))));

    runPlugin(root);

    const pre = root.children[0] as ElementNode;
    const code = pre.children[0] as ElementNode;
    expect(code.tagName).toBe('code');
    expect((code.children[0] as TextNode).value).toBe('@src/app.ts');
  });

  it('should skip @path patterns inside anchor elements', () => {
    const root = tree(element('p', element('a', text('@src/app.ts'))));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    const a = p.children[0] as ElementNode;
    expect(a.tagName).toBe('a');
    expect((a.children[0] as TextNode).value).toBe('@src/app.ts');
  });

  it('should leave non-matching text untouched', () => {
    const root = tree(element('p', text('hello world')));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    expect(p.children).toHaveLength(1);
    expect((p.children[0] as TextNode).value).toBe('hello world');
  });

  it('should not match @username without slash or dot', () => {
    const root = tree(element('p', text('hello @username')));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    expect(p.children).toHaveLength(1);
    expect((p.children[0] as TextNode).value).toBe('hello @username');
  });

  it('should handle reference at start of text', () => {
    const root = tree(element('p', text('@main.scad is the file')));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    expect(p.children).toHaveLength(2);
    expect((p.children[0] as ElementNode).tagName).toBe('mark');
    expect((p.children[0] as ElementNode).properties['data-at-reference']).toBe('main.scad');
    expect((p.children[1] as TextNode).value).toBe(' is the file');
  });

  it('should preserve mark element content with @path text', () => {
    const root = tree(element('p', text('see @.tau/transcripts/abc-123.jsonl')));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    const mark = p.children[1] as ElementNode;
    expect(mark.tagName).toBe('mark');
    const markText = mark.children[0] as TextNode;
    expect(markText.value).toBe('@.tau/transcripts/abc-123.jsonl');
  });

  it('should leave /command text untouched in markdown without catalog context', () => {
    const root = tree(element('p', text('/create-policy')));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    expect(p.children).toHaveLength(1);
    expect((p.children[0] as TextNode).value).toBe('/create-policy');
  });

  it('should handle mixed @path and /command in same text node', () => {
    const root = tree(element('p', text('/create-policy check @src/app.ts')));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    expect(p.children).toHaveLength(3);

    expect((p.children[0] as TextNode).value).toBe('/create-policy');
    expect((p.children[1] as TextNode).value).toBe(' check ');

    const atMark = p.children[2] as ElementNode;
    expect(atMark.tagName).toBe('mark');
    expect(atMark.properties['data-at-reference']).toBe('src/app.ts');
  });

  it('should skip /command inside code elements', () => {
    const root = tree(element('p', element('code', text('/create-policy'))));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    const code = p.children[0] as ElementNode;
    expect(code.tagName).toBe('code');
    expect((code.children[0] as TextNode).value).toBe('/create-policy');
  });

  it('should skip /command inside pre elements', () => {
    const root = tree(element('pre', element('code', text('/create-policy'))));

    runPlugin(root);

    const pre = root.children[0] as ElementNode;
    const code = pre.children[0] as ElementNode;
    expect((code.children[0] as TextNode).value).toBe('/create-policy');
  });

  it('should leave unknown /command as plain text', () => {
    const root = tree(element('p', text('/unknown-command')));

    runPlugin(root);

    const p = root.children[0] as ElementNode;
    expect(p.children).toHaveLength(1);
    expect((p.children[0] as TextNode).value).toBe('/unknown-command');
  });
});
