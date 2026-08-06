import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangeEventBus } from '#change-event-bus.js';
import { isEventGloballyVisible } from '#event-origin-registry.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import type { ProjectRootConfiguration } from '#mount-table.js';
import type { FileSystemProvider, WatchEvent } from '#types.js';
import { WorkspaceFileService } from '#workspace-file-service.js';

type ObserverRecord = {
  readonly type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored';
  readonly changedHandle?: FileSystemHandle;
  readonly relativePathComponents: readonly string[];
  readonly relativePathMovedFrom?: readonly string[];
};

type ObserverCallback = (records: readonly ObserverRecord[]) => void;

class TestFileSystemObserver {
  public static readonly instances: TestFileSystemObserver[] = [];
  public static observeHook: ((handle: FileSystemDirectoryHandle) => void | Promise<void>) | undefined;
  public readonly observe = vi.fn(async (handle: FileSystemDirectoryHandle) => {
    await TestFileSystemObserver.observeHook?.(handle);
  });
  public readonly disconnect = vi.fn();
  // oxlint-disable-next-line typescript/parameter-properties -- This package requires erasable TypeScript syntax.
  public readonly callback: ObserverCallback;

  public constructor(callback: ObserverCallback) {
    this.callback = callback;
    TestFileSystemObserver.instances.push(this);
  }
}

const fileHandle = (name: string): FileSystemFileHandle => {
  const handle = { kind: 'file', name };
  return handle as FileSystemFileHandle;
};

const alphaProjectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const betaProjectId = 'proj_bbbbbbbbbbbbbbbbbbbbb';
const alphaPhysicalRoot = '/projects/alpha-project';
const betaPhysicalRoot = '/projects/beta-project';

const activeServices: WorkspaceFileService[] = [];

const webAccessConfiguration = (
  directoryHandle: FileSystemDirectoryHandle,
  workspaceId: string,
): ProjectRootConfiguration => {
  const scope = { backend: 'webaccess', directoryHandle, workspaceId } as const;
  return {
    projects: [
      { ...scope, projectId: alphaProjectId, providerBasePath: alphaPhysicalRoot },
      { ...scope, projectId: betaProjectId, providerBasePath: betaPhysicalRoot },
    ],
    roots: [scope],
  };
};

afterEach(() => {
  for (const service of activeServices.splice(0)) {
    service.dispose();
  }
  TestFileSystemObserver.instances.length = 0;
  TestFileSystemObserver.observeHook = undefined;
  vi.unstubAllGlobals();
});

async function createWebAccessService(options?: {
  native?: boolean;
  awaitBootstrap?: boolean;
  beforeConfigure?: (input: {
    service: WorkspaceFileService;
    provider: FileSystemProvider;
    handle: ReturnType<typeof createMockRootHandle>;
  }) => void | Promise<void>;
}): Promise<{
  service: WorkspaceFileService;
  provider: FileSystemProvider;
  handle: ReturnType<typeof createMockRootHandle>;
  eventBus: ChangeEventBus;
  workspaceId: string;
}> {
  if (options?.native === true) {
    vi.stubGlobal('FileSystemObserver', TestFileSystemObserver);
  } else {
    vi.stubGlobal('FileSystemObserver', undefined);
  }
  const handle = createMockRootHandle();
  const directoryHandle = handle as unknown as FileSystemDirectoryHandle;
  const providerRegistry = new ProviderRegistry();
  const rootStorageRootKey = `memory:external-${crypto.randomUUID()}`;
  const rootProvider = await providerRegistry.getProvider({
    backend: 'memory',
    storageRootKey: rootStorageRootKey,
  });
  const mountTable = new MountTable();
  mountTable.mount('/', rootProvider, {
    backend: 'memory',
    storageRootKey: rootStorageRootKey,
  });
  const eventBus = new ChangeEventBus();
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });
  activeServices.push(service);
  const workspaceId = `wsp_${crypto.randomUUID()}`;
  const scope = { backend: 'webaccess', directoryHandle, workspaceId } as const;
  const provider = await providerRegistry.getProvider(scope);
  await provider.writeFile(`${alphaPhysicalRoot}/main.ts`, 'before');
  await provider.writeFile(`${betaPhysicalRoot}/main.ts`, 'beta');
  await options?.beforeConfigure?.({ service, provider, handle });
  await service.configureProjectRoots(webAccessConfiguration(directoryHandle, workspaceId));
  if (options?.awaitBootstrap !== false) {
    await service.pollExternalChanges();
  }
  return { service, provider, handle, eventBus, workspaceId };
}

