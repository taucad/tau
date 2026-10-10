import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBundlerSourceHost, updatePackageManifest } from '@taucad/bundler-core';
import type { PackageManifestCommit } from '@taucad/bundler-core';

import { createTestFileSystem } from '#testing.fixture.js';

const requestUrl = (input: RequestInfo | URL): string => (input instanceof Request ? input.url : input.toString());

const integrity = `sha512-${'A'.repeat(86)}==`;
const metadata = (
  name: string,
  versions: readonly string[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  'dist-tags': { latest: versions.at(-1), next: '2.0.0-beta.1' },
  versions: Object.fromEntries(
    versions.map((version) => [
      version,
      {
        name,
        version,
        dist: { tarball: `https://registry.npmjs.org/${name}/-/${version}.tgz`, integrity },
        ...extra,
      },
    ]),
  ),
});

const harness = (): {
  filesystem: ReturnType<typeof createTestFileSystem>;
  commit: PackageManifestCommit;
  update: (
    requests: Readonly<Record<string, string>>,
    mode?: 'install' | 'upgrade',
  ) => ReturnType<typeof updatePackageManifest>;
} => {
  const filesystem = createTestFileSystem();
  const commit: PackageManifestCommit = async ({ expected, content }) => {
    const current = (await filesystem.exists('package.json'))
      ? await filesystem.readFile('package.json', 'utf8')
      : undefined;
    if (current !== expected) {
      return false;
    }
    await filesystem.writeFile('package.json', content);
    return true;
  };
  return {
    filesystem,
    commit,
    update: async (requests, mode = 'install') =>
      updatePackageManifest({
        filesystem,
        requests,
        mode,
        nodeVersion: '24.0.0',
        signal: new AbortController().signal,
        commit,
      }),
  };
};

