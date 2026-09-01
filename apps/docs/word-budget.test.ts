import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const docsDirectory = resolve(import.meta.dirname, 'content/docs');

/** Whitespace-separated tokens, fences included: the `wc -w` figure used to seed these budgets. */
const countWords = (source: string): number => source.split(/\s+/u).filter(Boolean).length;

// Ceilings only move down. A raise is a reviewed diff that names the feature
// paying for it here. Ratcheted down 2026-09-01 after the fresh content rewrite,
// rounded up to 50 words per page and 500 words site-wide. A page can carry its
// own ceiling in a frontmatter `wordBudgetOverride` instead of a row here.
const pageCeilings: Readonly<Record<string, number>> = {
  'editor/index.mdx': 150,
  'runtime/api/bundler.mdx': 250,
  'runtime/api/client.mdx': 2000,
  'runtime/api/filesystem.mdx': 650,
  'runtime/api/frameworks.mdx': 700,
  'runtime/api/kernels.mdx': 400,
  'runtime/api/middleware.mdx': 500,
  'runtime/api/testing.mdx': 500,
  'runtime/api/transport.mdx': 1450,
  'runtime/api/types.mdx': 550,
  'runtime/concepts/architecture.mdx': 1650,
  'runtime/concepts/interactive-architecture.mdx': 1100,
  'runtime/concepts/kernel-selection.mdx': 850,
  'runtime/concepts/middleware-model.mdx': 750,
  'runtime/concepts/path-namespaces.mdx': 700,
  'runtime/concepts/plugin-system.mdx': 600,
  'runtime/concepts/render-lifecycle.mdx': 1400,
  'runtime/concepts/worker-model.mdx': 2000,
  'runtime/getting-started/installation.mdx': 450,
  'runtime/getting-started/llms-txt.mdx': 250,
  'runtime/getting-started/quick-start.mdx': 450,
  'runtime/getting-started/your-first-kernel.mdx': 900,
  'runtime/guides/bundler-configuration.mdx': 700,
  'runtime/guides/bundling.mdx': 800,
  'runtime/guides/choosing-a-kernel.mdx': 400,
  'runtime/guides/cooperate-with-cancellation.mdx': 650,
  'runtime/guides/cross-origin-isolation.mdx': 750,
  'runtime/guides/custom-kernel.mdx': 800,
  'runtime/guides/custom-middleware.mdx': 600,
  'runtime/guides/embedding-in-a-host.mdx': 1100,
  'runtime/guides/error-handling.mdx': 800,
  'runtime/guides/filesystem-setup.mdx': 750,
  'runtime/guides/headless-camera-capture.mdx': 800,
  'runtime/guides/live-rendering.mdx': 800,
  'runtime/guides/render-timeouts.mdx': 800,
  'runtime/guides/testing-kernels.mdx': 700,
  'runtime/guides/using-middleware.mdx': 500,
  'runtime/index.mdx': 550,
  'runtime/reference/replicad.mdx': 100,
};
const siteCeiling = 29_500;

const documentTypeCaps = {
  tutorial: 1500,
  'how-to': 800,
  explanation: 1200,
} as const;

const documentedTypeCapExceptions: Readonly<Record<string, string>> = {
  'runtime/concepts/architecture.mdx': 'TODO(rewrite wave): split protocol detail from the architecture explanation.',
  'runtime/concepts/render-lifecycle.mdx': 'TODO(rewrite wave): move cancellation strategies into a focused guide.',
  'runtime/concepts/worker-model.mdx': 'TODO(rewrite wave): move the three topology recipes out of this explanation.',
  'runtime/guides/embedding-in-a-host.mdx': 'TODO(rewrite wave): split browser, Node.js, and Electron host topologies.',
};

type DocumentType = 'tutorial' | 'how-to' | 'reference' | 'explanation';

const parseFrontmatter = (
  source: string,
  path: string,
): { documentType: DocumentType; wordBudgetOverride?: number } => {
  const frontmatter = /^---\n([\s\S]*?)\n---/u.exec(source)?.[1] ?? '';
  const documentType = /^docType:\s*(tutorial|how-to|reference|explanation)\s*$/mu.exec(frontmatter)?.[1] as
    | DocumentType
    | undefined;
  if (!documentType) {
    throw new Error(`${path} has no valid docType`);
  }

  const override = /^wordBudgetOverride:\s*(\d+)\s*$/mu.exec(frontmatter)?.[1];
  return { documentType, ...(override ? { wordBudgetOverride: Number(override) } : {}) };
};

const pages = globSync('**/*.mdx', { cwd: docsDirectory })
  .toSorted()
  .map((path) => {
    const source = readFileSync(resolve(docsDirectory, path), 'utf8');
    return { path, words: countWords(source), ...parseFrontmatter(source, path) };
  });

const ceilingFor = ({ path, wordBudgetOverride }: (typeof pages)[number]): number =>
  wordBudgetOverride ?? pageCeilings[path] ?? 0;

/** From documentation-policy.md §5: "Keep pages under 2000 words." */
const policyWordLimit = 2000;

describe('docs word budget', () => {
  it('gives every page a ceiling', () => {
    // Either source counts, so a page can carry its budget in its own
    // frontmatter and travel with a `git mv` instead of needing a row here.
    const unbudgeted = pages
      .filter((page) => page.wordBudgetOverride === undefined && pageCeilings[page.path] === undefined)
      .map(({ path }) => path);

    expect(unbudgeted).toEqual([]);
  });

  it('lists no ceiling for a page that does not exist', () => {
    const pagePaths = new Set(pages.map(({ path }) => path));

    expect(Object.keys(pageCeilings).filter((path) => !pagePaths.has(path))).toEqual([]);
  });

  it.each(pages)('keeps $path within the documentation policy limit', (page) => {
    expect(page.words).toBeLessThan(policyWordLimit);
  });

  it.each(pages)('keeps $path within its ceiling', (page) => {
    expect(page.words).toBeLessThanOrEqual(ceilingFor(page));
  });

  it('keeps the site within its ceiling', () => {
    expect(pages.reduce((sum, { words }) => sum + words, 0)).toBeLessThanOrEqual(siteCeiling);
  });

  it('keeps maximum ceilings within each Diátaxis type cap', () => {
    for (const page of pages) {
      if (page.documentType === 'reference') {
        continue;
      }
      const cap = documentTypeCaps[page.documentType];
      const exception = documentedTypeCapExceptions[page.path];
      if (exception) {
        expect(ceilingFor(page), `${page.path}: ${exception}`).toBeGreaterThan(cap);
      } else {
        expect(ceilingFor(page), page.path).toBeLessThanOrEqual(cap);
      }
    }
  });
});
