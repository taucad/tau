import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(import.meta.dirname, '..');
const forbiddenFragments = ['#experiments', 'packages/geospec-engine/experiments'];

const listProductionSources = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listProductionSources(path);
      }
      if (!entry.name.endsWith('.ts') || entry.name.includes('.test.') || entry.name.includes('.test-d.')) {
        return [];
      }
      return [path];
    }),
  );
  return nestedFiles.flat();
};

describe('experiment boundary', () => {
  it('should keep opt-in benchmark backends out of production GeoSpec source', async () => {
    const sources = await listProductionSources(sourceRoot);
    const offenderCandidates = await Promise.all(
      sources.map(async (file): Promise<string | undefined> => {
        const text = await readFile(file, 'utf8');
        if (forbiddenFragments.some((fragment) => text.includes(fragment))) {
          return relative(sourceRoot, file);
        }
        return undefined;
      }),
    );
    const offenders = offenderCandidates.filter((file): file is string => file !== undefined);

    expect(offenders).toEqual([]);
  });
});