const registryFetch = (
  versions: readonly string[] = ['1.0.0', '1.2.0', '2.0.0-beta.1', '2.0.0'],
): ReturnType<typeof vi.fn<typeof fetch>> =>
  vi.fn<typeof fetch>(async (input) => {
    const url = new URL(requestUrl(input));
    if (url.hostname === 'registry.npmjs.org') {
      return Response.json(metadata(decodeURIComponent(url.pathname.slice(1)), versions));
    }
    return new Response('export const value = 42;');
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('deterministic package manifests', () => {
  it('should persist exact scoped and unscoped versions while preserving requested ranges', async () => {
    vi.stubGlobal('fetch', registryFetch());
    const project = harness();
    const lock = await project.update({ '@scope/example': '^1.0.0', example: '~1.0.0' });
    expect(lock.packages['@scope/example']).toMatchObject({
      requested: '^1.0.0',
      registry: { version: '1.2.0', integrity },
    });
    expect(JSON.parse(await project.filesystem.readFile('package.json', 'utf8'))).toMatchObject({
      dependencies: { '@scope/example': '1.2.0', example: '1.0.0' },
      taucadPackageLock: lock,
    });
  });

  it('should reinstall offline without drift and upgrade only to a newer allowed version', async () => {
    const fetchMock = registryFetch(['1.0.0']);
    vi.stubGlobal('fetch', fetchMock);
    const project = harness();
    const initial = await project.update({ example: '^1' });
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await project.update({ example: '^1' })).toEqual(initial);
    await expect(project.update({ example: '^2' })).rejects.toThrow('Use upgrade explicitly');
    const current = await project.filesystem.readFile('package.json', 'utf8');
    await expect(project.update({ example: '^1' }, 'upgrade')).rejects.toThrow('Registry unavailable');
    expect(await project.filesystem.readFile('package.json', 'utf8')).toBe(current);
    vi.stubGlobal('fetch', registryFetch(['1.0.0', '1.3.0', '2.0.0']));
    const upgraded = await project.update({ example: '^1' }, 'upgrade');
    expect(upgraded.packages['example']?.registry.version).toBe('1.3.0');
  });

  it.each([
    ['*', '2.0.0'],
    ['next', '2.0.0-beta.1'],
    ['^2.0.0-beta.0', '2.0.0'],
    ['1.0.0', '1.0.0'],
  ])('should apply npm semver and tag semantics for %s', async (requested, version) => {
    vi.stubGlobal('fetch', registryFetch());
    const lock = await harness().update({ example: requested });
    expect(lock.packages['example']?.registry.version).toBe(version);
  });

  it('should reject unavailable versions and malformed partial registry responses without publishing', async () => {
    const project = harness();
    vi.stubGlobal('fetch', registryFetch(['1.0.0']));
    await expect(project.update({ example: '1.1.0' })).rejects.toThrow('No published version');
    vi.stubGlobal('fetch', async () => Response.json({ versions: {} }));
    await expect(project.update({ example: '*' })).rejects.toThrow('incomplete metadata');
    vi.stubGlobal('fetch', async () => new Response('{"versions":'));
    await expect(project.update({ example: '*' })).rejects.toThrow('invalid JSON');
    expect(await project.filesystem.exists('package.json')).toBe(false);
  });

  it('should retry transient registry failures without forwarding credentials', async () => {
    const fetchMock = registryFetch();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await harness().update({ example: '^1' });
    expect(fetchMock.mock.calls.filter(([url]) => requestUrl(url).includes('registry.npmjs.org'))).toHaveLength(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
  });

  it.each([
    [{ engines: { node: '>=30' } }, 'requires Node'],
    [{ peerDependencies: { peer: '^2' } }, 'requires peer'],
    [{ dist: { tarball: 'https://registry.npmjs.org/example.tgz', integrity: 'bad' } }, 'valid integrity'],
  ])('should reject incompatible or unverifiable metadata', async (extra, message) => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
      requestUrl(input).includes('registry.npmjs.org')
        ? Response.json(metadata('example', ['1.0.0'], extra))
        : new Response('export {};'),
    );
    const project = harness();
    await expect(project.update({ example: '*' })).rejects.toThrow(message);
    expect(await project.filesystem.exists('package.json')).toBe(false);
  });

  it('should accept compatible peers and absent optional peers', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(requestUrl(input));
      const name = url.pathname.slice(1);
      return url.hostname === 'registry.npmjs.org'
        ? Response.json(
            metadata(
              name,
              ['1.0.0'],
              name === 'example'
                ? {
                    peerDependencies: { peer: '^1', optional: '^3' },
                    peerDependenciesMeta: { optional: { optional: true } },
                  }
                : {},
            ),
          )
        : new Response('export {};');
    });
    const lock = await harness().update({ example: '*', peer: '^1' });
    expect(Object.keys(lock.packages)).toEqual(['example', 'peer']);
  });

  it('should refuse unsealed static and dynamic imports instead of claiming a transitive lock', async () => {
    for (const code of ['export * from "/dep@1.0.0/es2022/dep.mjs";', 'export const load = () => import("dep");']) {
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
        requestUrl(input).includes('registry.npmjs.org')
          ? Response.json(metadata('example', ['1.0.0']))
          : new Response(code),
      );
      const project = harness();
      // oxlint-disable-next-line no-await-in-loop -- each closure shape must independently refuse publication
      await expect(project.update({ example: '*' })).rejects.toThrow('runtime imports require a transitive lock');
      // oxlint-disable-next-line no-await-in-loop -- inspect each independent project
      expect(await project.filesystem.exists('package.json')).toBe(false);
    }
  });

  it('should consume locked bytes offline and track manifest and artifact in source dependencies', async () => {
    vi.stubGlobal('fetch', registryFetch());
    const project = harness();
    const lock = await project.update({ example: '^1' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const host = createBundlerSourceHost({ filesystem: project.filesystem });
    const session = host.beginSession({ mode: 'bundle', signal: new AbortController().signal, entryPath: 'main.ts' });
    try {
      const resolution = await session.resolve({ specifier: 'example' });
      const source = await session.load(resolution);
      expect(source.text).toBe('export const value = 42;');
      expect(session.complete().dependencies).toEqual([lock.packages['example']!.artifact.cachePath, 'package.json']);
      await expect(session.resolve({ specifier: 'example@2.0.0' })).rejects.toThrow('not admitted');
      await expect(session.resolve({ specifier: 'other' })).rejects.toThrow('not admitted');
      await project.filesystem.writeFile(resolution.id, 'tampered');
      await expect(session.load(resolution)).rejects.toThrow('SHA-256 integrity');
    } finally {
      host.dispose();
    }
  });

  it('should preserve the old manifest after atomic write failure or concurrent edit', async () => {
    vi.stubGlobal('fetch', registryFetch());
    const project = harness();
    await project.update({ example: '^1' });
    const expected = await project.filesystem.readFile('package.json', 'utf8');
    const input = {
      filesystem: project.filesystem,
      requests: { example: '^2' },
      mode: 'upgrade',
      nodeVersion: '24.0.0',
      signal: new AbortController().signal,
    } as const;
    await expect(
      updatePackageManifest({
        ...input,
        commit: async () => {
          throw new Error('disk full');
        },
      }),
    ).rejects.toThrow('disk full');
    expect(await project.filesystem.readFile('package.json', 'utf8')).toBe(expected);
    await expect(updatePackageManifest({ ...input, commit: async () => false })).rejects.toThrow(
      'changed during resolution',
    );
    expect(await project.filesystem.readFile('package.json', 'utf8')).toBe(expected);
  });

  it('should reject corrupted artifacts and restore missing bytes only from the locked URL', async () => {
    vi.stubGlobal('fetch', registryFetch());
    const project = harness();
    const lock = await project.update({ example: '^1' });
    const entry = lock.packages['example'];
    expect(entry).toBeDefined();
    await project.filesystem.writeFile(entry!.artifact.cachePath, 'changed');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network must not be used')));
    await expect(project.update({ example: '^1' })).rejects.toThrow('SHA-256 integrity');
    const text = await project.filesystem.readFile('package.json', 'utf8');
    const missing = createTestFileSystem({ 'package.json': text });
    const restoreFetch = vi.fn(async () => new Response('export const value = 42;'));
    vi.stubGlobal('fetch', restoreFetch);
    await expect(
      updatePackageManifest({
        filesystem: missing,
        requests: { example: '^1' },
        mode: 'install',
        nodeVersion: '24.0.0',
        signal: new AbortController().signal,
        commit: project.commit,
      }),
    ).resolves.toEqual(lock);
    expect(restoreFetch).toHaveBeenCalledExactlyOnceWith(
      entry!.artifact.resolutionMetadata.resolvedUrl,
      expect.objectContaining({ credentials: 'omit' }),
    );
  });
});

