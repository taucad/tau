import { describe, expect, it } from 'vitest';
import { discoverGeoSpecFiles } from '#runner/discovery.js';
import type { GeoSpecDiscoveryFileStat, GeoSpecDiscoveryFileSystem } from '#runner/discovery.js';

type InMemoryNode = GeoSpecDiscoveryFileStat & {
  children?: string[];
};

const createInMemoryNodes = (entries: ReadonlyArray<readonly [string, InMemoryNode]>): Record<string, InMemoryNode> =>
  Object.fromEntries(entries);

const createInMemoryDiscoveryFileSystem = (nodes: Record<string, InMemoryNode>): GeoSpecDiscoveryFileSystem => ({
  async readdir(path: string): Promise<readonly string[]> {
    const node = nodes[path];
    if (node?.kind !== 'directory') {
      throw new Error(`Cannot read directory: ${path}`);
    }
    return node.children ?? [];
  },
  async stat(path: string): Promise<GeoSpecDiscoveryFileStat> {
    const node = nodes[path];
    if (!node) {
      throw new Error(`Cannot stat path: ${path}`);
    }
    return { kind: node.kind };
  },
});

describe('discoverGeoSpecFiles', () => {
  it('should discover root and nested GeoSpec files recursively when no files are supplied', async () => {
    const filesystem = createInMemoryDiscoveryFileSystem(
      createInMemoryNodes([
        ['/project', { kind: 'directory', children: ['vase.geospec.ts', 'lib', 'main.scad'] }],
        ['/project/vase.geospec.ts', { kind: 'file' }],
        ['/project/main.scad', { kind: 'file' }],
        ['/project/lib', { kind: 'directory', children: ['vase_variant.geospec.ts', 'vase_variant.scad'] }],
        ['/project/lib/vase_variant.geospec.ts', { kind: 'file' }],
        ['/project/lib/vase_variant.scad', { kind: 'file' }],
      ]),
    );

    const result = await discoverGeoSpecFiles({ filesystem, projectPath: '/project' });

    expect(result).toEqual({
      files: ['lib/vase_variant.geospec.ts', 'vase.geospec.ts'],
      unmatchedRoots: [],
    });
  });

  it('should expand directory roots and exact GeoSpec files with deterministic de-duplication', async () => {
    const filesystem = createInMemoryDiscoveryFileSystem(
      createInMemoryNodes([
        ['/project', { kind: 'directory', children: ['b.geospec.ts', 'lib'] }],
        ['/project/b.geospec.ts', { kind: 'file' }],
        ['/project/lib', { kind: 'directory', children: ['a.geospec.ts', 'b.geospec.js'] }],
        ['/project/lib/a.geospec.ts', { kind: 'file' }],
        ['/project/lib/b.geospec.js', { kind: 'file' }],
      ]),
    );

    const result = await discoverGeoSpecFiles({
      filesystem,
      projectPath: '/project',
      files: ['lib', 'b.geospec.ts', 'lib/a.geospec.ts'],
    });

    expect(result.files).toEqual(['b.geospec.ts', 'lib/a.geospec.ts', 'lib/b.geospec.js']);
    expect(result.unmatchedRoots).toEqual([]);
  });

  it('should report unmatched roots for missing paths and non-GeoSpec files', async () => {
    const filesystem = createInMemoryDiscoveryFileSystem(
      createInMemoryNodes([
        ['/project', { kind: 'directory', children: ['main.scad'] }],
        ['/project/main.scad', { kind: 'file' }],
      ]),
    );

    const result = await discoverGeoSpecFiles({
      filesystem,
      projectPath: '/project',
      files: ['missing', 'main.scad'],
    });

    expect(result).toEqual({
      files: [],
      unmatchedRoots: ['missing', 'main.scad'],
    });
  });

  it('should apply include globs after directory-root expansion', async () => {
    const filesystem = createInMemoryDiscoveryFileSystem(
      createInMemoryNodes([
        ['/project', { kind: 'directory', children: ['root.geospec.ts', 'lib'] }],
        ['/project/root.geospec.ts', { kind: 'file' }],
        ['/project/lib', { kind: 'directory', children: ['selected.geospec.ts'] }],
        ['/project/lib/selected.geospec.ts', { kind: 'file' }],
      ]),
    );

    const result = await discoverGeoSpecFiles({
      filesystem,
      projectPath: '/project',
      files: ['.'],
      include: ['lib/**/*.geospec.ts'],
    });

    expect(result.files).toEqual(['lib/selected.geospec.ts']);
    expect(result.unmatchedRoots).toEqual([]);
  });

  it('should exclude files after directory-root expansion', async () => {
    const filesystem = createInMemoryDiscoveryFileSystem(
      createInMemoryNodes([
        ['/project', { kind: 'directory', children: ['root.geospec.ts', 'lib'] }],
        ['/project/root.geospec.ts', { kind: 'file' }],
        ['/project/lib', { kind: 'directory', children: ['selected.geospec.ts', 'vase.slow.geospec.ts'] }],
        ['/project/lib/selected.geospec.ts', { kind: 'file' }],
        ['/project/lib/vase.slow.geospec.ts', { kind: 'file' }],
      ]),
    );

    const result = await discoverGeoSpecFiles({
      filesystem,
      projectPath: '/project',
      files: ['lib', 'root.geospec.ts'],
      exclude: ['**/*.slow.geospec.ts', 'root.geospec.ts'],
    });

    expect(result.files).toEqual(['lib/selected.geospec.ts']);
    expect(result.unmatchedRoots).toEqual([]);
  });

  it('should preserve sorted de-duplicated order after include and exclude filters', async () => {
    const filesystem = createInMemoryDiscoveryFileSystem(
      createInMemoryNodes([
        ['/project', { kind: 'directory', children: ['z.geospec.ts', 'lib'] }],
        ['/project/z.geospec.ts', { kind: 'file' }],
        ['/project/lib', { kind: 'directory', children: ['b.geospec.ts', 'a.geospec.ts'] }],
        ['/project/lib/a.geospec.ts', { kind: 'file' }],
        ['/project/lib/b.geospec.ts', { kind: 'file' }],
      ]),
    );

    const result = await discoverGeoSpecFiles({
      filesystem,
      projectPath: '/project',
      files: ['lib', '.', 'lib/a.geospec.ts'],
      include: ['**/*.geospec.ts'],
      exclude: ['**/b.geospec.ts'],
    });

    expect(result.files).toEqual(['lib/a.geospec.ts', 'z.geospec.ts']);
    expect(result.unmatchedRoots).toEqual([]);
  });

  it('should keep the original selection when exclude globs match nothing', async () => {
    const filesystem = createInMemoryDiscoveryFileSystem(
      createInMemoryNodes([
        ['/project', { kind: 'directory', children: ['main.geospec.ts'] }],
        ['/project/main.geospec.ts', { kind: 'file' }],
      ]),
    );

    const result = await discoverGeoSpecFiles({
      filesystem,
      projectPath: '/project',
      exclude: ['**/*.slow.geospec.ts'],
    });

    expect(result.files).toEqual(['main.geospec.ts']);
    expect(result.unmatchedRoots).toEqual([]);
  });

  it('should return an empty selection when include and exclude leave no matching files', async () => {
    const filesystem = createInMemoryDiscoveryFileSystem(
      createInMemoryNodes([
        ['/project', { kind: 'directory', children: ['main.geospec.ts'] }],
        ['/project/main.geospec.ts', { kind: 'file' }],
      ]),
    );

    const result = await discoverGeoSpecFiles({
      filesystem,
      projectPath: '/project',
      include: ['**/*.geospec.ts'],
      exclude: ['main.geospec.ts'],
    });

    expect(result.files).toEqual([]);
    expect(result.unmatchedRoots).toEqual([]);
  });

  it('should ignore generated cache and dependency directories by default', async () => {
    const filesystem = createInMemoryDiscoveryFileSystem(
      createInMemoryNodes([
        ['/project', { kind: 'directory', children: ['.tau', 'node_modules', 'src.geospec.ts'] }],
        ['/project/src.geospec.ts', { kind: 'file' }],
        ['/project/.tau', { kind: 'directory', children: ['cache', 'artifacts', 'transcripts'] }],
        ['/project/.tau/cache', { kind: 'directory', children: ['hidden.geospec.ts'] }],
        ['/project/.tau/cache/hidden.geospec.ts', { kind: 'file' }],
        ['/project/.tau/artifacts', { kind: 'directory', children: ['hidden.geospec.ts'] }],
        ['/project/.tau/artifacts/hidden.geospec.ts', { kind: 'file' }],
        ['/project/.tau/transcripts', { kind: 'directory', children: ['hidden.geospec.ts'] }],
        ['/project/.tau/transcripts/hidden.geospec.ts', { kind: 'file' }],
        ['/project/node_modules', { kind: 'directory', children: ['pkg.geospec.ts'] }],
        ['/project/node_modules/pkg.geospec.ts', { kind: 'file' }],
      ]),
    );

    const result = await discoverGeoSpecFiles({ filesystem, projectPath: '/project' });

    expect(result.files).toEqual(['src.geospec.ts']);
  });
});