describe('WorkspaceFileService external webaccess observation', () => {
  it('keeps native delivery live while the polling baseline scan is pending', async () => {
    const baselineStarted = Promise.withResolvers<void>();
    const releaseBaseline = Promise.withResolvers<void>();
    const events: WatchEvent[] = [];
    const { service, provider } = await createWebAccessService({
      native: true,
      awaitBootstrap: false,
      beforeConfigure: async ({ handle }) => {
        const projects = await handle.getDirectoryHandle('projects');
        const entries = projects.entries.bind(projects);
        vi.spyOn(projects, 'entries').mockImplementation(async function* () {
          baselineStarted.resolve();
          await releaseBaseline.promise;
          yield* entries();
        });
      },
    });

    const poll = service.pollExternalChanges();
    await baselineStarted.promise;
    expect(TestFileSystemObserver.instances).toHaveLength(1);
    service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/main.ts'] }, (event) => events.push(event));
    await provider.writeFile(`${alphaPhysicalRoot}/main.ts`, 'changed while polling');
    TestFileSystemObserver.instances[0]!.callback([
      {
        type: 'modified',
        changedHandle: fileHandle('main.ts'),
        relativePathComponents: ['projects', 'alpha-project', 'main.ts'],
      },
    ]);
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'change', path: '/main.ts' });
    });

    releaseBaseline.resolve();
    await poll;
  });

  it('polls mounted project contents without recursively crawling discovery-only projects', async () => {
    let unmountedEntries: ReturnType<typeof vi.spyOn>;
    await createWebAccessService({
      beforeConfigure: async ({ provider, handle }) => {
        await provider.writeFile('/projects/discovery-only/deep/file.ts', 'not routed');
        const projects = await handle.getDirectoryHandle('projects');
        const unmounted = await projects.getDirectoryHandle('discovery-only');
        unmountedEntries = vi.spyOn(unmounted, 'entries');
      },
    });

    expect(unmountedEntries?.mock.calls).toHaveLength(0);
  });

  it('retains one observer and provider across wrappers for the same directory entry', async () => {
    const { service, handle, workspaceId } = await createWebAccessService({ native: true });
    const observer = TestFileSystemObserver.instances[0]!;

    await service.configureProjectRoots(
      webAccessConfiguration(handle.clone() as unknown as FileSystemDirectoryHandle, workspaceId),
    );

    expect(TestFileSystemObserver.instances).toHaveLength(1);
    expect(observer.disconnect).not.toHaveBeenCalled();
    await expect(service.readFile(`/projects/${alphaProjectId}/main.ts`, 'utf8')).resolves.toBe('before');
  });

  it('replaces both provider and observer when a workspace id points at a different directory entry', async () => {
    const { service, workspaceId } = await createWebAccessService({ native: true });
    const observer = TestFileSystemObserver.instances[0]!;
    const replacementHandle = createMockRootHandle();
    const replacementProvider = new FileSystemAccessProvider(replacementHandle as unknown as FileSystemDirectoryHandle);
    await replacementProvider.writeFile(`${alphaPhysicalRoot}/main.ts`, 'replacement');
    await replacementProvider.writeFile(`${betaPhysicalRoot}/main.ts`, 'replacement beta');

    await service.configureProjectRoots(
      webAccessConfiguration(replacementHandle as unknown as FileSystemDirectoryHandle, workspaceId),
    );
    await service.pollExternalChanges();

    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(TestFileSystemObserver.instances).toHaveLength(2);
    await expect(service.readFile(`/projects/${alphaProjectId}/main.ts`, 'utf8')).resolves.toBe('replacement');
    const events: WatchEvent[] = [];
    service.watch({ paths: ['/projects'], recursive: true }, (event) => events.push(event));
    observer.callback([
      {
        type: 'modified',
        changedHandle: fileHandle('main.ts'),
        relativePathComponents: ['projects', 'alpha-project', 'main.ts'],
      },
    ]);
    await service.pollExternalChanges();
    expect(events).toEqual([]);
  });

  it('reconnects conservatively when directory-entry identity cannot be checked', async () => {
    const { service, handle, workspaceId } = await createWebAccessService({ native: true });
    const observer = TestFileSystemObserver.instances[0]!;
    vi.spyOn(handle, 'isSameEntry').mockRejectedValueOnce(new DOMException('revoked', 'NotAllowedError'));

    await service.configureProjectRoots(
      webAccessConfiguration(handle.clone() as unknown as FileSystemDirectoryHandle, workspaceId),
    );
    await service.pollExternalChanges();

    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(TestFileSystemObserver.instances).toHaveLength(2);
    await expect(service.readFile(`/projects/${alphaProjectId}/main.ts`, 'utf8')).resolves.toBe('before');
  });

  it('reconciles an edit made while native observation is being installed', async () => {
    const events: WatchEvent[] = [];
    TestFileSystemObserver.observeHook = async () => undefined;

    await createWebAccessService({
      native: true,
      beforeConfigure: ({ service, provider }) => {
        service.watch({ paths: [`/projects/${alphaProjectId}`], recursive: true }, (event) => events.push(event));
        TestFileSystemObserver.observeHook = async () => {
          await provider.writeFile(`${alphaPhysicalRoot}/main.ts`, 'changed during observer setup');
        };
      },
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every(({ type }) => type === 'reset')).toBe(true);
  });

  it('ignores a callback queued by an observer whose setup then rejects', async () => {
    const events: WatchEvent[] = [];
    let refresh: ReturnType<typeof vi.spyOn>;
    const { service } = await createWebAccessService({
      native: true,
      beforeConfigure: ({ service, provider }) => {
        refresh = vi.spyOn(provider, 'refresh');
        service.watch({ paths: ['/projects'], recursive: true }, (event) => events.push(event));
        TestFileSystemObserver.observeHook = () => {
          TestFileSystemObserver.instances[0]!.callback([
            {
              type: 'modified',
              changedHandle: fileHandle('main.ts'),
              relativePathComponents: ['projects', 'alpha-project', 'main.ts'],
            },
          ]);
          throw new DOMException('observer rejected', 'NotAllowedError');
        };
      },
    });

    await service.pollExternalChanges();
    expect(refresh).not.toHaveBeenCalled();
    events.length = 0;
    TestFileSystemObserver.instances[0]!.callback([
      {
        type: 'modified',
        changedHandle: fileHandle('main.ts'),
        relativePathComponents: ['projects', 'alpha-project', 'main.ts'],
      },
    ]);
    await service.pollExternalChanges();
    expect(events).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rejects split-brain project and discovery handles for one workspace id', async () => {
    vi.stubGlobal('FileSystemObserver', TestFileSystemObserver);
    const { service, handle, workspaceId } = await createWebAccessService({ native: true });
    const other = createMockRootHandle() as unknown as FileSystemDirectoryHandle;

    await expect(
      service.configureProjectRoots({
        projects: [
          {
            backend: 'webaccess',
            directoryHandle: other,
            workspaceId,
            projectId: alphaProjectId,
            providerBasePath: alphaPhysicalRoot,
          },
        ],
        roots: [{ backend: 'webaccess', directoryHandle: handle as unknown as FileSystemDirectoryHandle, workspaceId }],
      }),
    ).rejects.toThrow('resolves to different directories');
  });

  it('delivers a native out-of-band file edit to only the matching rooted watch', async () => {
    const { service, provider } = await createWebAccessService({ native: true });
    const refresh = vi.spyOn(provider, 'refresh');
    const alphaEvents: WatchEvent[] = [];
    const betaEvents: WatchEvent[] = [];
    const stopAlpha = service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/main.ts'] }, (event) => alphaEvents.push(event));
    const stopBeta = service
      .createRootedFileSystem(`/projects/${betaProjectId}`)
      .watch({ paths: ['/main.ts'] }, (event) => betaEvents.push(event));

    await provider.writeFile(`${alphaPhysicalRoot}/main.ts`, 'after');
    TestFileSystemObserver.instances[0]!.callback([
      {
        type: 'modified',
        changedHandle: fileHandle('main.ts'),
        relativePathComponents: ['projects', 'alpha-project', 'main.ts'],
      },
    ]);

    await vi.waitFor(() => {
      expect(alphaEvents).toContainEqual({ type: 'change', path: '/main.ts' });
    });
    expect(refresh).toHaveBeenCalledOnce();
    await expect(service.readFile(`/projects/${alphaProjectId}/main.ts`, 'utf8')).resolves.toBe('after');
    expect(betaEvents).toEqual([]);
    stopAlpha();
    stopBeta();
  });

  it('treats native moves as authority-scoped reset facts instead of guessing a rename', async () => {
    const { service, provider } = await createWebAccessService({ native: true });
    const events: WatchEvent[] = [];
    const stop = service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => events.push(event));

    await provider.rename(`${alphaPhysicalRoot}/main.ts`, `${alphaPhysicalRoot}/renamed.ts`);
    TestFileSystemObserver.instances[0]!.callback([
      {
        type: 'moved',
        changedHandle: fileHandle('renamed.ts'),
        relativePathComponents: ['projects', 'alpha-project', 'renamed.ts'],
        relativePathMovedFrom: ['projects', 'alpha-project', 'main.ts'],
      },
    ]);

    await vi.waitFor(() => {
      expect(events).toEqual([{ type: 'reset' }]);
    });
    stop();
  });

  it('publishes project discovery when a manifest moves away from its old path', async () => {
    const { provider, eventBus } = await createWebAccessService({ native: true });
    const events: unknown[] = [];
    eventBus.subscribe((event) => events.push(event));
    await provider.writeFile(`${alphaPhysicalRoot}/tau.json`, '{}');
    await provider.rename(`${alphaPhysicalRoot}/tau.json`, `${alphaPhysicalRoot}/tau.json.bak`);

    TestFileSystemObserver.instances[0]!.callback([
      {
        type: 'moved',
        changedHandle: fileHandle('tau.json.bak'),
        relativePathComponents: ['projects', 'alpha-project', 'tau.json.bak'],
        relativePathMovedFrom: ['projects', 'alpha-project', 'tau.json'],
      },
    ]);

    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'directoryChanged', path: '/projects', backend: 'webaccess' });
    });
  });

  it('does not fan an own-write swap-commit echo out as global project discovery', async () => {
    const { service, eventBus } = await createWebAccessService({ native: true });
    const rootedEvents: WatchEvent[] = [];
    const globalPaths: string[] = [];
    eventBus.subscribe((event) => {
      if ('path' in event) {
        globalPaths.push(event.path);
      }
    });
    const stop = service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => rootedEvents.push(event));

    TestFileSystemObserver.instances[0]!.callback([
      {
        type: 'moved',
        changedHandle: fileHandle('main.ts'),
        relativePathComponents: ['projects', 'alpha-project', 'main.ts'],
        relativePathMovedFrom: ['projects', 'alpha-project', 'main.ts.crswap'],
      },
    ]);

    await vi.waitFor(() => {
      expect(rootedEvents).toEqual([{ type: 'reset' }]);
    });
    expect(globalPaths).toContain(`/projects/${alphaProjectId}`);
    expect(globalPaths).not.toContain('/projects');
    stop();
  });

  it('disconnects removed roots and ignores callbacks from their old observer', async () => {
    const { service } = await createWebAccessService({ native: true });
    const observer = TestFileSystemObserver.instances[0]!;
    const events: WatchEvent[] = [];
    service.watch({ paths: ['/projects'], recursive: true }, (event) => events.push(event));

    await service.configureProjectRoots({ projects: [], roots: [] });
    expect(observer.disconnect).toHaveBeenCalledOnce();
    events.length = 0;
    observer.callback([
      {
        type: 'modified',
        changedHandle: fileHandle('main.ts'),
        relativePathComponents: ['projects', 'alpha-project', 'main.ts'],
      },
    ]);
    await Promise.resolve();
    expect(events).toEqual([]);
  });

  it('turns observer errors into resets and resumes through the polling fallback', async () => {
    const { service, provider, eventBus } = await createWebAccessService({ native: true });
    const refresh = vi.spyOn(provider, 'refresh');
    let refreshCountAtFirstFact = 0;
    let sawFirstFact = false;
    eventBus.subscribe(() => {
      if (!sawFirstFact) {
        sawFirstFact = true;
        refreshCountAtFirstFact = refresh.mock.calls.length;
      }
    });
    const observer = TestFileSystemObserver.instances[0]!;
    const events: WatchEvent[] = [];
    service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => events.push(event));

    observer.callback([
      {
        type: 'errored',
        relativePathComponents: [],
      },
    ]);
    await vi.waitFor(() => {
      expect(events).toEqual([{ type: 'reset' }]);
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(refreshCountAtFirstFact).toBe(1);
    expect(observer.disconnect).toHaveBeenCalledOnce();

    events.length = 0;
    await provider.writeFile(`${alphaPhysicalRoot}/after-error.ts`, 'new');
    await service.pollExternalChanges();
    expect(events).toEqual([{ type: 'reset' }]);
  });

  it('refreshes the provider before publishing a native-active first polling baseline', async () => {
    const { service, provider, eventBus } = await createWebAccessService({ native: true, awaitBootstrap: false });
    const refresh = vi.spyOn(provider, 'refresh');
    let refreshCountAtFirstFact = 0;
    eventBus.subscribe(() => {
      if (refreshCountAtFirstFact === 0) {
        refreshCountAtFirstFact = refresh.mock.calls.length;
      }
    });

    await service.pollExternalChanges();

    expect(refresh).toHaveBeenCalledOnce();
    expect(refreshCountAtFirstFact).toBe(1);
  });

  it('uses the safety poll to recover a silently missed native record', async () => {
    const { service, provider, eventBus } = await createWebAccessService({ native: true });
    const events: WatchEvent[] = [];
    const bridgeEvents: Array<{ event: unknown; globallyVisible: boolean }> = [];
    eventBus.subscribe((event) => bridgeEvents.push({ event, globallyVisible: isEventGloballyVisible(event) }));
    service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => events.push(event));

    await provider.writeFile(`${alphaPhysicalRoot}/main.ts`, 'missed native change');
    await service.pollExternalChanges();

    expect(events).toEqual([{ type: 'reset' }]);
    expect(bridgeEvents).toContainEqual({
      event: { type: 'directoryChanged', path: `/projects/${alphaProjectId}`, backend: 'webaccess' },
      globallyVisible: true,
    });
  });

  it('limits a rooted safety poll to that routed project', async () => {
    const { service, provider } = await createWebAccessService({ awaitBootstrap: false });
    const alphaEvents: WatchEvent[] = [];
    const betaEvents: WatchEvent[] = [];
    service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => alphaEvents.push(event));
    service
      .createRootedFileSystem(`/projects/${betaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => betaEvents.push(event));
    await service.pollExternalChanges(`/projects/${alphaProjectId}`);
    await service.pollExternalChanges(`/projects/${betaProjectId}`);

    await provider.writeFile(`${betaPhysicalRoot}/main.ts`, 'changed without native delivery');
    await service.pollExternalChanges(`/projects/${alphaProjectId}`);
    expect(alphaEvents).toEqual([]);
    expect(betaEvents).toEqual([]);

    await service.pollExternalChanges(`/projects/${betaProjectId}`);
    expect(alphaEvents).toEqual([]);
    expect(betaEvents).toEqual([{ type: 'reset' }]);
  });

  it('retries the same changed snapshot when provider refresh fails', async () => {
    const { service, provider } = await createWebAccessService({ native: true });
    const events: WatchEvent[] = [];
    service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => events.push(event));
    vi.spyOn(provider, 'refresh').mockRejectedValueOnce(new Error('refresh failed'));
    await provider.writeFile(`${alphaPhysicalRoot}/main.ts`, 'retry after refresh failure');

    await expect(service.pollExternalChanges()).rejects.toThrow('refresh failed');
    expect(events).toEqual([]);
    await service.pollExternalChanges();
    expect(events).toEqual([{ type: 'reset' }]);
  });

  it('reconciles unknown records immediately and advances the polling baseline', async () => {
    const { service, provider } = await createWebAccessService({ native: true });
    const events: WatchEvent[] = [];
    service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => events.push(event));
    await provider.writeFile(`${alphaPhysicalRoot}/main.ts`, 'unknown record changed bytes');

    TestFileSystemObserver.instances[0]!.callback([
      { type: 'unknown', relativePathComponents: ['projects', 'alpha-project'] },
    ]);
    await vi.waitFor(() => {
      expect(events).toEqual([{ type: 'reset' }]);
    });
    events.length = 0;
    await service.pollExternalChanges();
    expect(events).toEqual([]);
  });

  it('keeps unchanged native-active safety polls silent', async () => {
    const { service } = await createWebAccessService({ native: true });
    const events: WatchEvent[] = [];
    service.watch({ paths: ['/projects'], recursive: true }, (event) => events.push(event));

    await service.pollExternalChanges();

    expect(events).toEqual([]);
  });

  it('suppresses Chromium swap-only native and polling facts without hiding near misses', async () => {
    const { service, provider } = await createWebAccessService({ native: true });
    const refresh = vi.spyOn(provider, 'refresh');
    const events: WatchEvent[] = [];
    service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => events.push(event));

    await provider.writeFile(`${alphaPhysicalRoot}/main.ts.1.crswap`, 'transient');
    TestFileSystemObserver.instances[0]!.callback([
      {
        type: 'appeared',
        changedHandle: fileHandle('main.ts.1.crswap'),
        relativePathComponents: ['projects', 'alpha-project', 'main.ts.1.crswap'],
      },
    ]);
    await service.pollExternalChanges();
    expect(events).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();

    await provider.writeFile(`${alphaPhysicalRoot}/notes.crswap.txt`, 'user data');
    await service.pollExternalChanges();
    expect(events).toEqual([{ type: 'reset' }]);
  });

  it('retains a broad invalidation when a native move crosses the swap boundary', async () => {
    const { service } = await createWebAccessService({ native: true });
    const events: WatchEvent[] = [];
    service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => events.push(event));

    TestFileSystemObserver.instances[0]!.callback([
      {
        type: 'moved',
        changedHandle: fileHandle('main.ts'),
        relativePathComponents: ['projects', 'alpha-project', 'main.ts'],
        relativePathMovedFrom: ['projects', 'alpha-project', 'main.ts.crswap'],
      },
    ]);

    await vi.waitFor(() => {
      expect(events).toEqual([{ type: 'reset' }]);
    });
  });

  it('polls all configured project roots, detects a new project, and stays silent when unchanged', async () => {
    const { service, provider } = await createWebAccessService();
    const globalEvents: WatchEvent[] = [];
    const alphaEvents: WatchEvent[] = [];
    service.watch({ paths: ['/projects'], recursive: true }, (event) => globalEvents.push(event));
    service
      .createRootedFileSystem(`/projects/${alphaProjectId}`)
      .watch({ paths: ['/'], recursive: true }, (event) => alphaEvents.push(event));

    await service.pollExternalChanges();
    expect(globalEvents).toEqual([]);
    await provider.writeFile('/projects/dropped-project/tau.json', '{}');
    await service.pollExternalChanges();

    expect(globalEvents).toEqual([{ type: 'reset' }, { type: 'reset' }, { type: 'reset' }]);
    expect(alphaEvents).toEqual([{ type: 'reset' }]);
    const manifests = await service.listProjectManifests();
    const droppedProject = manifests.entries.find(
      ({ locator }) => locator.relativeDirectory === '/projects/dropped-project',
    );
    expect(droppedProject?.status).toBe('invalid');
    await service.pollExternalChanges();
    expect(globalEvents).toHaveLength(3);
    expect(alphaEvents).toHaveLength(1);
  });
});
