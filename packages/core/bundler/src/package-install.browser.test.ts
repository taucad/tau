import { expect, it } from 'vitest';
import {
  ChangeEventBus,
  CrossTabCoordinator,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  WorkspaceFileService,
} from '@taucad/filesystem';

import { createPackageManifestCommit, installPackages, parsePackageLock } from '@taucad/bundler-core';
import type { PackageRegistry } from '@taucad/bundler-core';

const integrity = `sha512-${'A'.repeat(86)}==`;
const registry: PackageRegistry = async (name) =>
  name === 'example'
    ? {
        name,
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name,
            version: '1.0.0',
            dist: { tarball: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz', integrity },
          },
        },
      }
    : undefined;

it('should commit package.json then the lock against real IndexedDB and Web Locks, and fence a concurrent writer', async () => {
  const databasePrefix = `package-browser-${crypto.randomUUID()}`;
  const open = async () => {
    const providers = new ProviderRegistry({ databasePrefix });
    const scope = { backend: 'indexeddb' } as const;
    const provider = await providers.getProvider(scope);
    const mountTable = new MountTable();
    mountTable.mount('/', provider, {
      class: 'authored',
      backend: 'indexeddb',
      storageRootKey: providers.resolveStorageRootKey(scope),
    });
    const coordinator = new CrossTabCoordinator();
    const service = new WorkspaceFileService({
      providerRegistry: providers,
      mountTable,
      eventBus: new ChangeEventBus(),
      resourceQueue: new ResourceQueue(),
      crossTabCoordinator: coordinator,
    });
    return { provider, service, coordinator, root: service.createRootedFileSystem('/') };
  };
  const first = await open();
  const second = await open();
  const { signal } = new AbortController();
  try {
    await first.root.writeFile('package.json', '{\n  "name": "browser"\n}\n');
    const filesystem = {
      exists: first.root.exists.bind(first.root),
      readFile: first.root.readFile.bind(first.root),
      writeFile: first.root.writeFile.bind(first.root),
      ensureDir: async (path: string) => first.root.mkdir(path, { recursive: true }),
    };
    const commit = createPackageManifestCommit({ authority: first.root, signal });
    const result = await installPackages({
      filesystem,
      commit,
      mode: 'install',
      add: { example: '^1' },
      registry,
      signal,
    });
    expect(result).toMatchObject({ manifestChanged: true, lockChanged: true, issues: [] });
    const manifest = await first.root.readFile('package.json', 'utf8');
    expect(JSON.parse(manifest)).toEqual({ name: 'browser', dependencies: { example: '^1' } });
    const lockText = await first.root.readFile('package-lock.json', 'utf8');
    expect(parsePackageLock(lockText).packages['node_modules/example']?.version).toBe('1.0.0');

    const secondCommit = createPackageManifestCommit({ authority: second.root, signal });
    const outcomes = await Promise.all([
      commit({
        path: 'package-lock.json',
        expected: lockText,
        content: 'first',
        preconditions: [{ path: 'package.json', expected: manifest }],
      }),
      secondCommit({
        path: 'package-lock.json',
        expected: lockText,
        content: 'second',
        preconditions: [{ path: 'package.json', expected: manifest }],
      }),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(['first', 'second']).toContain(await first.root.readFile('package-lock.json', 'utf8'));
  } finally {
    first.service.dispose();
    second.service.dispose();
    first.coordinator.dispose();
    second.coordinator.dispose();
    first.provider.dispose();
    second.provider.dispose();
  }
});
