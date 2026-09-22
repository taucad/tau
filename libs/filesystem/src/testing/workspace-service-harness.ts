/**
 * Shared construction for the specs that drive filesystem behaviour through
 * `WorkspaceFileService`, the composition root.
 *
 * W5 moved those rows beside the module that owns each behaviour
 * (`project-directories`, `mutation-pipeline`, `rooted-views`, `tree-index`);
 * the harness they shared while they lived in one file is extracted here once
 * so the move does not duplicate it. Test-only: reachable through the
 * package's internal `#*` imports and deliberately absent from `exports`.
 *
 * The IndexedDB polyfill stays with each spec that needs it — a devDependency
 * belongs to the test entry, not to a module under `src/`.
 */

import { vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { randomUuid } from '@taucad/utils/id';
import { ChangeEventBus } from '#change-event-bus.js';
import type { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import type { FileSystemProvider, PathPolicy } from '#types.js';
import { WorkspaceFileService } from '#workspace-file-service.js';

/** What a memory-root harness hands its spec. */
export type WorkspaceHarness = {
  service: WorkspaceFileService;
  eventBus: ChangeEventBus;
  providerRegistry: ProviderRegistry;
  resourceQueue: ResourceQueue;
  mountTable: MountTable;
  provider: FileSystemProvider;
};

/** What an IndexedDB-root harness hands its spec. */
export type IdbWorkspaceHarness = {
  service: WorkspaceFileService;
  registry: ProviderRegistry;
  mounts: MountTable;
  rootProvider: FileSystemProvider;
  mountMemory: (prefix: string, storageRootKey: string) => Promise<FileSystemProvider>;
  scanSpies: (provider: FileSystemProvider) => MockInstance[];
};

/** Shared UTF-8 codecs for fixture bytes. */
export const encoder = new TextEncoder();
/** Shared UTF-8 codecs for fixture bytes. */
export const decoder = new TextDecoder();

let databaseSequence = 0;

/**
 * Poll a predicate until it becomes true. Used to await asynchronous
 * timer-driven side effects (e.g. EventCoalescer flushes) without coupling
 * the test to a specific wall-clock duration. Pure scheduler-bounded waits
 * are inherently flaky on loaded CI runners; this loop is bounded by
 * `timeout` (milliseconds) instead, so a slow scheduler delays the test rather
 * than failing it.
 */
export async function waitFor(predicate: () => boolean, waitTimeout = 2000, pollInterval = 5): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > waitTimeout) {
      throw new Error(`waitFor timed out after ${waitTimeout}ms`);
    }
    // oxlint-disable-next-line no-await-in-loop -- Sequential execution is intentional for polling
    await new Promise((resolve) => {
      setTimeout(resolve, pollInterval);
    });
  }
}

/** One service over a single memory root mounted at `/`. */
export async function createWorkspaceFileService(options?: {
  crossTabCoordinator?: CrossTabCoordinator;
  policy?: PathPolicy;
}): Promise<WorkspaceHarness> {
  const providerRegistry = new ProviderRegistry({ databasePrefix: `tau-workspace-test-${databaseSequence++}` });
  const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:0' });

  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', backend: 'memory', storageRootKey: 'memory:0' });

  const resourceQueue = new ResourceQueue();
  const eventBus = new ChangeEventBus();

  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue,
    eventBus,
    crossTabCoordinator: options?.crossTabCoordinator,
    mountTable,
    policy: options?.policy,
  });

  return { service, eventBus, providerRegistry, resourceQueue, mountTable, provider };
}

/**
 * One service over a real `DirectIdbProvider` root, with the two knobs the
 * integration rows use: an extra memory mount (so a per-root index has a root
 * to be keyed by, charter D3) and spies over every read a cold scan can make.
 */
export async function createIdbWorkspaceFileService(): Promise<IdbWorkspaceHarness> {
  const registry = new ProviderRegistry({
    databasePrefix: `test-integration-${randomUuid()}`,
  });
  const rootProvider = await registry.getProvider({ backend: 'indexeddb' });

  const mounts = new MountTable();
  mounts.mount('/', rootProvider, {
    class: 'authored',
    backend: 'indexeddb',
    storageRootKey: registry.resolveStorageRootKey({ backend: 'indexeddb' }),
  });

  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable: mounts,
  });

  /** One more mount, so a per-root index has a root to be keyed by (charter D3). */
  const mountMemory = async (prefix: string, storageRootKey: string): Promise<FileSystemProvider> => {
    const provider = await registry.getProvider({ backend: 'memory', storageRootKey });
    mounts.mount(prefix, provider, { class: 'authored', backend: 'memory', storageRootKey });
    return provider;
  };

  /** Every read a cold scan can make, spied on one provider. */
  const scanSpies = (provider: FileSystemProvider): MockInstance[] =>
    (['readdirWithStats', 'readdirEntries', 'readdir', 'stat'] as const)
      .filter((method) => typeof provider[method] === 'function')
      .map((method) => vi.spyOn(provider, method));

  return { service, registry, mounts, rootProvider, mountMemory, scanSpies };
}
