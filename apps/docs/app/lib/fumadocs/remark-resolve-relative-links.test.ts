// @vitest-environment node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  findContentDocsDirectory,
  markdownPathToDocsUrlPath,
  remarkResolveRelativeLinks,
} from '#lib/fumadocs/remark-resolve-relative-links.js';
import type { RemarkResolveRelativeLinksTransformer } from '#lib/fumadocs/remark-resolve-relative-links.js';

type TestText = { type: 'text'; value: string };
type TestLink = { type: 'link'; url: string; children: TestText[] };
type TestParagraph = { type: 'paragraph'; children: TestLink[] };
type TestDefinition = {
  type: 'definition';
  identifier: string;
  label: string;
  url: string;
  title: string;
};
type TestRoot = {
  type: 'root';
  children: Array<TestParagraph | TestDefinition>;
};

const directoryName = path.dirname(fileURLToPath(import.meta.url));
const tauDocsRoot = path.resolve(directoryName, '../../../');

const pseudoContentPath = (relativeUnderContentDocs: string): string =>
  path.join(tauDocsRoot, 'content', 'docs', ...relativeUnderContentDocs.split('/'));

const transformRemarkResolveRelativeLinks: RemarkResolveRelativeLinksTransformer = remarkResolveRelativeLinks();

const assertParagraphHasLink = (paragraph: TestParagraph): TestLink => {
  const firstUnknown: unknown = paragraph.children[0];
  expect(
    typeof firstUnknown === 'object' && firstUnknown !== null && 'type' in firstUnknown && firstUnknown.type === 'link',
  ).toBe(true);

  return firstUnknown as TestLink;
};

const assertRootChildIsParagraph = (tree: TestRoot, index: number): TestParagraph => {
  const childUnknown: unknown = tree.children[index];
  expect(typeof childUnknown === 'object' && childUnknown !== null && 'type' in childUnknown).toBe(true);
  expect((childUnknown as TestParagraph).type).toBe('paragraph');

  return childUnknown as TestParagraph;
};

/** Runs the remark transformer on `tree` using an absolute faux file path under `apps/docs/content/docs`. */
const applyPluginToTree = (tree: TestRoot, absoluteSourcePath: string): void => {
  transformRemarkResolveRelativeLinks(tree, { path: absoluteSourcePath });
};

const paragraphWithLink = (url: string, textContent = 'x'): TestParagraph => ({
  type: 'paragraph',
  children: [
    {
      type: 'link',
      url,
      children: [{ type: 'text', value: textContent }],
    },
  ],
});

describe('remarkResolveRelativeLinks', () => {
  describe('findContentDocsDirectory', () => {
    it('walks upward from nested MDX to content/docs directory', () => {
      expect(findContentDocsDirectory(pseudoContentPath('runtime/api/kernels.mdx'))).toBe(
        path.join(tauDocsRoot, 'content', 'docs'),
      );
    });
  });

  describe('markdownPathToDocsUrlPath', () => {
    const docsRoot = path.join(tauDocsRoot, 'content', 'docs');

    it('emits site-root paths for runtime subtree', () => {
      const resolved = pseudoContentPath('runtime/api/kernels');
      expect(markdownPathToDocsUrlPath(resolved, docsRoot)).toBe('/runtime/api/kernels');
    });

    it('maps runtime index bundle folder to /runtime', () => {
      const resolved = pseudoContentPath('runtime');
      expect(markdownPathToDocsUrlPath(resolved, docsRoot)).toBe('/runtime');
    });

    it('still strips hypothetical route-group directory segments when present', () => {
      const resolved = path.join(docsRoot, '(sandbox)', 'section', 'page');
      expect(markdownPathToDocsUrlPath(resolved, docsRoot)).toBe('/section/page');
    });
  });

  describe('rewrite via plugin', () => {
    const docsRootPath = pseudoContentPath('runtime/index.mdx');

    it('rewrites sibling relative links from the runtime index page', () => {
      const tree: TestRoot = {
        type: 'root',
        children: [paragraphWithLink('./api/kernels'), paragraphWithLink('./getting-started/quick-start')],
      };
      applyPluginToTree(tree, docsRootPath);
      expect(assertParagraphHasLink(assertRootChildIsParagraph(tree, 0)).url).toBe('/runtime/api/kernels');
      expect(assertParagraphHasLink(assertRootChildIsParagraph(tree, 1)).url).toBe(
        '/runtime/getting-started/quick-start',
      );
    });

    it('rewrites links from nested pages with correct directory semantics', () => {
      const source = pseudoContentPath('runtime/concepts/architecture.mdx');
      const tree: TestRoot = {
        type: 'root',
        children: [paragraphWithLink('./middleware-model')],
      };
      applyPluginToTree(tree, source);
      expect(assertParagraphHasLink(assertRootChildIsParagraph(tree, 0)).url).toBe(
        '/runtime/concepts/middleware-model',
      );
    });

    it('preserves hashes on parent-relative hrefs', () => {
      const source = pseudoContentPath('runtime/getting-started/quick-start.mdx');
      const tree: TestRoot = {
        type: 'root',
        children: [paragraphWithLink('../concepts/worker-model#topology-recipes')],
      };
      applyPluginToTree(tree, source);
      expect(assertParagraphHasLink(assertRootChildIsParagraph(tree, 0)).url).toBe(
        '/runtime/concepts/worker-model#topology-recipes',
      );
    });

    it('leaves absolute, external, and anchor-only URLs unchanged', () => {
      const tree: TestRoot = {
        type: 'root',
        children: [
          paragraphWithLink('/runtime/api/client'),
          paragraphWithLink('https://tau.new'),
          paragraphWithLink('#section'),
        ],
      };
      applyPluginToTree(tree, docsRootPath);
      expect(assertParagraphHasLink(assertRootChildIsParagraph(tree, 0)).url).toBe('/runtime/api/client');
      expect(assertParagraphHasLink(assertRootChildIsParagraph(tree, 1)).url).toBe('https://tau.new');
      expect(assertParagraphHasLink(assertRootChildIsParagraph(tree, 2)).url).toBe('#section');
    });

    it('rewrites definition (reference-style) link URLs', () => {
      const tree: TestRoot = {
        type: 'root',
        children: [
          {
            type: 'definition',
            identifier: '"ref"',
            label: 'ref',
            url: './api/kernels',
            title: '',
          },
        ],
      };
      applyPluginToTree(tree, docsRootPath);
      const definitionUnknown: unknown = tree.children[0];
      expect(typeof definitionUnknown === 'object' && definitionUnknown !== null && 'type' in definitionUnknown).toBe(
        true,
      );
      expect((definitionUnknown as TestDefinition).type).toBe('definition');
      expect((definitionUnknown as TestDefinition).url).toBe('/runtime/api/kernels');
    });
  });
});
