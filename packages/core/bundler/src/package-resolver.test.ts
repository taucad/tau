import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { resolveDependencyTree, serializePackageLock } from '@taucad/bundler-core';
import type { PackageLock, PackageRegistry, Packument, PackumentVersion } from '@taucad/bundler-core';

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')) as T;

/** Abbreviated packuments captured from registry.npmjs.org on 2026-10-09, trimmed to the versions used here. */
const recorded = readJson<Record<string, Packument>>('packuments.json');
/** `npm install --package-lock-only` output (npm 11.6.1) for each manifest. */
const layouts = readJson<Record<string, { manifest: Record<string, unknown>; lock: PackageLock }>>('npm-layouts.json');

const integrity = `sha512-${'A'.repeat(86)}==`;
const version = (name: string, value: string, extra: Partial<PackumentVersion> = {}): PackumentVersion => ({
  name,
  version: value,
  dist: { tarball: `https://registry.npmjs.org/${name}/-/${name}-${value}.tgz`, integrity },
  ...extra,
});
const packument = (name: string, versions: readonly PackumentVersion[]): Packument => ({
  name,
  'dist-tags': { latest: versions.at(-1)?.version ?? '0.0.0' },
  versions: Object.fromEntries(versions.map((entry) => [entry.version, entry])),
});

const registryOf = (extra: Readonly<Record<string, Packument>> = {}): ReturnType<typeof vi.fn<PackageRegistry>> =>
  vi.fn<PackageRegistry>(async (name) => extra[name] ?? recorded[name]);

const { signal } = new AbortController();

/** Abbreviated packuments carry no `license`; npm reads full documents. Everything else must match npm. */
const withoutLicense = (lock: PackageLock): PackageLock => ({
  ...lock,
  packages: Object.fromEntries(
    Object.entries(lock.packages).map(([path, { license: _license, ...entry }]) => [path, entry]),
  ),
});

