// @vitest-environment node
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
import { describe, expect, it, vi } from 'vitest';
import {
  ChangeEventBus,
  CrossTabCoordinator,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  WorkspaceFileService,
} from '@taucad/filesystem';
import { createFileSystemBridgePort, createFileSystemBridgeProxy } from '@taucad/fs-bridge';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import { createWorkbenchViewStore } from '#workbench-records/view-store.js';
import { deleteViewFile, ensureViewFile } from '#workbench-records/view-actions.js';

// These UI composition hooks are unused by the real record commands exercised below.
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: vi.fn() }));
vi.mock('#hooks/use-project.js', () => ({ useProject: vi.fn() }));

const seed = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'main.cs', name: 'Original' });
const { serialize } = workbenchRecords.view;
const root = 'project';
const viewId = 'v-bridge';
const path = `${root}/${workbenchPaths.view(viewId)}`;

/** Real authority and ports; only the platform LockManager is supplied by the fixture. */
const authority = async () => {
  const tails = new Map<string, Promise<void>>();
  vi.stubGlobal('navigator', {
    locks: {
      request: async (name: string, _options: LockOptions, operation: () => Promise<unknown>) => {
        const predecessor = tails.get(name) ?? Promise.resolve();
        const settled = Promise.withResolvers<void>();
        tails.set(name, settled.promise);
        await predecessor;
        try {
          return await operation();
        } finally {
          settled.resolve();
        }
      },
    },
  });
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:view-record-bridge' } as const;
  const provider = await providerRegistry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', ...scope });
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    crossTabCoordinator: new CrossTabCoordinator(),
    mountTable,
  });
  const filesystem = service.createRootedFileSystem('/');
  await filesystem.writeFile(path, serialize(seed));
  const connections: Array<ReturnType<typeof createFileSystemBridgePort>> = [];
  const proxies: Array<ReturnType<typeof createFileSystemBridgeProxy>> = [];
  const connect = async () => {
    const connection = createFileSystemBridgePort(filesystem);
    connections.push(connection);
    const proxy = createFileSystemBridgeProxy(connection);
    proxies.push(proxy);
    await proxy.ready;
    return { proxy, connection };
  };
  let active = await connect();
  const files = {
    exists: async (target: string) => active.proxy.exists(target),
    readFile: async (target: string) => active.proxy.readFile(target),
    writeFileChecked: async (input: Parameters<typeof filesystem.writeFileChecked>[0]) =>
      active.proxy.writeFileChecked(input),
    deleteFileChecked: async (input: Parameters<typeof filesystem.deleteFileChecked>[0]) =>
      active.proxy.deleteFileChecked(input),
  };
  const store = createWorkbenchViewStore({
    root,
    viewId,
    files,
    onChange: () => undefined,
    onError: () => undefined,
    editDebounce: 0,
  });
  expect(await store.read()).toBe(true);
  return {
    store,
    files,
    provider,
    filesystem,
    replace: async () => {
      active.connection.dispose();
      active = await connect();
    },
    dispose: () => {
      store.dispose();
      for (const proxy of proxies) {
        proxy.dispose();
      }
      for (const connection of connections) {
        connection.dispose();
      }
      service.dispose();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
};

describe('view records across real authority connection replacement', () => {
  it.each(['before-apply', 'after-apply'] as const)(
    'should retain newer intent when connection loss occurs %s',
    async (phase) => {
      const fixture = await authority();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const original = phase === 'before-apply' ? fixture.provider.writeFile.bind(fixture.provider) : undefined;
      const write = fixture.filesystem.writeFileChecked.bind(fixture.filesystem);
      if (original) {
        vi.spyOn(fixture.provider, 'writeFile').mockImplementationOnce(async (target, data) => {
          entered.resolve();
          await release.promise;
          await original(target, data);
        });
      } else {
        vi.spyOn(fixture.filesystem, 'writeFileChecked').mockImplementationOnce(async (input) => {
          const result = await write(input);
          entered.resolve();
          await release.promise;
          return result;
        });
      }
      try {
        const first = fixture.store.edit({ ...seed, name: 'Older edit' });
        await entered.promise;
        await fixture.replace();
        expect(await first).toBe(false);
        expect(fixture.store.health().unconfirmed).toBe(true);
        const newer = fixture.store.edit({ ...seed, name: 'Newest edit', fieldOfView: 63 });
        if (phase === 'after-apply') {
          // The replacement settles before the obsolete reply is released.
          expect(await newer).toBe(true);
        }
        release.resolve();
        await newer;
        expect(await fixture.store.flush()).toBe(true);
        expect(workbenchRecords.view.read(await fixture.filesystem.readFile(path))).toMatchObject({
          status: 'current',
          record: { name: 'Newest edit', fieldOfView: 63 },
        });
        expect(fixture.store.health().unconfirmed).toBe(false);
      } finally {
        release.resolve();
        fixture.dispose();
      }
    },
  );

  it.each([false, true])(
    'should fence a disconnected late write across view deletion and reopen=%s',
    async (reopen) => {
      const fixture = await authority();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const write = fixture.provider.writeFile.bind(fixture.provider);
      vi.spyOn(fixture.provider, 'writeFile').mockImplementationOnce(async (target, data) => {
        entered.resolve();
        await release.promise;
        await write(target, data);
      });
      try {
        const first = fixture.store.edit({ ...seed, name: 'Obsolete edit' });
        await entered.promise;
        await fixture.replace();
        expect(await first).toBe(false);
        let closed = false;
        const closing = (async () => {
          const result = await deleteViewFile({ root, viewId, files: fixture.files, onError: () => undefined });
          closed = result;
          return result;
        })();
        await Promise.resolve();
        expect(closed).toBe(false);
        release.resolve();
        expect(await closing).toBe(true);
        expect(await fixture.filesystem.exists(path)).toBe(false);
        if (reopen) {
          expect(
            await ensureViewFile({
              root,
              viewId,
              files: fixture.files,
              seed,
              eligible: () => true,
              onError: () => undefined,
            }),
          ).toBe(true);
          expect(await fixture.store.edit({ ...seed, name: 'Retired owner' })).toBe(false);
          expect(await fixture.filesystem.readFile(path, 'utf8')).toBe(serialize(seed));
        } else {
          expect(await fixture.store.flush()).toBe(false);
          expect(await fixture.filesystem.exists(path)).toBe(false);
        }
      } finally {
        release.resolve();
        fixture.dispose();
      }
    },
  );

  it('should merge a newer edit with an external field after absent-file ABA and a lost applied reply', async () => {
    const fixture = await authority();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const write = fixture.filesystem.writeFileChecked.bind(fixture.filesystem);
    vi.spyOn(fixture.filesystem, 'writeFileChecked').mockImplementationOnce(async (input) => {
      const result = await write(input);
      entered.resolve();
      await release.promise;
      return result;
    });
    try {
      const first = fixture.store.edit({ ...seed, name: 'Older edit' });
      await entered.promise;
      await fixture.replace();
      expect(await first).toBe(false);
      const observed = await fixture.filesystem.readFile(path);
      await fixture.filesystem.deleteFileChecked({ path, preconditions: [{ path, expected: observed }] });
      await fixture.filesystem.writeFileChecked({ path, data: observed, preconditions: [{ path, expected: null }] });
      await fixture.filesystem.writeFile(path, serialize({ ...seed, name: 'Older edit', fieldOfView: 71 }));
      expect(await fixture.store.read()).toBe(true);
      expect(fixture.store.health().unconfirmed).toBe(true);
      expect(await fixture.store.edit({ ...fixture.store.snapshot().record!, name: 'Newest edit' })).toBe(true);
      release.resolve();
      expect(await fixture.store.flush()).toBe(true);
      expect(workbenchRecords.view.read(await fixture.filesystem.readFile(path))).toMatchObject({
        status: 'current',
        record: { name: 'Newest edit', fieldOfView: 71 },
      });
    } finally {
      release.resolve();
      fixture.dispose();
    }
  });
});
