import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { lockMatchesManifest, parsePackageLock, readPackageLock, serializePackageLock } from '@taucad/bundler-core';
import type { PackageLock } from '@taucad/bundler-core';

import { createTestFileSystem } from '#testing.fixture.js';

const fixture = async (name: string): Promise<string> =>
  readFile(new URL(`fixtures/npm-basic/${name}`, import.meta.url), 'utf8');

const reversed = <T>(value: T): T => {
  if (Array.isArray(value) || typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reversed(item)]),
  ) as T;
};

describe('package-lock.json model', () => {
  it('should round-trip a lock written by npm byte for byte', async () => {
    const text = await fixture('package-lock.json');
    const lock = parsePackageLock(text);
    expect(Object.keys(lock.packages)).toEqual([
      '',
      'node_modules/d3-path',
      'node_modules/d3-shape',
      'node_modules/is-number',
    ]);
    expect(lock.packages['node_modules/d3-shape']).toMatchObject({
      version: '3.2.0',
      dependencies: { 'd3-path': '^3.1.0' },
    });
    expect(serializePackageLock(lock)).toBe(text);
  });

  it('should serialize identically whatever order keys were inserted in', async () => {
    const text = await fixture('package-lock.json');
    const lock = parsePackageLock(text);
    const shuffled = reversed(lock);
    expect(Object.keys(shuffled.packages)[0]).toBe('node_modules/is-number');
    expect(serializePackageLock(shuffled)).toBe(text);
    expect(serializePackageLock(parsePackageLock(serializePackageLock(shuffled)))).toBe(text);
  });

  it('should keep inBundle rows in the position npm writes them', () => {
    // Rows copied from `npm install --package-lock-only` of npm@10.9.2 (npm 11.6.1); `bundleDependencies` is not modelled, so it is left out.
    const text = `${JSON.stringify(
      {
        name: 'x',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': { name: 'x', version: '1.0.0', dependencies: { npm: '10.9.2' } },
          'node_modules/npm': {
            version: '10.9.2',
            resolved: 'https://registry.npmjs.org/npm/-/npm-10.9.2.tgz',
            integrity:
              'sha512-iriPEPIkoMYUy3F6f3wwSZAU93E0Eg6cHwIR6jzzOXWSy+SD/rOODEs74cVONHKSx2obXtuUoyidVEhISrisgQ==',
            license: 'Artistic-2.0',
            dependencies: { encoding: '^0.1.13' },
            bin: { npm: 'bin/npm-cli.js', npx: 'bin/npx-cli.js' },
            engines: { node: '^18.17.0 || >=20.5.0' },
          },
          'node_modules/npm/node_modules/encoding': {
            version: '0.1.13',
            inBundle: true,
            license: 'MIT',
            optional: true,
            dependencies: { 'iconv-lite': '^0.6.2' },
          },
        },
      },
      undefined,
      2,
    )}\n`;
    const lock = parsePackageLock(text);
    expect(lock.packages['node_modules/npm/node_modules/encoding']?.inBundle).toBe(true);
    expect(serializePackageLock(reversed(lock))).toBe(text);
  });

  it('should drop fields Tau does not model and keep the ones it does', () => {
    const lock = parsePackageLock(
      JSON.stringify({
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': { dependencies: { a: '^1' } },
          'node_modules/a': {
            version: '1.0.0',
            resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz',
            integrity: `sha512-${'A'.repeat(86)}==`,
            funding: { url: 'https://example.com' },
            deprecated: 'old',
            os: ['darwin'],
            optional: true,
            dev: false,
          },
        },
      }),
    );
    expect(lock.packages['node_modules/a']).toEqual({
      version: '1.0.0',
      resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz',
      integrity: `sha512-${'A'.repeat(86)}==`,
      os: ['darwin'],
      optional: true,
    });
  });

  it('should refuse lockfileVersion 2 and non-node_modules entries', () => {
    expect(() => parsePackageLock(JSON.stringify({ lockfileVersion: 2, packages: { '': {} } }))).toThrow(
      'lockfileVersion 2; Tau reads version 3',
    );
    expect(() =>
      parsePackageLock(
        JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'packages/app': { version: '1.0.0' } } }),
      ),
    ).toThrow("entry 'packages/app' is not a node_modules path");
    expect(() =>
      parsePackageLock(
        JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/../x': { version: '1.0.0' } } }),
      ),
    ).toThrow('is not a node_modules path');
  });

  it('should report an unreadable lock as lock-invalid and an absent lock as empty', async () => {
    expect(await readPackageLock(createTestFileSystem())).toEqual({});
    const result = await readPackageLock(createTestFileSystem({ 'package-lock.json': '{"lockfileVersion":1}' }));
    expect(result.issue?.code).toBe('lock-invalid');
    expect(result.issue?.message).toContain('lockfileVersion 1');
    const text = await fixture('package-lock.json');
    expect(await readPackageLock(createTestFileSystem({ 'package-lock.json': text }))).toEqual({
      lock: parsePackageLock(text),
    });
  });

  it('should report lock-stale when package.json ranges differ from the lock root', async () => {
    const lock: PackageLock = parsePackageLock(await fixture('package-lock.json'));
    const manifest = JSON.parse(await fixture('package.json')) as Record<string, unknown>;
    expect(lockMatchesManifest(lock, manifest)).toBeUndefined();
    expect(lockMatchesManifest(lock, { ...manifest, dependencies: { 'd3-shape': '^3', 'is-number': '^6' } })).toEqual({
      code: 'lock-stale',
      message: 'package.json dependencies differ from package-lock.json. Run Install to update the lock.',
    });
    expect(lockMatchesManifest(lock, { ...manifest, devDependencies: { typescript: '^5' } })?.code).toBe('lock-stale');
    expect(lockMatchesManifest(lock, { ...manifest, dependencies: { 'd3-shape': '^3' } })?.code).toBe('lock-stale');
  });
});
