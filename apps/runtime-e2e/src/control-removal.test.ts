// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Application-owned half of the ratified environment-control deletion guard.
 * The package-owned half lives in
 * `packages/geospec-engine/src/control-removal.test.ts` and scans package and
 * shared roots only, because a published package must not read `apps/**`
 * (`docs/research/workspace-license-boundary-migration.md`, Finding 2).
 */
const removedControls = [
  'GEOSPEC_VOID_ENGINE',
  'GEOSPEC_VOID_HYBRID_MIN_CELLS',
  'GEOSPEC_EXTREMA_GATE',
  'GEOSPEC_OVERLAP_ENGINE',
  'GEOSPEC_INTERFERENCE_PREFILTER',
  'GEOSPEC_NATIVE_SINGLETON',
  'GEOSPEC_EVIDENCE_CACHE',
  'GEOSPEC_CACHE_DIR',
  'GEOSPEC_MATCHER_UNIT_BUDGET',
  'GEOSPEC_MATCHER_WALL_BACKSTOP_MS',
  'GEOSPEC_FORENSIC',
  'GEOSPEC_SHARD',
  'GEOSPEC_WALL_WORK_UNIT_BUDGET',
  'GEOSPEC_POOL_WORKER_ENTRY',
  'GEOSPEC_ENGINE_ACTIVATE',
  'GEOSPEC_PROVENANCE_DATE',
  'GEOSPEC_V8_WORKERS',
] as const;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceExtensions = new Set(['.cjs', '.js', '.json', '.mjs', '.ts', '.tsx']);

const sourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return entry.name === 'node_modules' ? [] : sourceFiles(path);
      }
      return entry.isFile() && sourceExtensions.has(extname(entry.name)) && path !== import.meta.filename ? [path] : [];
    }),
  );
  return files.flat();
};

describe('ratified environment-control deletion', () => {
  it('should leave none of the 17 former controls in runtime-e2e sources', async () => {
    const pattern = new RegExp(`\\b(?:${removedControls.join('|')})\\b`, 'gu');
    const paths = await sourceFiles(resolve(projectRoot, 'src'));
    const sources = await Promise.all(paths.map(async (path) => ({ path, contents: await readFile(path, 'utf8') })));
    const failures = sources.flatMap(({ path, contents }) =>
      [...contents.matchAll(pattern)].map(
        (match) => `${relative(projectRoot, path)}:${contents.slice(0, match.index).split('\n').length}:${match[0]}`,
      ),
    );

    expect(failures).toStrictEqual([]);
  });
});
