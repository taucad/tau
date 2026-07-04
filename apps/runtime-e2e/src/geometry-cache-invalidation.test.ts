/**
 * Regression for the geometry cache key omitting transitively-imported local
 * modules that resolve OUTSIDE projectPath.
 *
 * The CLI clients set projectPath to the entry file's own directory
 * (`createNodeClient(inputDirectory)`), so an import like `../lib/box.ts`
 * resolves above projectPath and previously got dropped from the dependency
 * hash — editing the lib file did not invalidate `.tau/cache/geometry`. This
 * drives the real Node client against a temp project laid out exactly that way
 * and asserts a lib edit produces a new cache key.
 */
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeClient } from '@taucad/runtime/node';

// Entry imports `replicad` directly so kernel auto-detection attributes it, and
// pulls a dimension from `../lib` (outside projectPath) whose edit must invalidate.
const entrySource = `import { makeBaseBox } from 'replicad';\nimport { boxHeight } from '../lib/dims.ts';\nexport default () => makeBaseBox(10, boxHeight, 30);\n`;
const libSource = (height: number): string => `export const boxHeight = ${height};\n`;

/** Create-step cache keys under `.tau/cache/geometry` (excludes `export-` entries). */
const createCacheKeys = async (partsDir: string): Promise<Set<string>> => {
  const cacheDir = join(partsDir, '.tau/cache/geometry');
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

const exportGlb = async (partsDir: string): Promise<void> => {
  // Fresh client each run so the per-worker L1/file-hash caches don't mask a
  // stale on-disk key — this mirrors separate CLI invocations.
  const client = await createNodeClient(join(partsDir));
  try {
    const result = await client.export('glb', { source: { path: 'box.ts' } });
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
    const partsDir = join(projectDir, 'parts');
    const libFile = join(projectDir, 'lib', 'dims.ts');
    await mkdir(partsDir, { recursive: true });
    await mkdir(join(projectDir, 'lib'), { recursive: true });
    await writeFile(join(partsDir, 'box.ts'), entrySource, 'utf8');
    await writeFile(libFile, libSource(20), 'utf8');

    await exportGlb(partsDir);
    const before = await createCacheKeys(partsDir);
    expect(before.size).toBeGreaterThan(0);

    // Edit only the imported lib file (entry file is untouched).
    await writeFile(libFile, libSource(25), 'utf8');
    await exportGlb(partsDir);
    const after = await createCacheKeys(partsDir);

    // A new cache key must appear — without the fix the lib edit is invisible to
    // the dependency hash and the second export reuses the stale key.
    expect([...after].some((key) => !before.has(key))).toBe(true);
  });
});
