import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

const workspace = resolve(import.meta.dirname, '../../..');
const roots = [
  'packages/geospec',
  'packages/geospec-engine',
  'packages/runtime/src/kernels/replicad',
  'libs/tau-examples/src/kernels/replicad/v8-engine-rev2',
  // `apps/runtime-e2e/src` is covered by an app-owned test; a package must not
  // read `apps/**` (workspace-license-boundary-migration.md, Finding 2).
].map((path) => resolve(workspace, path));
const skippedDirectories = new Set(['node_modules', 'verification']);
const sourceExtensions = new Set(['.cjs', '.cpp', '.h', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.yaml', '.yml']);

const sourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && !skippedDirectories.has(entry.name)) {
        return sourceFiles(path);
      }
      return entry.isFile() && sourceExtensions.has(extname(entry.name)) && path !== import.meta.filename ? [path] : [];
    }),
  );
  return files.flat();
};

describe('ratified environment-control deletion', () => {
  it('should leave none of the 17 former controls in live or generated GeoSpec sources', async () => {
    const failures: string[] = [];
    const pattern = new RegExp(`\\b(?:${removedControls.join('|')})\\b`, 'gu');
    const nestedPaths = await Promise.all(roots.map(async (root) => sourceFiles(root)));
    const paths = nestedPaths.flat();
    const sources = await Promise.all(paths.map(async (path) => ({ path, contents: await readFile(path, 'utf8') })));
    for (const { path, contents } of sources) {
      for (const match of contents.matchAll(pattern)) {
        failures.push(`${relative(workspace, path)}:${contents.slice(0, match.index).split('\n').length}:${match[0]}`);
      }
    }
    expect(failures).toStrictEqual([]);
  });
});
