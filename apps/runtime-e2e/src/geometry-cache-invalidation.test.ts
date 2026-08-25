/**
 * Regression for the geometry cache key omitting transitively-imported local
 * modules that resolve OUTSIDE the entry path's project root.
 *
 * Reproduces the SB6 V8 iteration pain: a model at `test-exports/box.ts` imports
 * `../lib/dims.ts`. The worker's bundler roots at the entry path's own directory
 * (`test-exports`), so `../lib/dims.ts` resolves above it and previously got
 * dropped from the dependency hash — editing the lib file did not invalidate the
 * `test-exports/.tau/cache/geometry` entry, forcing manual `.tau` purges.
 *
 * Verified as a true regression: with the fix reverted the second export reuses
 * the stale key (no new cache file); with the fix a new key appears.
 *
 * Also pins the sibling invariant for `with { type: 'text' }` asset imports
 * (tau-examples OQ6): asset-only edits must rotate the cache key too.
 */
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeClient } from '@taucad/runtime/node';
import { runtime } from '#runtime.definition.js';

// Entry imports `replicad` directly so kernel auto-detection attributes it, and
// pulls a dimension from `../lib` (outside the entry's project root) whose edit
// must invalidate the cache.
const entrySource = `import { makeBaseBox } from 'replicad';\nimport { boxHeight } from '../lib/dims.ts';\nexport default () => makeBaseBox(10, boxHeight, 30);\n`;
const libSource = (height: number): string => `export const boxHeight = ${height};\n`;

/** Create-step cache keys under `.tau/cache/geometry` (excludes `export-` entries). */
const createCacheKeys = async (baseDirectory: string): Promise<Set<string>> => {
  const cacheDirectory = join(baseDirectory, '.tau/cache/geometry');
  let entries: string[];
  try {
    entries = await readdir(cacheDirectory);
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
  const client = await createNodeClient(root, { runtime });
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
  let projectDirectory: string | undefined;

  afterEach(async () => {
    if (projectDirectory) {
      await rm(projectDirectory, { recursive: true, force: true });
      projectDirectory = undefined;
    }
  });

  it('invalidates cached geometry when an imported ../lib file changes', { timeout: 300_000 }, async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'tau-cache-inv-'));
    const libFile = join(projectDirectory, 'lib', 'dims.ts');
    // Geometry caches under the FS mount root (`<project>/.tau`) — the
    // project-root fix sources projectRootPath from the mount root, not the
    // entry path's directory.
    const entryDirectory = join(projectDirectory, 'test-exports');
    await mkdir(entryDirectory, { recursive: true });
    await mkdir(join(projectDirectory, 'lib'), { recursive: true });
    await writeFile(join(entryDirectory, 'box.ts'), entrySource, 'utf8');
    await writeFile(libFile, libSource(20), 'utf8');

    await exportGlb(projectDirectory);
    const before = await createCacheKeys(projectDirectory);
    expect(before.size).toBeGreaterThan(0);

    // Edit only the imported lib file (entry path is untouched).
    await writeFile(libFile, libSource(25), 'utf8');
    await exportGlb(projectDirectory);
    const after = await createCacheKeys(projectDirectory);

    // A new cache key must appear — without the fix the lib edit is invisible to
    // the dependency hash and the second export reuses the stale key.
    expect([...after].some((key) => !before.has(key))).toBe(true);
  });

  it('invalidates cached geometry when a `with { type: "text" }` asset changes', { timeout: 300_000 }, async () => {
    // Pins tau-examples OQ6: assets imported via TC39 import attributes must
    // participate in the dependency hash exactly like .ts imports. Verified
    // working 2026-07-17 (the suspected extractProjectDependencies hole was
    // refuted — attribute imports land in metafile.inputs under `vfs:` with
    // clean keys); this guards against metafile-key drift in future esbuild
    // upgrades re-opening it.
    projectDirectory = await mkdtemp(join(tmpdir(), 'tau-cache-inv-asset-'));
    const entryDirectory = join(projectDirectory, 'test-exports');
    const assetFile = join(entryDirectory, 'assets', 'locknut.step');
    await mkdir(join(entryDirectory, 'assets'), { recursive: true });
    const assetEntrySource = `import { makeBaseBox } from 'replicad';\nimport locknut from './assets/locknut.step' with { type: 'text' };\nexport default () => makeBaseBox(10, 20 + (locknut.length % 5), 30);\n`;
    await writeFile(join(entryDirectory, 'box.ts'), assetEntrySource, 'utf8');
    await writeFile(assetFile, 'ISO-10303-21;\nDATA;\nENDSEC;\n', 'utf8');

    await exportGlb(projectDirectory);
    const before = await createCacheKeys(projectDirectory);
    expect(before.size).toBeGreaterThan(0);

    // Edit only the imported asset (entry path is untouched).
    await writeFile(assetFile, 'ISO-10303-21;\nDATA;\nENDSEC;\n \n', 'utf8');
    await exportGlb(projectDirectory);
    const after = await createCacheKeys(projectDirectory);

    // A new cache key must appear — if attribute-loaded assets ever drop out of
    // the dependency list, the second export reuses the stale key.
    expect([...after].some((key) => !before.has(key))).toBe(true);
  });
});
