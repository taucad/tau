// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Provenance = {
  readonly commit: string;
  readonly inventory: ReadonlyArray<{
    readonly source: string;
    readonly sha256: string;
    readonly destinations: readonly string[];
  }>;
  readonly visualCases: ReadonlyArray<{
    readonly project: string;
    readonly parameters: Record<string, unknown>;
  }>;
};

const fixtureRoot = join(import.meta.dirname, 'kernels/picovoxel');
const repositoryRoot = join(import.meta.dirname, '../../..');
const provenance = JSON.parse(readFileSync(join(fixtureRoot, 'provenance.json'), 'utf8')) as Provenance;
const hashFile = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const listTypescriptFiles = (directory: string, prefix = ''): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listTypescriptFiles(join(directory, entry.name), relativePath)
      : entry.name.endsWith('.ts')
        ? [relativePath]
        : [];
  });

describe('Picovoxel community example provenance', () => {
  it('pins every upstream example source and verifies every copied destination byte-for-byte', () => {
    const upstreamFiles = listTypescriptFiles(join(repositoryRoot, 'repos/picovoxel/examples'))
      .map((path) => `examples/${path}`)
      .sort();
    expect(provenance.commit).toBe('802d86da6e6120a472b045fddb306ce0dfa5d5f8');
    expect(provenance.inventory.map(({ source }) => source).sort()).toEqual(upstreamFiles);
    expect(provenance.inventory).toHaveLength(46);

    for (const entry of provenance.inventory) {
      expect(hashFile(join(repositoryRoot, 'repos/picovoxel', entry.source))).toBe(entry.sha256);
      expect(entry.destinations.length).toBeGreaterThan(0);
      for (const destination of entry.destinations) {
        expect(hashFile(join(fixtureRoot, destination))).toBe(entry.sha256);
      }
    }
  });

  it('defines 33 isolated projects and the complete 36-case acceptance matrix', () => {
    const projects = readdirSync(fixtureRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .sort();
    expect(projects).toHaveLength(33);
    expect(new Set(provenance.visualCases.map(({ project }) => project))).toEqual(new Set(projects));
    expect(provenance.visualCases).toHaveLength(36);
  });
});
