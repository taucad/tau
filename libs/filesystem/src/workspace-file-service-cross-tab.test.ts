// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import { ChangeEventBus } from '#change-event-bus.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import type { ChangeEvent, FileSystemProvider, WatchEvent } from '#types.js';
import { WorkspaceFileService } from '#workspace-file-service.js';

type Authority = {
  service: WorkspaceFileService;
  provider: FileSystemProvider;
  registry: ProviderRegistry;
  eventBus: ChangeEventBus;
};

const activeAuthorities: Authority[] = [];
let databaseSequence = 0;

const createAuthority = async (databasePrefix: string, options?: { disableChannel?: boolean }): Promise<Authority> => {
  const registry = new ProviderRegistry({ databasePrefix });
  const scope = { backend: 'indexeddb' } as const;
  const provider = await registry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, {
    backend: 'indexeddb',
    storageRootKey: registry.resolveStorageRootKey(scope),
  });
  const eventBus = new ChangeEventBus();
  const coordinator = new CrossTabCoordinator();
  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus,
    crossTabCoordinator: coordinator,
    mountTable,
  });
  if (options?.disableChannel === true) {
    coordinator.dispose();
  }
  const authority = { service, provider, registry, eventBus };
  activeAuthorities.push(authority);
  return authority;
};

afterEach(() => {
  for (const { service } of activeAuthorities.splice(0)) {
    service.dispose();
  }
});

