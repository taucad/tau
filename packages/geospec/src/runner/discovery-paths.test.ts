import { describe, expect, it } from 'vitest';
import { discoverGeoSpecFiles, isGeoSpecTestFile } from '#runner/discovery.js';
import type { GeoSpecDiscoveryFileSystem } from '#runner/discovery.js';

/** Filesystem over a flat path map; directories are inferred in the same namespace. */
const filesystemOf = (paths: readonly string[]): GeoSpecDiscoveryFileSystem => {
  const files = new Set(paths);
  const rooted = paths.every((path) => !path.startsWith('/'));
  const root = rooted ? '' : '/';
  const directories = new Set<string>([root]);
  for (const path of paths) {
    const segments = path.split('/').slice(rooted ? 0 : 1, -1);
    let current = root === '/' ? '' : root;
    for (const segment of segments) {
      current = current === '' ? segment : `${current}/${segment}`;
      if (!rooted) {
        current = `/${current.replace(/^\//u, '')}`;
      }
      directories.add(current);
    }
  }

  return {
    async readdir(path) {
      const prefix = path === '' || path === '/' ? root : `${path}/`;
      const entries = new Set<string>();
      for (const candidate of [...files, ...directories]) {
        if (candidate === path || !candidate.startsWith(prefix)) {
          continue;
        }
        entries.add(candidate.slice(prefix.length).split('/')[0] ?? '');
      }
      return [...entries];
    },
    async stat(path) {
      if (files.has(path)) {
        return { kind: 'file' };
      }
      if (directories.has(path)) {
        return { kind: 'directory' };
      }
      throw new Error(`ENOENT: ${path}`);
    },
  };
};

const tree = [
  '/project/specs/a.geospec.ts',
  '/project/specs/nested/b.geospec.js',
  '/project/specs/notes.md',
  '/project/node_modules/vendor/c.geospec.ts',
  '/project/.tau/cache/d.geospec.ts',
];

describe('isGeoSpecTestFile', () => {
  it.each([
    ['specs/a.geospec.ts', true],
    [String.raw`specs\a.geospec.js`, true],
    ['./specs//a.geospec.ts', true],
    ['specs/a.spec.ts', false],
  ])('should classify %s as %s', (path, expected) => {
    expect(isGeoSpecTestFile(path)).toBe(expected);
  });
});

describe('discoverGeoSpecFiles path handling', () => {
  it('should walk the project root and skip ignored directories', async () => {
    const result = await discoverGeoSpecFiles({ filesystem: filesystemOf(tree), projectPath: '/project' });

    expect(result).toStrictEqual({
      files: ['specs/a.geospec.ts', 'specs/nested/b.geospec.js'],
      unmatchedRoots: [],
    });
  });

  it('should normalize a trailing slash on an absolute host project path', async () => {
    const result = await discoverGeoSpecFiles({ filesystem: filesystemOf(tree), projectPath: '/project/' });

    expect(result.files).toStrictEqual(['specs/a.geospec.ts', 'specs/nested/b.geospec.js']);
  });

  it('should treat an empty project path as the filesystem root', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(['a.geospec.ts']),
      projectPath: '',
    });

    expect(result.files).toStrictEqual(['a.geospec.ts']);
  });

  it('should treat a dot project path as the filesystem root', async () => {
    const result = await discoverGeoSpecFiles({ filesystem: filesystemOf(['a.geospec.ts']), projectPath: '.' });

    expect(result.files).toStrictEqual(['a.geospec.ts']);
  });

  it.each([['a relative root', 'specs']])('should expand %s', async (_label, root) => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(tree),
      projectPath: '/project',
      files: [root],
    });

    expect(result.files.length).toBeGreaterThan(0);
  });

  it.each(['/project/specs', String.raw`specs\nested`, './specs'])(
    'should reject non-canonical root %s',
    async (root) => {
      await expect(
        discoverGeoSpecFiles({ filesystem: filesystemOf(tree), projectPath: '/project', files: [root] }),
      ).rejects.toMatchObject({ name: 'VirtualPathError' });
    },
  );

  it('should accept an exact file root', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(tree),
      projectPath: '/project',
      files: ['specs/a.geospec.ts'],
    });

    expect(result).toStrictEqual({ files: ['specs/a.geospec.ts'], unmatchedRoots: [] });
  });

  it('should report a non-GeoSpec file root as unmatched', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(tree),
      projectPath: '/project',
      files: ['specs/notes.md'],
    });

    expect(result).toStrictEqual({ files: [], unmatchedRoots: ['specs/notes.md'] });
  });

  it('should report a missing root as unmatched', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(tree),
      projectPath: '/project',
      files: ['nowhere'],
    });

    expect(result).toStrictEqual({ files: [], unmatchedRoots: ['nowhere'] });
  });

  it('should report the canonical empty root that selects nothing as unmatched', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(['/project/notes.md']),
      projectPath: '/project',
      files: [''],
    });

    expect(result).toStrictEqual({ files: [], unmatchedRoots: ['.'] });
  });

  it('should return nothing for an explicitly ignored directory root', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(tree),
      projectPath: '/project',
      files: ['node_modules'],
    });

    expect(result.files).toStrictEqual([]);
  });

  it('should honour a caller-supplied ignore list', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(tree),
      projectPath: '/project',
      ignoredDirectories: ['specs/nested', 'node_modules', '.tau/cache'],
    });

    expect(result.files).toStrictEqual(['specs/a.geospec.ts']);
  });

  it('should de-duplicate overlapping roots', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(tree),
      projectPath: '/project',
      files: ['specs', 'specs/a.geospec.ts'],
    });

    expect(result.files).toStrictEqual(['specs/a.geospec.ts', 'specs/nested/b.geospec.js']);
  });

  it.each([
    ['a globstar prefix', ['**/nested/*.geospec.js'], ['specs/nested/b.geospec.js']],
    ['a bare globstar', ['specs/**'], ['specs/a.geospec.ts', 'specs/nested/b.geospec.js']],
    ['a single-segment star', ['specs/*.geospec.ts'], ['specs/a.geospec.ts']],
    ['a single-character wildcard', ['specs/?.geospec.ts'], ['specs/a.geospec.ts']],
    ['a brace alternation', ['specs/{a,z}.geospec.ts'], ['specs/a.geospec.ts']],
    ['an unclosed brace', ['specs/{a.geospec.ts'], []],
    ['a regex-special literal', ['specs/a+b.geospec.ts'], []],
  ])('should apply %s as an include glob', async (_label, include, expected) => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(tree),
      projectPath: '/project',
      include,
    });

    expect(result.files).toStrictEqual(expected);
  });

  it('should apply exclude globs after include globs', async () => {
    const result = await discoverGeoSpecFiles({
      filesystem: filesystemOf(tree),
      projectPath: '/project',
      exclude: ['**/nested/**'],
    });

    expect(result.files).toStrictEqual(['specs/a.geospec.ts']);
  });
});
