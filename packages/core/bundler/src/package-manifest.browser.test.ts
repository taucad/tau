import { expect, it } from 'vitest';
import {
  ChangeEventBus,
  CrossTabCoordinator,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  WorkspaceFileService,
} from '@taucad/filesystem';

import { createPackageManifestCommit, updatePackageManifest } from '@taucad/bundler-core';

it('should atomically commit against real IndexedDB and Web Locks across independent authorities', async () => {
  const databasePrefix = `package-browser-${crypto.randomUUID()}`;
  const open = async () => {
    const registry = new ProviderRegistry({ databasePrefix });
    const scope = { backend: 'indexeddb' } as const;
    const provider = await registry.getProvider(scope);
    const mountTable = new MountTable();
    mountTable.mount('/', provider, {
      class: 'authored',
      backend: 'indexeddb',
      storageRootKey: registry.resolveStorageRootKey(scope),
    });
    const eventBus = new ChangeEventBus();
    const coordinator = new CrossTabCoordinator();
    const service = new WorkspaceFileService({
      providerRegistry: registry,
      mountTable,
      eventBus,
      resourceQueue: new ResourceQueue(),
      crossTabCoordinator: coordinator,
    });
    return { registry, provider, service, coordinator, root: service.createRootedFileSystem('/') };
  };
  const first = await open();
  const second = await open();
  const { signal } = new AbortController();
  try {
    const filesystem = {
      exists: first.root.exists.bind(first.root),
      readFile: first.root.readFile.bind(first.root),
      writeFile: first.root.writeFile.bind(first.root),
      ensureDir: async (path: string) => first.root.mkdir(path, { recursive: true }),
    };
    const commit = createPackageManifestCommit({ authority: first.root, signal });
    const lock = await updatePackageManifest({
      filesystem,
      commit,
      signal,
      requests: {},
      mode: 'install',
      nodeVersion: '24.0.0',
    });
    const content = await first.root.readFile('package.json', 'utf8');
    expect(JSON.parse(content)).toEqual({ dependencies: {}, taucadPackageLock: lock });
    const secondCommit = createPackageManifestCommit({ authority: second.root, signal });
    const outcomes = await Promise.all([
      commit({ expected: content, content: 'first' }),
      secondCommit({ expected: content, content: 'second' }),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(['first', 'second']).toContain(await first.root.readFile('package.json', 'utf8'));
  } finally {
    first.service.dispose();
    second.service.dispose();
    first.coordinator.dispose();
    second.coordinator.dispose();
    first.provider.dispose();
    second.provider.dispose();
  }
});
