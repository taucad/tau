// @vitest-environment node
/**
 * The dev dependency optimizer crawls every module the app starts as a worker. Vite's scanner
 * does not follow `new Worker(new URL(...))`, so a worker outside `uiWorkerOptimizeDepsEntries`
 * has its dependencies found on first start, and the re-bundle reloads every open page.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- the build configuration lives one directory above the app alias root.
import reactRouterConfig from '../react-router.config.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- the build configuration lives one directory above the app alias root.
import { uiWorkerOptimizeDepsEntries } from '../vite.config.js';

const uiRoot = path.resolve(import.meta.dirname, '..');
const libsRoot = path.resolve(uiRoot, '../libs');
const workerUrlPattern = /new (?:Shared)?Worker\(\s*new URL\(\s*'([^']+)',\s*import\.meta\.url/gu;
const sourcePattern = /\.tsx?$/u;
const testPattern = /\.(?:test|spec|test-d)\.tsx?$/u;

const listSources = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && sourcePattern.test(entry.name) && !testPattern.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`));
};

const listWorkerModules = async (): Promise<string[]> => {
  const libraries = await readdir(libsRoot, { withFileTypes: true });
  const sourceRoots = [
    path.join(uiRoot, 'app'),
    ...libraries.filter((entry) => entry.isDirectory()).map((entry) => path.join(libsRoot, entry.name, 'src')),
  ];
  const sourceLists = await Promise.all(sourceRoots.map(async (root) => listSources(root).catch(() => [])));
  const sources = sourceLists.flat();
  const texts = await Promise.all(sources.map(async (source) => ({ source, text: await readFile(source, 'utf8') })));
  const workers = new Set<string>();
  for (const { source, text } of texts) {
    for (const match of text.matchAll(workerUrlPattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        workers.add(
          path
            .relative(uiRoot, path.resolve(path.dirname(source), specifier))
            .split(path.sep)
            .join('/'),
        );
      }
    }
  }
  return [...workers].toSorted();
};

describe('dev dependency optimizer entries', () => {
  it('admits the client entry and every route module through React Router', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- React Router's flag name.
    expect(reactRouterConfig.future).toMatchObject({ unstable_optimizeDeps: true });
  });

  it('covers every module the app starts as a worker', async () => {
    const workers = await listWorkerModules();

    expect(workers.length).toBeGreaterThan(10);
    const uncovered = workers.filter(
      (worker) => !uiWorkerOptimizeDepsEntries.some((pattern) => path.matchesGlob(worker, pattern)),
    );
    expect(uncovered).toEqual([]);
  });
});
