import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '#lib/fumadocs/source.js';

const search = createFromSource(source, { language: 'english' });
const indexAssetPath = 'build/docs-search-index.json';
const staticIndexUrl = `/${indexAssetPath}`;
let indexUrl: Promise<string> | undefined;

const buildStaticSearchIndexUrl = async (): Promise<string> => {
  const response = await search.staticGET();
  const staticRoot = process.env['NODE_ENV'] === 'production' ? 'build/client' : 'public';
  const indexPath = join(process.cwd(), staticRoot, indexAssetPath);
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, await response.text());
  return staticIndexUrl;
};

/** Publish the local-search index once; browsers fetch the same-origin static JSON asset. */
export const getStaticSearchIndexUrl = async (): Promise<string> => {
  indexUrl ??= buildStaticSearchIndexUrl();
  return indexUrl;
};
