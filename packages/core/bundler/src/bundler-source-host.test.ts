import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBundlerSourceHost } from '#bundler-source-host.js';
import type { BundlerSourceResolution, BundlerSourceSession } from '#bundler-source-host.js';
import { createTestFileSystem } from '#testing.fixture.js';

afterEach(() => vi.unstubAllGlobals());

const manifest = (name: string, version: string, fields: Record<string, unknown> = {}): string =>
  JSON.stringify({ name, version, ...fields });

/** A materialised tree: two copies of `dup`, an ESM `exports` package and a CJS `main` package. */
const installedFiles: Readonly<Record<string, string>> = {
  'node_modules/esm-pkg/package.json': manifest('esm-pkg', '1.0.0', {
    type: 'module',
    exports: { '.': { require: './dist/index.cjs', import: './dist/index.js' }, './sub': './dist/sub.js' },
    imports: { '#internal': './dist/internal.js' },
  }),
  'node_modules/esm-pkg/dist/index.js':
    "import { helper } from './helper';\nimport { internal } from '#internal';\nexport const esm = helper + internal;",
  'node_modules/esm-pkg/dist/helper.js': 'export const helper = 1;',
  'node_modules/esm-pkg/dist/internal.js': 'export const internal = 10;',
  'node_modules/esm-pkg/dist/sub.js': "export const sub = 'sub';",
  'node_modules/cjs-pkg/package.json': manifest('cjs-pkg', '2.0.0', {
    main: 'lib/main.js',
    dependencies: { dup: '^2.0.0' },
  }),
  'node_modules/cjs-pkg/lib/main.js':
    "const util = require('./util');\nmodule.exports = { cjs: util.value, dup: require('dup') };",
  'node_modules/cjs-pkg/lib/util.js': 'exports.value = 2;',
  'node_modules/cjs-pkg/node_modules/dup/package.json': manifest('dup', '2.0.0'),
  'node_modules/cjs-pkg/node_modules/dup/index.js': "module.exports = '2.0.0';",
  'node_modules/dup/package.json': manifest('dup', '1.0.0'),
  'node_modules/dup/index.js': "module.exports = '1.0.0';",
};

const rootDependencies = { 'cjs-pkg': '^2.0.0', dup: '^1.0.0', 'esm-pkg': '^1.0.0' };

/** Project files plus package.json and a package-lock.json whose rows mirror the installed tree. */
const lockedProject = (
  files: Readonly<Record<string, string>>,
  options: {
    readonly manifestDependencies?: Record<string, string>;
    readonly lockDependencies?: Record<string, string>;
  } = {},
): Readonly<Record<string, string>> => {
  const lockDependencies = options.lockDependencies ?? rootDependencies;
  const rows = Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => /^node_modules\/(?:.+\/)?package\.json$/u.test(path))
      .map(([path, text]) => [
        path.slice(0, -'/package.json'.length),
        {
          version: (JSON.parse(text) as { version: string }).version,
          resolved: 'https://example.test/x.tgz',
          integrity: 'sha512-x',
        },
      ]),
  );
  return {
    'package.json': JSON.stringify({ name: 'model', dependencies: options.manifestDependencies ?? lockDependencies }),
    'package-lock.json': JSON.stringify({
      name: 'model',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'model', dependencies: lockDependencies }, ...rows },
    }),
    ...files,
  };
};

const messageOf = (resolution: BundlerSourceResolution): string =>
  resolution.kind === 'unsupported' ? resolution.message : '';

const bundleSession = (files: Readonly<Record<string, string>>, entryPath = 'src/main.ts'): BundlerSourceSession =>
  createBundlerSourceHost({ filesystem: createTestFileSystem(files) }).beginSession({
    mode: 'bundle',
    signal: new AbortController().signal,
    entryPath,
  });