describe('manifest publication boundaries', () => {
  it('should let an atomic host commit fence concurrent conflicting updates', async () => {
    vi.stubGlobal('fetch', registryFetch());
    const filesystem = createTestFileSystem();
    let current: string | undefined;
    const commit: PackageManifestCommit = async ({ expected, content }) => {
      if (current !== expected) {
        return false;
      }
      current = content;
      await filesystem.writeFile('package.json', content);
      return true;
    };
    const base = {
      filesystem,
      commit,
      nodeVersion: '24.0.0',
      signal: new AbortController().signal,
      mode: 'install',
    } as const;
    const results = await Promise.allSettled([
      updatePackageManifest({ ...base, requests: { example: '^1' } }),
      updatePackageManifest({ ...base, requests: { example: '^2' } }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await filesystem.readFile('package.json', 'utf8')).toBe(current);
  });

  it('should leave the manifest intact when cancellation occurs during acquisition', async () => {
    const controller = new AbortController();
    const fetchMock = registryFetch();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      return Response.json(metadata('example', ['1.0.0']));
    });
    vi.stubGlobal('fetch', fetchMock);
    const project = harness();
    await expect(
      updatePackageManifest({
        filesystem: project.filesystem,
        commit: project.commit,
        requests: { example: '*' },
        nodeVersion: '24.0.0',
        signal: controller.signal,
        mode: 'install',
      }),
    ).rejects.toThrow();
    expect(await project.filesystem.exists('package.json')).toBe(false);
  });

  it('should reject modified cold CDN bytes instead of accepting a rebuilt bundle', async () => {
    vi.stubGlobal('fetch', registryFetch());
    const project = harness();
    await project.update({ example: '^1' });
    const content = await project.filesystem.readFile('package.json', 'utf8');
    const filesystem = createTestFileSystem({ 'package.json': content });
    vi.stubGlobal('fetch', async () => new Response('export const value = 43;'));
    await expect(
      updatePackageManifest({
        filesystem,
        commit: project.commit,
        requests: { example: '^1' },
        nodeVersion: '24.0.0',
        signal: new AbortController().signal,
        mode: 'install',
      }),
    ).rejects.toThrow('SHA-256 integrity');
    expect(await filesystem.readFile('package.json', 'utf8')).toBe(content);
  });

  it('should follow a same-origin esm.sh bundle and freeze its inlined transitive code', async () => {
    const fetchMock = registryFetch();
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes('registry.npmjs.org')) {
        return Response.json(metadata('example', ['1.0.0']));
      }
      if (url.endsWith('?bundle')) {
        return new Response('export * from "/example@1.0.0/es2022/example.bundle.mjs";', {
          headers: { 'x-esm-path': '/example@1.0.0/es2022/example.bundle.mjs' },
        });
      }
      return new Response('const transitive = 1; export const value = transitive;');
    });
    vi.stubGlobal('fetch', fetchMock);
    const project = harness();
    const lock = await project.update({ example: '^1' });
    expect(await project.filesystem.readFile(lock.packages['example']!.artifact.cachePath, 'utf8')).toBe(
      'const transitive = 1; export const value = transitive;',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('registry and lock recovery', () => {
  it('should retain a cached yanked version on reinstall and refuse a fresh exact resolution', async () => {
    vi.stubGlobal('fetch', registryFetch(['1.0.0']));
    const project = harness();
    const lock = await project.update({ example: '1.0.0' });
    vi.stubGlobal('fetch', registryFetch(['2.0.0']));
    expect(await project.update({ example: '1.0.0' })).toEqual(lock);
    await expect(project.update({ example: '1.0.0' }, 'upgrade')).rejects.toThrow('No published version');
  });

  it('should retry interrupted registry response streams and publish only a complete result', async () => {
    const fetchMock = registryFetch();
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('connection interrupted'));
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const project = harness();
    const lock = await project.update({ example: '^1' });
    expect(lock.packages['example']?.registry.version).toBe('1.2.0');
    expect(fetchMock.mock.calls.filter(([input]) => requestUrl(input).includes('registry.npmjs.org'))).toHaveLength(2);
  });

  it('should preserve unrelated manifest fields and reject dependency-lock edits', async () => {
    vi.stubGlobal('fetch', registryFetch());
    const project = harness();
    await project.filesystem.writeFile(
      'package.json',
      JSON.stringify({ name: 'project', private: true, scripts: { postinstall: 'must never run' } }),
    );
    await project.update({ example: '^1' });
    const text = await project.filesystem.readFile('package.json', 'utf8');
    expect(JSON.parse(text)).toMatchObject({
      name: 'project',
      private: true,
      scripts: { postinstall: 'must never run' },
    });
    await project.filesystem.writeFile('package.json', text.replace('"example": "1.2.0"', '"example": "2.0.0"'));
    await expect(project.update({ example: '^1' })).rejects.toThrow('Invalid dependency lock');
  });
});

describe('standard package subpaths', () => {
  it('should pin explicitly requested subpaths to the root version and consume standard import syntax offline', async () => {
    vi.stubGlobal('fetch', registryFetch(['1.0.0']));
    const project = harness();
    const input = {
      filesystem: project.filesystem,
      commit: project.commit,
      requests: { '@scope/example': '^1' },
      imports: ['@scope/example/feature'],
      mode: 'install',
      nodeVersion: '24.0.0',
      signal: new AbortController().signal,
    } as const;
    const lock = await updatePackageManifest(input);
    expect(lock.packages['@scope/example']?.subpaths?.['feature']?.resolutionMetadata.requestedSpecifier).toBe(
      '@scope/example@1.0.0/feature',
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await updatePackageManifest(input)).toEqual(lock);
    const { imports: _imports, ...reinstall } = input;
    expect(await updatePackageManifest(reinstall)).toEqual(lock);
    const host = createBundlerSourceHost({ filesystem: project.filesystem });
    try {
      const session = host.beginSession({ mode: 'bundle', signal: input.signal, entryPath: 'main.ts' });
      const resolved = await session.resolve({ specifier: '@scope/example/feature' });
      const source = await session.load(resolved);
      expect(source.text).toBe('export const value = 42;');
      await expect(session.resolve({ specifier: '@scope/example/undeclared' })).rejects.toThrow('no locked subpath');
      await expect(session.resolve({ specifier: '@scope/example/constructor' })).rejects.toThrow('no locked subpath');
    } finally {
      host.dispose();
    }
    vi.stubGlobal('fetch', registryFetch(['1.0.0', '1.1.0']));
    const upgraded = await updatePackageManifest({ ...reinstall, mode: 'upgrade' });
    expect(upgraded.packages['@scope/example']?.subpaths?.['feature']?.resolutionMetadata.requestedSpecifier).toBe(
      '@scope/example@1.1.0/feature',
    );
  });

  it('should reject external peers in a JSX runtime instead of producing independently bundled React singletons', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes('registry.npmjs.org')) {
        return Response.json(metadata('react', ['19.2.0']));
      }
      return new Response(
        url.includes('jsx-runtime')
          ? 'import React from "/react@19.2.0/es2022/react.mjs"; export { React };'
          : 'export const version = "19.2.0";',
      );
    });
    const project = harness();
    await expect(
      updatePackageManifest({
        filesystem: project.filesystem,
        commit: project.commit,
        requests: { react: '^19' },
        imports: ['react/jsx-runtime'],
        mode: 'install',
        nodeVersion: '24.0.0',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('runtime imports require a transitive lock');
    expect(await project.filesystem.exists('package.json')).toBe(false);
  });
});
