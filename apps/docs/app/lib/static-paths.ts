import { glob } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGetUrl, getSlugs } from 'fumadocs-core/source';
// Relative, not `#lib/*`: react-router.config.ts loads this module before the
// app aliases are active.
// oxlint-disable-next-line no-restricted-imports, import/extensions -- see above
import { getRawMarkdownBackingPath } from './site.js';

const getDocumentUrl = createGetUrl('/');

export const getDocsProjectDirectory = (): string => join(dirname(fileURLToPath(import.meta.url)), '../..');

export const docsContentRoot = join(getDocsProjectDirectory(), 'content/docs');

export const listDocumentPaths = async (): Promise<string[]> => {
  const paths: string[] = [];
  for await (const entry of glob('**/*.mdx', { cwd: docsContentRoot })) {
    paths.push(getDocumentUrl(getSlugs(entry)));
  }
  return paths.sort();
};

/** Canonical static output inventory for the standalone docs build. */
export const listStaticPrerenderPaths = async (): Promise<string[]> => {
  const documentPaths = await listDocumentPaths();
  // The `.mdx` public paths are served by generated Netlify rewrites rather than
  // prerendered, because a prerendered loader redirect becomes a meta-refresh
  // HTML page — markdown for browsers only, never for crawlers or agents.
  return [
    '/',
    '/robots.txt',
    '/sitemap.xml',
    '/_redirects',
    '/llms.txt',
    '/llms-full.txt',
    ...documentPaths,
    ...documentPaths.map((documentPath) => getRawMarkdownBackingPath(documentPath)),
  ];
};

export { getDocumentUrl };