describe('createBundlerSourceHost', () => {
  it('resolves, probes, loads, and observes an operation independently', async () => {
    const host = createBundlerSourceHost({
      filesystem: createTestFileSystem({
        'src/main.ts': "import { value } from './value.js';\nconst main = () => value;",
        'src/value.ts': 'export const value = 42;',
      }),
      autoExportNames: ['main'],
    });
    const session = host.beginSession({
      mode: 'bundle',
      signal: new AbortController().signal,
      entryPath: 'src/main.ts',
    });
    const entry = await session.resolve({ specifier: 'src/main.ts' });
    const entrySource = await session.load(entry);
    const dependency = await session.resolve({ specifier: './value.js', importer: 'src/main.ts' });
    await session.load(dependency);

    expect(entrySource.text).toContain('export { main }');
    expect(dependency).toMatchObject({ kind: 'project', path: 'src/value.ts' });
    expect(session.complete()).toEqual({
      dependencies: ['src/main.ts', 'src/value.ts'],
      detectedModules: [],
      unresolvedPaths: [],
      issues: [],
    });
    expect(() => session.complete()).toThrow('already completed');

    const next = host.beginSession({ mode: 'detect', signal: new AbortController().signal, entryPath: 'src/main.ts' });
    await next.resolve({ specifier: 'replicad', importer: 'src/main.ts' });
    expect(next.complete()).toEqual({
      dependencies: [],
      detectedModules: ['replicad'],
      unresolvedPaths: [],
      issues: [],
    });
  });

  it('rejects paths that escape the virtual root', async () => {
    const host = createBundlerSourceHost({ filesystem: createTestFileSystem({ 'main.ts': '' }) });
    const session = host.beginSession({ mode: 'bundle', signal: new AbortController().signal, entryPath: 'main.ts' });
    await expect(session.resolve({ specifier: '../../secret.ts', importer: 'main.ts' })).rejects.toThrow('escapes');
  });

  it('probes a directory import to its index file on real filesystem semantics', async () => {
    const base = createTestFileSystem({ 'lib/features/index.ts': 'export const value = 1;' });
    const host = createBundlerSourceHost({
      filesystem: {
        ...base,
        exists: async (path) => path === 'lib/features' || base.exists(path),
        stat: async (path) => ({ type: path === 'lib/features' ? 'dir' : 'file' }),
      },
    });
    const session = host.beginSession({
      mode: 'bundle',
      signal: new AbortController().signal,
      entryPath: 'main.ts',
    });

    await expect(session.resolve({ specifier: '/lib/features' })).resolves.toMatchObject({
      kind: 'project',
      path: 'lib/features/index.ts',
    });
  });

  it('uses operation-local cancellation', async () => {
    const controller = new AbortController();
    const host = createBundlerSourceHost({ filesystem: createTestFileSystem({ 'main.ts': '' }) });
    const aborted = host.beginSession({ mode: 'bundle', signal: controller.signal, entryPath: 'main.ts' });
    controller.abort();
    await expect(aborted.resolve({ specifier: 'main.ts' })).rejects.toThrow();

    const successor = host.beginSession({
      mode: 'bundle',
      signal: new AbortController().signal,
      entryPath: 'main.ts',
    });
    await expect(successor.resolve({ specifier: 'main.ts' })).resolves.toMatchObject({ kind: 'project' });
  });

  describe('with package-lock.json', () => {
    it('resolves a locked ESM package through exports, relative probing and its own #imports', async () => {
      const session = bundleSession(lockedProject({ 'src/main.ts': 'export const main = 1;', ...installedFiles }));

      const entry = await session.resolve({ specifier: 'esm-pkg', importer: 'src/main.ts' });
      expect(entry).toEqual({
        kind: 'package',
        id: 'node_modules/esm-pkg/dist/index.js',
        path: 'node_modules/esm-pkg/dist/index.js',
        name: 'esm-pkg',
        version: '1.0.0',
        intent: 'script',
      });
      await expect(session.load(entry)).resolves.toEqual({
        id: 'node_modules/esm-pkg/dist/index.js',
        text: installedFiles['node_modules/esm-pkg/dist/index.js'],
        intent: 'script',
        resolveDirectory: 'node_modules/esm-pkg/dist',
      });
      await expect(session.resolve({ specifier: './helper', importer: entry.id })).resolves.toMatchObject({
        kind: 'package',
        path: 'node_modules/esm-pkg/dist/helper.js',
        name: 'esm-pkg',
      });
      await expect(session.resolve({ specifier: '#internal', importer: entry.id })).resolves.toMatchObject({
        kind: 'package',
        path: 'node_modules/esm-pkg/dist/internal.js',
      });
      await expect(session.resolve({ specifier: 'esm-pkg/sub', importer: 'src/main.ts' })).resolves.toMatchObject({
        kind: 'package',
        path: 'node_modules/esm-pkg/dist/sub.js',
      });
      const hidden = await session.resolve({ specifier: 'esm-pkg/hidden', importer: 'src/main.ts' });
      expect(messageOf(hidden)).toContain("'esm-pkg/hidden' is not exported by esm-pkg@1.0.0");
      expect(session.complete()).toEqual({
        dependencies: [
          'node_modules/esm-pkg/dist/helper.js',
          'node_modules/esm-pkg/dist/index.js',
          'node_modules/esm-pkg/dist/internal.js',
          'node_modules/esm-pkg/dist/sub.js',
          'package-lock.json',
          'package.json',
        ],
        detectedModules: [],
        unresolvedPaths: [],
        issues: [],
      });
    });

    it('resolves a CJS main package and the nearest of two installed versions', async () => {
      const session = bundleSession(lockedProject({ 'src/main.ts': '', ...installedFiles }));

      const main = await session.resolve({ specifier: 'cjs-pkg', importer: 'src/main.ts' });
      expect(main).toMatchObject({ kind: 'package', path: 'node_modules/cjs-pkg/lib/main.js', version: '2.0.0' });
      await expect(session.resolve({ specifier: './util', importer: main.id })).resolves.toMatchObject({
        kind: 'package',
        path: 'node_modules/cjs-pkg/lib/util.js',
        name: 'cjs-pkg',
      });
      await expect(session.resolve({ specifier: 'dup', importer: main.id })).resolves.toMatchObject({
        path: 'node_modules/cjs-pkg/node_modules/dup/index.js',
        version: '2.0.0',
      });
      await expect(session.resolve({ specifier: 'dup', importer: 'src/main.ts' })).resolves.toMatchObject({
        path: 'node_modules/dup/index.js',
        version: '1.0.0',
      });
    });

    it('fails only the import of a package that is not installed, without network or writes (I4, I6)', async () => {
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', fetchMock);
      const filesystem = createTestFileSystem(
        lockedProject(
          { 'src/main.ts': '', 'src/value.ts': '', ...installedFiles },
          { lockDependencies: { ...rootDependencies, absent: '^1.0.0' } },
        ),
      );
      const writeFile = vi.spyOn(filesystem, 'writeFile');
      const session = createBundlerSourceHost({ filesystem }).beginSession({
        mode: 'bundle',
        signal: new AbortController().signal,
        entryPath: 'src/main.ts',
      });

      const missing = await session.resolve({ specifier: 'absent', importer: 'src/main.ts' });
      expect(missing).toMatchObject({ kind: 'unsupported', issue: { code: 'package-not-installed', name: 'absent' } });
      expect(messageOf(missing)).toMatch(/^package-not-installed: Package 'absent' is not installed/u);
      await expect(session.resolve({ specifier: './value.js', importer: 'src/main.ts' })).resolves.toMatchObject({
        kind: 'project',
        path: 'src/value.ts',
      });
      await expect(session.resolve({ specifier: 'esm-pkg', importer: 'src/main.ts' })).resolves.toMatchObject({
        kind: 'package',
      });
      expect(session.complete().unresolvedPaths).toEqual(['node_modules/absent/package.json']);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('fails every bare import with lock-stale when package.json no longer matches the lock', async () => {
      const session = bundleSession(
        lockedProject(
          { 'src/main.ts': '', 'src/value.ts': '', ...installedFiles },
          { manifestDependencies: { ...rootDependencies, added: '^1.0.0' } },
        ),
      );

      for (const specifier of ['esm-pkg', 'dup']) {
        // oxlint-disable-next-line no-await-in-loop -- each import is refused independently
        const refused = await session.resolve({ specifier, importer: 'src/main.ts' });
        expect(refused).toMatchObject({ kind: 'unsupported', issue: { code: 'lock-stale' } });
        expect(messageOf(refused)).toMatch(/^lock-stale: /u);
      }
      await expect(session.resolve({ specifier: './value.js', importer: 'src/main.ts' })).resolves.toMatchObject({
        kind: 'project',
      });
    });

    it('lets builtins shadow installed packages', async () => {
      const host = createBundlerSourceHost({
        filesystem: createTestFileSystem(lockedProject({ 'src/main.ts': '', ...installedFiles })),
      });
      host.registerBuiltin({ name: 'esm-pkg', module: { code: 'export {};', version: '9.9.9' } });
      const session = host.beginSession({
        mode: 'bundle',
        signal: new AbortController().signal,
        entryPath: 'src/main.ts',
      });
      await expect(session.resolve({ specifier: 'esm-pkg', importer: 'src/main.ts' })).resolves.toMatchObject({
        kind: 'builtin',
      });
    });
    it('warns once when the lock names another version of a builtin package than Tau runs', async () => {
      const host = createBundlerSourceHost({
        filesystem: createTestFileSystem(lockedProject({ 'src/main.ts': '', ...installedFiles })),
      });
      host.registerBuiltin({
        name: 'esm-pkg',
        module: { code: 'export {};', version: '2.0.0', package: { name: 'esm-pkg', spec: '2.0.0' } },
      });
      host.registerBuiltin({
        name: 'dup',
        module: { code: 'export {};', version: '1.0.0', package: { name: 'dup', spec: '1.0.0' } },
      });
      const session = host.beginSession({
        mode: 'bundle',
        signal: new AbortController().signal,
        entryPath: 'src/main.ts',
      });
      for (const specifier of ['esm-pkg', 'esm-pkg', 'dup']) {
        // oxlint-disable-next-line no-await-in-loop -- resolution order is part of the assertion
        await expect(session.resolve({ specifier, importer: 'src/main.ts' })).resolves.toMatchObject({
          kind: 'builtin',
        });
      }
      expect(session.complete().issues).toEqual([
        {
          code: 'package-version-mismatch',
          name: 'esm-pkg',
          path: 'node_modules/esm-pkg',
          message:
            'package-lock.json has esm-pkg@1.0.0 but Tau runs 2.0.0. Set "esm-pkg": "2.0.0" in package.json dependencies and run Install so the lock matches the kernel.',
        },
      ]);
    });
  });

  describe('private imports in project files', () => {
    it('refuses # imports unless package.json declares imports', async () => {
      await expect(
        bundleSession({ 'src/main.ts': '', 'package.json': '{}' }).resolve({
          specifier: '#lib',
          importer: 'src/main.ts',
        }),
      ).resolves.toMatchObject({ kind: 'unsupported', message: "Private package import '#lib' is not supported." });

      const session = bundleSession({
        'src/main.ts': '',
        'src/lib.ts': '',
        'package.json': JSON.stringify({ imports: { '#lib': './src/lib.ts' } }),
      });
      await expect(session.resolve({ specifier: '#lib', importer: 'src/main.ts' })).resolves.toMatchObject({
        kind: 'project',
        path: 'src/lib.ts',
      });
    });
  });

  describe('without package-lock.json', () => {
    it('keeps the CDN path, ignores taucadPackageLock and reports package-not-locked once per package', async () => {
      const fetchMock = vi.fn(async () => new Response('/* d3-shape@3.2.0 */ export const arc = 1;'));
      vi.stubGlobal('fetch', fetchMock);
      const session = bundleSession({
        'src/main.ts': '',
        'package.json': JSON.stringify({
          dependencies: { 'd3-shape': '^3.2.0' },
          taucadPackageLock: { schemaVersion: 1, packages: {} },
        }),
      });

      const resolution = await session.resolve({ specifier: 'd3-shape', importer: 'src/main.ts' });
      expect(resolution).toMatchObject({ kind: 'package', name: 'd3-shape', version: '3.2.0' });
      await expect(session.load(resolution)).resolves.toMatchObject({
        text: '/* d3-shape@3.2.0 */ export const arc = 1;',
      });
      await session.resolve({ specifier: 'd3-shape', importer: 'src/main.ts' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const observation = session.complete();
      expect(observation).toMatchObject({
        dependencies: [],
        issues: [{ code: 'package-not-locked', name: 'd3-shape' }],
      });
      expect(observation.issues[0]?.message).toContain('Run Install');
    });
  });
});