describe('resolveDependencyTree', () => {
  it.each(['basic', 'alias', 'nest', 'peer'])(
    'should reproduce the tree npm writes for the %s fixture',
    async (name) => {
      const layout = layouts[name];
      if (layout === undefined) {
        expect.fail(`missing layout ${name}`);
      }
      const result = await resolveDependencyTree({ manifest: layout.manifest, registry: registryOf(), signal });
      expect(result.issues).toEqual([]);
      expect(result.lock).toEqual(withoutLicense(layout.lock));
    },
  );

  it('should hoist transitive dependencies and nest a conflicting version under its dependent', async () => {
    const { lock } = await resolveDependencyTree({
      manifest: { dependencies: { debug: '^2', ms: '^2.1' } },
      registry: registryOf(),
      signal,
    });
    expect(lock?.packages['node_modules/ms']?.version).toBe('2.1.3');
    expect(lock?.packages['node_modules/debug/node_modules/ms']?.version).toBe('2.0.0');
  });

  it('should install a missing peer beside its dependent and mark it peer', async () => {
    const { lock } = await resolveDependencyTree({
      manifest: { dependencies: { 'react-dom': '^18' } },
      registry: registryOf(),
      signal,
    });
    expect(lock?.packages['node_modules/react']).toMatchObject({ version: '18.3.1', peer: true });
    expect(lock?.packages['node_modules/react-dom/node_modules/react']).toBeUndefined();
  });

  it('should refuse an unsatisfiable peer with peer-conflict and no lock', async () => {
    const result = await resolveDependencyTree({
      manifest: { dependencies: { react: '^17', 'react-dom': '^18' } },
      registry: registryOf({ 'object-assign': packument('object-assign', [version('object-assign', '4.1.1')]) }),
      signal,
    });
    expect(result.lock).toBeUndefined();
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'peer-conflict', name: 'react', path: 'node_modules/react-dom' }),
    ]);
  });

  it('should ignore optional peers and record optional platform dependencies without materialising them', async () => {
    const extra = {
      host: packument('host', [
        version('host', '1.0.0', {
          optionalDependencies: { native: '^1' },
          peerDependencies: { typescript: '*' },
          peerDependenciesMeta: { typescript: { optional: true } },
        }),
      ]),
      native: packument('native', [
        version('native', '1.0.0', { os: ['darwin'], cpu: ['arm64'], hasInstallScript: true }),
      ]),
    };
    const result = await resolveDependencyTree({
      manifest: { dependencies: { host: '^1' } },
      registry: registryOf(extra),
      signal,
    });
    expect(result.lock?.packages['node_modules/native']).toEqual({
      version: '1.0.0',
      resolved: 'https://registry.npmjs.org/native/-/native-1.0.0.tgz',
      integrity,
      os: ['darwin'],
      cpu: ['arm64'],
      hasInstallScript: true,
      optional: true,
    });
    expect(result.lock?.packages['node_modules/typescript']).toBeUndefined();
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'install-script-skipped', name: 'native', path: 'node_modules/native' }),
    ]);
  });

  it('should skip an optional dependency with no matching version, as npm does', async () => {
    const extra = { host: packument('host', [version('host', '1.0.0', { optionalDependencies: { missing: '^1' } })]) };
    const result = await resolveDependencyTree({
      manifest: { dependencies: { host: '1.0.0' } },
      registry: registryOf(extra),
      signal,
    });
    expect(Object.keys(result.lock?.packages ?? {})).toEqual(['', 'node_modules/host']);
  });

  it('should mark devDependencies dev and keep them in the root entry', async () => {
    const { lock } = await resolveDependencyTree({
      manifest: { dependencies: { 'd3-shape': '^3' }, devDependencies: { 'is-number': '^7' } },
      registry: registryOf(),
      signal,
    });
    expect(lock?.packages['']).toEqual({ dependencies: { 'd3-shape': '^3' }, devDependencies: { 'is-number': '^7' } });
    expect(lock?.packages['node_modules/is-number']?.dev).toBe(true);
    expect(lock?.packages['node_modules/d3-path']?.dev).toBeUndefined();
  });

  it('should refuse git, file, workspace, link and URL specifiers', async () => {
    const result = await resolveDependencyTree({
      manifest: {
        dependencies: {
          a: 'github:user/a',
          b: 'file:../b',
          c: 'workspace:*',
          d: 'git+https://example.com/d.git',
          e: 'https://example.com/e.tgz',
          f: 'user/f',
          'is-number': '^7',
        },
      },
      registry: registryOf(),
      signal,
    });
    expect(result.lock).toBeUndefined();
    expect(result.issues.map((issue) => [issue.code, issue.name])).toEqual(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ['unsupported-dependency-protocol', name]),
    );
  });

  it('should report registry-unavailable once per package and no-matching-version for a bad range', async () => {
    const registry = vi.fn<PackageRegistry>(async (name) => {
      if (name === 'offline') {
        throw new Error('Registry unavailable for offline after 3 attempts.');
      }
      return recorded[name];
    });
    const result = await resolveDependencyTree({
      manifest: { dependencies: { offline: '^1', 'is-number': '^99' } },
      registry,
      signal,
    });
    expect(result.lock).toBeUndefined();
    expect(result.issues.map((issue) => [issue.code, issue.name])).toEqual([
      ['no-matching-version', 'is-number'],
      ['registry-unavailable', 'offline'],
    ]);
  });

  it('should produce byte-identical locks regardless of manifest insertion order', async () => {
    const first = await resolveDependencyTree({
      manifest: { dependencies: { 'react-dom': '^18', ms: '^2.1', debug: '^2', 'd3-shape': '^3' } },
      registry: registryOf(),
      signal,
    });
    const second = await resolveDependencyTree({
      manifest: { dependencies: { 'd3-shape': '^3', debug: '^2', ms: '^2.1', 'react-dom': '^18' } },
      registry: registryOf(),
      signal,
    });
    expect(first.lock).toBeDefined();
    expect(serializePackageLock(first.lock ?? { lockfileVersion: 3, requires: true, packages: {} })).toBe(
      serializePackageLock(second.lock ?? { lockfileVersion: 3, requires: true, packages: {} }),
    );
  });

  it('should reuse locked versions offline and re-resolve only upgraded names', async () => {
    const stale = packument('is-number', [version('is-number', '7.0.0'), version('is-number', '7.1.0')]);
    const basic = layouts['basic']?.lock;
    const manifest = layouts['basic']?.manifest;
    if (basic === undefined || manifest === undefined) {
      expect.fail('missing basic layout');
    }
    const offline = vi.fn<PackageRegistry>(async () => {
      throw new Error('offline');
    });
    const reused = await resolveDependencyTree({ manifest, previousLock: basic, registry: offline, signal });
    expect(offline).not.toHaveBeenCalled();
    expect(serializePackageLock(reused.lock ?? basic)).toBe(serializePackageLock(basic));

    const upgraded = await resolveDependencyTree({
      manifest,
      previousLock: basic,
      upgrade: ['is-number'],
      registry: registryOf({ 'is-number': stale }),
      signal,
    });
    expect(upgraded.lock?.packages['node_modules/is-number']?.version).toBe('7.1.0');
    expect(upgraded.lock?.packages['node_modules/d3-shape']).toEqual(basic.packages['node_modules/d3-shape']);
  });
});
