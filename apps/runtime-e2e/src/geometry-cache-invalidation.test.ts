/**
 * Regression for the geometry cache key omitting transitively-imported local
 * modules that resolve OUTSIDE the entry file's project root.
 *
 * Reproduces the SB6 V8 iteration pain: a model at `test-exports/box.ts` imports
 * `../lib/dims.ts`. The worker's bundler roots at the entry file's own directory
 * (`test-exports`), so `../lib/dims.ts` resolves above it and previously got
 * dropped from the dependency hash — editing the lib file did not invalidate the
 * `test-exports/.tau/cache/geometry` entry, forcing manual `.tau` purges.
 *
 * Verified as a true regression: with the fix reverted the second export reuses
 * the stale key (no new cache file); with the fix a new key appears.
 */
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeClient } from '@taucad/runtime/node';

// Entry imports `replicad` directly so kernel auto-detection attributes it, and
// pulls a dimension from `../lib` (outside the entry's project root) whose edit
// must invalidate the cache.
const entrySource = `import { makeBaseBox } from 'replicad';\nimport { boxHeight } from '../lib/dims.ts';\nexport default () => makeBaseBox(10, boxHeight, 30);\n`;
const libSource = (height: number): string => `export const boxHeight = ${height};\n`;

/** Create-step cache keys under `.tau/cache/geometry` (excludes `export-` entries). */
const createCacheKeys = async (baseDir: string): Promise<Set<string>> => {
  const cacheDir = join(baseDir, '.tau/cache/geometry');
  let entries: string[];
  try {
    entries = await readdir(cacheDir);
  } catch {
    return new Set();
  }
  return new Set(
    entries.filter((name) => name.endsWith('.bin') && !name.startsWith('export-')).map((name) => name.slice(0, -4)),
  );
};

const exportGlb = async (root: string): Promise<void> => {
  // Fresh client each run so the per-worker L1/file-hash caches don't mask a
  // stale on-disk key — this mirrors separate CLI invocations.
  const client = await createNodeClient(root);
  try {
    const result = await client.export('glb', { source: { path: 'test-exports/box.ts' } });
    if (!result.success) {
      throw new Error(`export failed: ${result.issues.map((i) => i.message).join('; ')}`);
    }
  } finally {
    client.terminate();
  }
};

describe('geometry cache invalidation — out-of-project local imports', () => {
  let projectDir: string | undefined;

  afterEach(async () => {
    if (projectDir) {
      await rm(projectDir, { recursive: true, force: true });
      projectDir = undefined;
    }
  });

  it('invalidates cached geometry when an imported ../lib file changes', { timeout: 300_000 }, async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tau-cache-inv-'));
    const libFile = join(projectDir, 'lib', 'dims.ts');
    // Geometry caches under the entry file's directory (`test-exports/.tau`).
    const cacheBase = join(projectDir, 'test-exports');
    await mkdir(cacheBase, { recursive: true });
    await mkdir(join(projectDir, 'lib'), { recursive: true });
    await writeFile(join(cacheBase, 'box.ts'), entrySource, 'utf8');
    await writeFile(libFile, libSource(20), 'utf8');

    await exportGlb(projectDir);
    const before = await createCacheKeys(cacheBase);
    expect(before.size).toBeGreaterThan(0);

    // Edit only the imported lib file (entry file is untouched).
    await writeFile(libFile, libSource(25), 'utf8');
    await exportGlb(projectDir);
    const after = await createCacheKeys(cacheBase);

    // A new cache key must appear — without the fix the lib edit is invisible to
    // the dependency hash and the second export reuses the stale key.
    expect([...after].some((key) => !before.has(key))).toBe(true);
  });
});
