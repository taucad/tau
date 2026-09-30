// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Provenance = {
  readonly repository: string;
  readonly commit: string;
  readonly upstreams: ReadonlyArray<{ readonly sources: string; readonly upstream: string; readonly license: string }>;
  readonly inventory: ReadonlyArray<{
    readonly source: string;
    readonly sha256: string;
    readonly destinations: readonly string[];
    readonly adaptations?: Readonly<Record<string, { readonly sha256: string; readonly note: string }>>;
  }>;
  readonly demoSources: ReadonlyArray<{ readonly source: string; readonly destination: string }>;
  readonly visualCases: ReadonlyArray<{ readonly project: string; readonly parameters: Record<string, unknown> }>;
};

const fixtureRoot = join(import.meta.dirname, 'kernels/picovoxel');
const provenance = JSON.parse(readFileSync(join(fixtureRoot, 'provenance.json'), 'utf8')) as Provenance;
const hashFile = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const projects = [...new Set(provenance.visualCases.map(({ project }) => project))].toSorted();

describe('PicoVoxel community example provenance', () => {
  it('should pin the public PicoVoxel tree and 46 upstream example sources', () => {
    expect(provenance.repository).toBe('https://github.com/taucad/picovoxel');
    expect(provenance.commit).toMatch(/^[\da-f]{40}$/);
    expect(provenance.inventory).toHaveLength(46);
    expect(new Set(provenance.inventory.map(({ source }) => source)).size).toBe(46);
  });

  it('should keep every copied destination byte-identical to its pinned source unless it records an adaptation', () => {
    for (const { source, sha256, destinations, adaptations = {} } of provenance.inventory) {
      expect(destinations.length, source).toBeGreaterThan(0);
      expect(
        Object.keys(adaptations).every((destination) => destinations.includes(destination)),
        source,
      ).toBe(true);
      for (const destination of destinations) {
        expect(hashFile(join(fixtureRoot, destination)), destination).toBe(adaptations[destination]?.sha256 ?? sha256);
      }
    }
  });

  it('should attribute every source to exactly one upstream with a license', () => {
    const sources = [
      ...provenance.inventory.map(({ source }) => source),
      ...provenance.demoSources.map(({ source }) => source),
    ];
    for (const source of sources) {
      const owners = provenance.upstreams.filter(({ sources: prefix }) => source.startsWith(prefix));
      expect(owners, source).toHaveLength(1);
      expect(owners[0]!.license, source).toMatch(/^(?:Apache-2\.0|CC0-1\.0)$/);
    }
  });

  it('should define 33 isolated projects and the complete 36-case acceptance matrix', () => {
    expect(projects).toHaveLength(33);
    for (const project of projects) {
      expect(statSync(join(fixtureRoot, project)).isDirectory(), project).toBe(true);
    }
    expect(projects).not.toContain('modular-gyroid-puzzle');
    expect(provenance.visualCases).toHaveLength(36);
  });

  it.each(projects)('should cite the public tree, never a private checkout, in %s', (project) => {
    const readme = readFileSync(join(fixtureRoot, project, 'README.md'), 'utf8');

    expect(readme).toContain(`https://github.com/taucad/picovoxel/tree/${provenance.commit}`);
    expect(readme).not.toContain('repos/');
  });
});
