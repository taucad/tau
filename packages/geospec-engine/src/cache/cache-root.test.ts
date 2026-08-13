import { homedir, tmpdir } from 'node:os';
import type * as OsModule from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveGeoSpecCacheRoot } from '#cache/cache-root.js';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof OsModule>();
  return { ...actual, homedir: vi.fn(actual.homedir) };
});

describe('evidence cache root', () => {
  afterEach(() => vi.mocked(homedir).mockReset());

  it('defaults to the host cache directory', () => {
    vi.mocked(homedir).mockReturnValue('/home/tester');
    expect(resolveGeoSpecCacheRoot({ projectPath: '/project' })).toBe(
      join('/home/tester', '.cache', 'geospec', 'evidence'),
    );
  });

  it('falls back to the temp directory when no home exists', () => {
    vi.mocked(homedir).mockReturnValue('');
    expect(resolveGeoSpecCacheRoot({ projectPath: '/project' })).toBe(join(tmpdir(), '.cache', 'geospec', 'evidence'));
  });

  it('accepts an explicit out-of-tree directory or disables persistence', () => {
    expect(resolveGeoSpecCacheRoot({ projectPath: '/project', cacheDirectory: '/var/tmp/geospec-cache' })).toBe(
      '/var/tmp/geospec-cache',
    );
    expect(resolveGeoSpecCacheRoot({ projectPath: '/project', cache: false })).toBeUndefined();
  });

  it('rejects contradictory options and in-tree roots', () => {
    expect(() =>
      resolveGeoSpecCacheRoot({ projectPath: '/project', cache: false, cacheDirectory: '/var/tmp/cache' }),
    ).toThrow(/cannot combine/u);
    expect(() => resolveGeoSpecCacheRoot({ projectPath: '/project', cacheDirectory: '/project/.tau' })).toThrow(
      /outside the project root/u,
    );
    expect(() => resolveGeoSpecCacheRoot({ projectPath: '/project', cacheDirectory: '/project' })).toThrow(
      /outside the project root/u,
    );
  });

  it('allows a sibling whose path only shares a prefix', () => {
    const sibling = `${resolve('/project')}-cache`;
    expect(resolveGeoSpecCacheRoot({ projectPath: '/project', cacheDirectory: sibling })).toBe(sibling);
  });

  it('uses the process working directory when no project path is supplied', () => {
    expect(resolveGeoSpecCacheRoot({ cacheDirectory: join(tmpdir(), 'geospec-external-cache') })).toBe(
      join(tmpdir(), 'geospec-external-cache'),
    );
  });
});