describe('WorkspaceFileService cross-tab authority delivery', () => {
  it('refreshes stale DirectIDB admission state under the mutation lock even without channel delivery', async () => {
    const databasePrefix = `stale-admission-${databaseSequence++}`;
    const stale = await createAuthority(databasePrefix, { disableChannel: true });
    const writer = await createAuthority(databasePrefix, { disableChannel: true });
    await writer.service.writeFile('/collision/child.txt', 'child');

    await expect(stale.service.writeFile('/collision', 'invalid file')).rejects.toMatchObject({ code: 'EISDIR' });
    await stale.service.writeFile('/source.txt', 'source');
    await writer.provider.refresh?.();
    await writer.provider.mkdir('target');
    await expect(stale.service.move('/source.txt', '/target')).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(stale.service.readFile('/source.txt', 'utf8')).resolves.toBe('source');

    const verifier = await createAuthority(databasePrefix, { disableChannel: true });
    await expect(verifier.service.stat('/collision')).resolves.toMatchObject({ type: 'dir' });
    await expect(verifier.service.readFile('/collision/child.txt', 'utf8')).resolves.toBe('child');
  });

  it('ignores an unowned remote identity without constructing a provider', async () => {
    const reader = await createAuthority(`unowned-remote-${databaseSequence++}`);
    const getProvider = vi.spyOn(reader.registry, 'getProvider');
    const rawEvents: ChangeEvent[] = [];
    const stop = reader.eventBus.subscribe((event) => rawEvents.push(event));
    const sender = new BroadcastChannel('tau-fs-changes');
    try {
      sender.postMessage({
        type: 'write',
        path: '/foreign.txt',
        authority: { storageRootKey: 'indexeddb:not-owned', providerBasePath: '' },
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(getProvider).not.toHaveBeenCalled();
      expect(rawEvents).toEqual([]);
    } finally {
      sender.close();
      stop();
    }
  });

  it('applies remote facts in arrival order after refreshing an already-owned provider', async () => {
    const databasePrefix = `ordered-remote-${databaseSequence++}`;
    const writer = await createAuthority(databasePrefix);
    const reader = await createAuthority(databasePrefix);
    const originalRefresh = reader.provider.refresh!.bind(reader.provider);
    const firstRefreshStarted = Promise.withResolvers<void>();
    const releaseFirstRefresh = Promise.withResolvers<void>();
    let refreshCount = 0;
    vi.spyOn(reader.provider, 'refresh').mockImplementation(async () => {
      refreshCount += 1;
      if (refreshCount === 1) {
        firstRefreshStarted.resolve();
        await releaseFirstRefresh.promise;
      }
      await originalRefresh();
    });
    const getProvider = vi.spyOn(reader.registry, 'getProvider');
    const events: WatchEvent[] = [];
    const stop = reader.service.watch({ paths: ['/'], recursive: true }, (event) => events.push(event));

    await writer.service.writeFile('/first.txt', 'first');
    await firstRefreshStarted.promise;
    await writer.service.writeFile('/second.txt', 'second');
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(refreshCount).toBe(1);
    releaseFirstRefresh.resolve();

    await vi.waitFor(() => {
      expect(events).toEqual([
        { type: 'change', path: '/first.txt' },
        { type: 'change', path: '/second.txt' },
      ]);
    });
    await expect(reader.service.readFile('/first.txt', 'utf8')).resolves.toBe('first');
    await expect(reader.service.readFile('/second.txt', 'utf8')).resolves.toBe('second');
    expect(getProvider).not.toHaveBeenCalled();
    stop();
  });

  it('turns refresh failure into one global reset and continues with the next remote fact', async () => {
    const databasePrefix = `failed-remote-${databaseSequence++}`;
    const writer = await createAuthority(databasePrefix);
    const reader = await createAuthority(databasePrefix);
    const originalRefresh = reader.provider.refresh!.bind(reader.provider);
    vi.spyOn(reader.provider, 'refresh')
      .mockRejectedValueOnce(new Error('injected refresh failure'))
      .mockImplementation(originalRefresh);
    const rawEvents: ChangeEvent[] = [];
    const stopRaw = reader.eventBus.subscribe((event) => rawEvents.push(event));
    const watchEvents: WatchEvent[] = [];
    const stopWatch = reader.service.watch({ paths: ['/'], recursive: true }, (event) => watchEvents.push(event));

    await writer.service.writeFile('/failed.txt', 'failed refresh');
    await vi.waitFor(() => {
      expect(watchEvents).toEqual([{ type: 'reset' }]);
    });
    expect(rawEvents).toContainEqual({ type: 'backendChanged', backend: 'indexeddb' });

    await writer.service.writeFile('/recovered.txt', 'recovered');
    await vi.waitFor(() => {
      expect(watchEvents).toEqual([{ type: 'reset' }, { type: 'change', path: '/recovered.txt' }]);
    });
    await expect(reader.service.readFile('/recovered.txt', 'utf8')).resolves.toBe('recovered');
    stopRaw();
    stopWatch();
  });

  it('refreshes a sibling physical projects listing after permanent deletion', async () => {
    const databasePrefix = `permanent-delete-${databaseSequence++}`;
    const writer = await createAuthority(databasePrefix);
    const projectId = 'proj_zzzzzzzzzzzzzzzzzzzzz';
    const directoryName = 'delete-me';
    const directory = directoryName;
    await writer.provider.mkdir(directory, { recursive: true });
    await writer.provider.writeFile(
      `${directory}/tau.json`,
      serializeProjectManifest(
        projectToManifest({
          id: projectId,
          name: 'Delete Me',
          description: '',
          tags: [],
          assets: { main: { entryPath: 'main.ts' } },
        }),
      ),
    );
    await writer.provider.writeFile(`${directory}/main.ts`, new TextEncoder().encode('export default {};'));

    const reader = await createAuthority(databasePrefix);
    await expect(reader.service.readdir('/')).resolves.toContain(directoryName);
    const watchEvents: WatchEvent[] = [];
    const stop = reader.service.watch({ paths: ['/'], recursive: true }, (event) => watchEvents.push(event));

    await expect(
      writer.service.permanentlyDeleteProjectDirectory({
        projectId,
        providerBasePath: directory,
        scope: { backend: 'indexeddb' },
      }),
    ).resolves.toEqual({ status: 'deleted' });

    await vi.waitFor(() => {
      expect(watchEvents).toContainEqual({ type: 'reset' });
    });
    await vi.waitFor(async () => {
      await expect(reader.service.readdir('/')).resolves.not.toContain(directoryName);
    });
    stop();
  });
});
