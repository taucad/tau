// oxlint-disable-next-line import/no-unassigned-import -- side-effect import polyfills IndexedDB for tests
import 'fake-indexeddb/auto';
import { IDBDatabase as FakeIDBDatabase, IDBFactory, IDBObjectStore as FakeIDBObjectStore } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { workspaceMarkerPath, workspaceMarkerSchemaUrl } from '@taucad/types';
import { appMetaConfig } from '@taucad/ui-core/constants/meta.constants';
import type * as HandleStore from '#filesystem/handle-store.js';

/** The build target the store resolves at module scope; a case sets it before {@link loadStore}. */
const buildTarget = vi.hoisted(() => ({ desktop: false }));
vi.mock('@taucad/ui-core/lib/build-target', () => ({
  get isDesktopTarget() {
    return buildTarget.desktop;
  },
}));

// ===========================================================================
// In-memory File System Access handles
// ===========================================================================

type FileNode = { content: string };

class MemoryFileHandle {
  readonly #name: string;
  readonly #node: FileNode;
  readonly #onCreateWritable?: () => void;

  public constructor(name: string, node: FileNode, onCreateWritable?: () => void) {
    this.#name = name;
    this.#node = node;
    this.#onCreateWritable = onCreateWritable;
  }

  public get name(): string {
    return this.#name;
  }

  public async getFile(): Promise<{ text: () => Promise<string> }> {
    const node = this.#node;
    return { text: async () => node.content };
  }

  public async createWritable(): Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> {
    this.#onCreateWritable?.();
    const node = this.#node;
    return {
      async write(data: string) {
        node.content = String(data);
      },
      async close() {
        // Noop — the write is already committed in memory.
      },
    };
  }
}

class MemoryDirectoryHandle {
  public readonly files = new Map<string, FileNode>();
  public readonly directories = new Map<string, MemoryDirectoryHandle>();

  readonly #name: string;
  readonly #options: { onCreateWritable?: () => void };

  public constructor(name: string, options: { onCreateWritable?: () => void } = {}) {
    this.#name = name;
    this.#options = options;
  }

  public get name(): string {
    return this.#name;
  }

  public async isSameEntry(other: unknown): Promise<boolean> {
    return other === this;
  }

  public async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectoryHandle> {
    const found = this.directories.get(name);
    if (found) {
      return found;
    }
    if (options?.create !== true) {
      throw new DOMException(`No directory named ${name}`, 'NotFoundError');
    }
    const created = new MemoryDirectoryHandle(name, this.#options);
    this.directories.set(name, created);
    return created;
  }

  public async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFileHandle> {
    const found = this.files.get(name);
    if (found) {
      return new MemoryFileHandle(name, found, this.#options.onCreateWritable);
    }
    if (options?.create !== true) {
      throw new DOMException(`No file named ${name}`, 'NotFoundError');
    }
    const node: FileNode = { content: '' };
    this.files.set(name, node);
    return new MemoryFileHandle(name, node, this.#options.onCreateWritable);
  }
}

const [markerDirectory, markerFile] = workspaceMarkerPath.split('/') as [string, string];

const makeHandle = (
  name: string,
  options: {
    marker?: string;
    readOnly?: boolean;
    permission?: PermissionState;
    queryPermission?: () => Promise<PermissionState>;
  } = {},
): MemoryDirectoryHandle & FileSystemDirectoryHandle => {
  const handle = new MemoryDirectoryHandle(
    name,
    options.readOnly === true
      ? {
          onCreateWritable: () => {
            throw new DOMException('The request is not allowed', 'NotAllowedError');
          },
        }
      : {},
  );
  if (options.marker !== undefined) {
    const tau = new MemoryDirectoryHandle(markerDirectory);
    tau.files.set(markerFile, { content: options.marker });
    handle.directories.set(markerDirectory, tau);
  }
  const permission = options.permission ?? 'granted';
  Object.defineProperty(handle, 'queryPermission', {
    value: options.queryPermission ?? (async () => permission),
  });
  return handle as unknown as MemoryDirectoryHandle & FileSystemDirectoryHandle;
};

const readMarker = (handle: MemoryDirectoryHandle): Record<string, unknown> | undefined => {
  const content = handle.directories.get(markerDirectory)?.files.get(markerFile)?.content;
  return content === undefined || content === '' ? undefined : (JSON.parse(content) as Record<string, unknown>);
};

const markerJson = (workspaceId: string, slug = 'tau-workspace'): string =>
  JSON.stringify({
    $schema: workspaceMarkerSchemaUrl,
    workspaceId,
    slug,
    createdAt: '2026-07-24T00:11:47.808Z',
  });

// ===========================================================================
// Harness
// ===========================================================================

const evictedWorkspaceId = 'wsp_NMN8Aisp3U9ajVqBkqMrP';

type LegacyProjectConfig = {
  readonly projectId: string;
  readonly backend: 'indexeddb';
  readonly providerBasePath: string;
};

/** Fresh IndexedDB + fresh module graph, optionally seeded as the prior v3 schema. */
const loadStore = async (legacyConfigs: readonly LegacyProjectConfig[] = []): Promise<typeof HandleStore> => {
  globalThis.indexedDB = new IDBFactory();
  if (legacyConfigs.length > 0) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${appMetaConfig.databasePrefix}fs-handles`, 3);
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore('configs', { keyPath: 'projectId' });
      });
      request.addEventListener('success', () => {
        resolve(request.result);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('legacy open failed'));
      });
    });
    const transaction = db.transaction('configs', 'readwrite');
    for (const config of legacyConfigs) {
      transaction.objectStore('configs').put(config);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => {
        resolve();
      });
      transaction.addEventListener('error', () => {
        reject(transaction.error ?? new Error('legacy write failed'));
      });
    });
    db.close();
  }
  vi.resetModules();
  return import('#filesystem/handle-store.js');
};

const stubStorage = (storage: unknown): void => {
  Object.defineProperty(globalThis.navigator, 'storage', { configurable: true, value: storage });
};

const stubHomeProbe = (supported: boolean): ReturnType<typeof vi.fn> => {
  const construct = vi.fn();
  class ProbeWorker extends EventTarget {
    public isTerminated = false;

    public constructor() {
      super();
      construct();
    }

    public postMessage(): void {
      queueMicrotask(() => {
        this.dispatchEvent(new MessageEvent('message', { data: supported }));
      });
    }

    public terminate(): void {
      this.isTerminated = true;
    }
  }
  vi.stubGlobal('Worker', ProbeWorker);
  stubStorage({ getDirectory: vi.fn() });
  return construct;
};

/** Serialising `navigator.locks` double — the platform lock jsdom has no equivalent for. */
const stubLocks = (): void => {
  let queue: Promise<unknown> = Promise.resolve();
  Object.defineProperty(globalThis.navigator, 'locks', {
    configurable: true,
    value: {
      async request(_name: string, _options: unknown, callback: () => Promise<unknown>) {
        const previous = queue;
        const run = (async () => {
          try {
            await previous;
          } catch {
            // A failed predecessor must not block the queue.
          }
          return callback();
        })();
        queue = run;
        return run;
      },
    },
  });
};

/** Direct database access, standing in for rows written by another tab or an older build. */
const withRawDb = async <T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`${appMetaConfig.databasePrefix}fs-handles`, 4);
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('open failed'));
    });
  });
  try {
    return await operation(db);
  } finally {
    db.close();
  }
};

const rawReadWorkspace = async (workspaceId: string): Promise<Record<string, unknown> | undefined> =>
  withRawDb(
    async (db) =>
      new Promise((resolve, reject) => {
        const request = db.transaction('workspaces', 'readonly').objectStore('workspaces').get(workspaceId);
        request.addEventListener('success', () => {
          resolve(request.result as Record<string, unknown> | undefined);
        });
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('read failed'));
        });
      }),
  );

const rawReadHandle = async (workspaceId: string): Promise<unknown> =>
  withRawDb(
    async (db) =>
      new Promise((resolve, reject) => {
        const request = db.transaction('handles', 'readonly').objectStore('handles').get(workspaceId);
        request.addEventListener('success', () => {
          resolve(request.result);
        });
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('handle read failed'));
        });
      }),
  );

const rawReadMeta = async (key: string): Promise<Record<string, unknown> | undefined> =>
  withRawDb(
    async (db) =>
      new Promise((resolve, reject) => {
        const request = db.transaction('meta', 'readonly').objectStore('meta').get(key);
        request.addEventListener('success', () => {
          resolve(request.result as Record<string, unknown> | undefined);
        });
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('meta read failed'));
        });
      }),
  );

const rawWriteMeta = async (value: Record<string, unknown>): Promise<void> =>
  withRawDb(
    async (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put(value);
        tx.addEventListener('complete', () => {
          resolve();
        });
        tx.addEventListener('error', () => {
          reject(tx.error ?? new Error('meta write failed'));
        });
      }),
  );

const rawUpdateWorkspace = async (
  workspaceId: string,
  mutate: (row: Record<string, unknown>) => void,
): Promise<void> => {
  const row = await rawReadWorkspace(workspaceId);
  if (!row) {
    throw new Error(`No workspace row ${workspaceId}`);
  }
  mutate(row);
  await withRawDb(
    async (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction('workspaces', 'readwrite');
        tx.objectStore('workspaces').put(row);
        tx.addEventListener('complete', () => {
          resolve();
        });
        tx.addEventListener('error', () => {
          reject(tx.error ?? new Error('write failed'));
        });
      }),
  );
};

const rawDeleteHandle = async (workspaceId: string): Promise<void> =>
  withRawDb(
    async (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete(workspaceId);
        tx.addEventListener('complete', () => {
          resolve();
        });
        tx.addEventListener('error', () => {
          reject(tx.error ?? new Error('delete failed'));
        });
      }),
  );

beforeEach(() => {
  // Fake-indexeddb structured-clones inserted values; the mock handles carry
  // methods, which a real structured clone rejects. Browsers serialize handles
  // natively, so identity pass-through is the faithful stand-in.
  vi.stubGlobal('structuredClone', (value: unknown) => value);
  stubStorage(undefined);
});

afterEach(() => {
  /* Home's engine mirror (WP9) lives in `localStorage`, which outlives each case's fresh database. */
  globalThis.localStorage.clear();
  buildTarget.desktop = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis.navigator, 'locks');
});

// ===========================================================================
// R2 / D7 — on-disk workspace identity marker
// ===========================================================================

describe('createWorkspace marker identity', () => {
  it('resurrects the evicted workspace id from the on-disk marker when IndexedDB is empty', async () => {
    const { createWorkspace } = await loadStore();
    const handle = makeHandle('tau-workspace', { marker: markerJson(evictedWorkspaceId) });

    const workspace = await createWorkspace(handle);

    expect(workspace.workspaceId).toBe(evictedWorkspaceId);
    expect(workspace.slug).toBe('tau-workspace');
  });

  it('mints a fresh id and marker when the marker id is already a known workspace row', async () => {
    const { createWorkspace } = await loadStore();
    const original = makeHandle('tau-workspace', { marker: markerJson(evictedWorkspaceId) });
    const adopted = await createWorkspace(original);

    const copy = makeHandle('tau-workspace-copy', { marker: markerJson(evictedWorkspaceId) });
    const minted = await createWorkspace(copy);

    expect(minted.workspaceId).not.toBe(adopted.workspaceId);
    expect(readMarker(copy)?.['workspaceId']).toBe(minted.workspaceId);
    expect(readMarker(original)?.['workspaceId']).toBe(adopted.workspaceId);
  });

  it('reconnects a marked workspace whose durable row exists without a handle', async () => {
    const { createWorkspace, disconnectWorkspace, listWorkspaces } = await loadStore();
    const handle = makeHandle('tau-workspace');
    const connected = await createWorkspace(handle);
    const markerBefore = readMarker(handle);
    await disconnectWorkspace(connected.workspaceId);

    const reconnected = await createWorkspace(handle);

    expect(reconnected).toMatchObject({ workspaceId: connected.workspaceId, minted: false });
    expect(await rawReadHandle(connected.workspaceId)).toBe(handle);
    expect(await listWorkspaces()).toHaveLength(1);
    expect(readMarker(handle)).toEqual(markerBefore);
  });

  it('normalizes a conflicting marker when the live handle proves the workspace identity', async () => {
    const { createWorkspace } = await loadStore();
    const handle = makeHandle('tau-workspace');
    const connected = await createWorkspace(handle);
    const conflictingId = 'wsp_bbbbbbbbbbbbbbbbbbbbb';
    handle.directories.get(markerDirectory)?.files.set(markerFile, { content: markerJson(conflictingId) });

    const refreshed = await createWorkspace(handle);

    expect(refreshed.workspaceId).toBe(connected.workspaceId);
    expect(readMarker(handle)?.['workspaceId']).toBe(connected.workspaceId);
  });

  it('leaves the disconnected row unchanged when the reconnect transaction aborts', async () => {
    const { createWorkspace, disconnectWorkspace } = await loadStore();
    const handle = makeHandle('tau-workspace');
    const connected = await createWorkspace(handle);
    await disconnectWorkspace(connected.workspaceId);
    const before = await rawReadWorkspace(connected.workspaceId);
    const { put } = IDBObjectStore.prototype;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'handles') {
        this.transaction.abort();
      }
      return put.call(this, value, key);
    });

    await expect(createWorkspace(handle)).rejects.toThrow();

    expect(await rawReadWorkspace(connected.workspaceId)).toEqual(before);
    expect(await rawReadHandle(connected.workspaceId)).toBeUndefined();
  });

  it('writes the marker for a folder that has none', async () => {
    const { createWorkspace } = await loadStore();
    const handle = makeHandle('My Designs');

    const workspace = await createWorkspace(handle);

    const marker = readMarker(handle);
    expect(marker).toMatchObject({
      $schema: workspaceMarkerSchemaUrl,
      workspaceId: workspace.workspaceId,
      slug: 'my-designs',
    });
    expect(typeof marker?.['createdAt']).toBe('string');
  });

  it('keeps the marker id on reconnect and refreshes only the slug', async () => {
    const { createWorkspace } = await loadStore();
    const handle = makeHandle('tau-workspace');
    const first = await createWorkspace(handle);
    const createdAt = readMarker(handle)?.['createdAt'];

    const refreshed = await createWorkspace(handle, { name: 'Renamed' });

    expect(refreshed.workspaceId).toBe(first.workspaceId);
    expect(readMarker(handle)).toEqual({
      $schema: workspaceMarkerSchemaUrl,
      workspaceId: first.workspaceId,
      slug: 'tau-workspace',
      createdAt,
    });
  });

  it('creates the workspace even when the marker write is refused by permissions', async () => {
    const { createWorkspace } = await loadStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handle = makeHandle('tau-workspace', { readOnly: true });

    const workspace = await createWorkspace(handle);

    expect(workspace.workspaceId).toMatch(/^wsp_/);
    expect(warn).toHaveBeenCalled();
  });
});

// ===========================================================================
// R1 — persistent storage
// ===========================================================================

describe('Home storage persistence', () => {
  it('should never request on startup or when connecting a disk workspace', async () => {
    const persist = vi.fn(async () => false);
    stubStorage({ persist, persisted: async () => false });
    const store = await loadStore();
    await store.getProjectRootConfigs();
    await store.createWorkspace(makeHandle('tau-workspace'));
    expect(persist).not.toHaveBeenCalled();
  });

  it('should request once across simultaneous saves and a fresh module sharing the same database', async () => {
    const persist = vi.fn(async () => false);
    stubStorage({ persist, persisted: async () => false });
    const firstTab = await loadStore();
    vi.resetModules();
    const secondTab = await import('#filesystem/handle-store.js');
    await Promise.all([
      firstTab.requestHomeStoragePersistence(),
      firstTab.requestHomeStoragePersistence(),
      secondTab.requestHomeStoragePersistence(),
    ]);
    expect(persist).toHaveBeenCalledOnce();
    vi.resetModules();
    const reloaded = await import('#filesystem/handle-store.js');
    await reloaded.requestHomeStoragePersistence();
    expect(persist).toHaveBeenCalledOnce();
    expect(reloaded.getPersistentStorageStatus()).toBe('best-effort');
  });

  it('should skip requesting when already protected', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persist, persisted: async () => true });
    const store = await loadStore();
    await store.requestHomeStoragePersistence();
    expect(persist).not.toHaveBeenCalled();
    expect(store.getPersistentStorageStatus()).toBe('persistent');
  });

  it('should refresh both grants and revocations without requesting', async () => {
    const persisted = vi.fn(async () => false);
    const persist = vi.fn(async () => false);
    stubStorage({ persist, persisted });
    const store = await loadStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribePersistentStorageStatus(listener);
    await store.refreshPersistentStorageStatus();
    expect(store.getPersistentStorageStatus()).toBe('best-effort');
    persisted.mockResolvedValue(true);
    await store.refreshPersistentStorageStatus();
    expect(store.getPersistentStorageStatus()).toBe('persistent');
    persisted.mockResolvedValue(false);
    await store.refreshPersistentStorageStatus();
    expect(store.getPersistentStorageStatus()).toBe('best-effort');
    expect(persist).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it('should serialize a status refresh behind an in-flight grant', async () => {
    const grant = Promise.withResolvers<boolean>();
    const persisted = vi.fn(async () => false);
    const persist = vi.fn(async () => grant.promise);
    stubStorage({ persist, persisted });
    const store = await loadStore();
    const request = store.requestHomeStoragePersistence();
    await vi.waitFor(() => {
      expect(persist).toHaveBeenCalledOnce();
    });
    const refresh = store.refreshPersistentStorageStatus();
    persisted.mockResolvedValue(true);
    grant.resolve(true);
    await Promise.all([request, refresh]);
    expect(store.getPersistentStorageStatus()).toBe('persistent');
  });

  it('should treat missing APIs and failed checks as unknown protection rather than refused saves', async () => {
    stubStorage(undefined);
    const store = await loadStore();
    await store.refreshPersistentStorageStatus();
    expect(store.getPersistentStorageStatus()).toBe('unavailable');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubStorage({
      persisted: async () => {
        throw new Error('unavailable');
      },
    });
    await store.refreshPersistentStorageStatus();
    expect(store.getPersistentStorageStatus()).toBe('unknown');
  });

  it('should retain the claim even if the browser request throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const persist = vi.fn(async () => {
      throw new Error('refused API');
    });
    stubStorage({ persist, persisted: async () => false });
    const store = await loadStore();
    await expect(store.requestHomeStoragePersistence()).resolves.toBeUndefined();
    expect(store.getPersistentStorageStatus()).toBe('unknown');
    vi.resetModules();
    const reloaded = await import('#filesystem/handle-store.js');
    await reloaded.requestHomeStoragePersistence();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('should not prompt when the durable claim fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const persist = vi.fn(async () => true);
    stubStorage({ persist, persisted: async () => false });
    const store = await loadStore();
    const { put } = IDBObjectStore.prototype;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown) {
      const request = put.call(this, value);
      this.transaction.abort();
      return request;
    });
    await expect(store.requestHomeStoragePersistence()).resolves.toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
    expect(store.getPersistentStorageStatus()).toBe('unknown');
  });
});

// ===========================================================================
// R6 — quota
// ===========================================================================

describe('storage quota errors', () => {
  it('maps a QuotaExceededError write failure to a typed workspace error', async () => {
    const { setProjectFileSystemConfig } = await loadStore();
    const { StorageQuotaExceededError: storageQuotaExceededErrorClass } =
      await import('@taucad/ui-core/filesystem/workspace-errors');
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    await expect(
      setProjectFileSystemConfig({
        projectId: 'proj_000000000000000000001',
        backend: 'indexeddb',
        providerBasePath: 'demo',
      }),
    ).rejects.toBeInstanceOf(storageQuotaExceededErrorClass);
  });
});

// ===========================================================================
// D5 — workspace slug registry
// ===========================================================================

describe('workspace slug registry', () => {
  it.each(['home', 'opfs', 'indexeddb'])('suffixes the reserved %s slug', async (reserved) => {
    const { createWorkspace, resolveWorkspaceBySlug } = await loadStore();

    const workspace = await createWorkspace(makeHandle(reserved));

    expect(workspace.slug).toBe(`${reserved}-1`);
    const resolved = await resolveWorkspaceBySlug(`${reserved}-1`);
    expect(resolved?.workspaceId).toBe(workspace.workspaceId);
  });

  it.each(['opfs', 'OPFS', 'indexeddb', 'IndexedDB'])('never resolves the %s tombstone', async (slug) => {
    const { resolveWorkspaceBySlug } = await loadStore();
    expect(await resolveWorkspaceBySlug(slug)).toBeUndefined();
  });

  it('increments a slug that another workspace already holds', async () => {
    const { createWorkspace, resolveWorkspaceBySlug } = await loadStore();

    const first = await createWorkspace(makeHandle('Tau Workspace'));
    const second = await createWorkspace(makeHandle('tau-workspace'));

    expect(first.slug).toBe('tau-workspace');
    expect(second.slug).toBe('tau-workspace-1');
    const resolved = await resolveWorkspaceBySlug('TAU-Workspace');
    expect(resolved?.workspaceId).toBe(first.workspaceId);
    expect(await resolveWorkspaceBySlug('nothing-here')).toBeUndefined();
  });

  it('keeps its own slug on reconnect instead of colliding with itself', async () => {
    const { createWorkspace } = await loadStore();
    const handle = makeHandle('tau-workspace');
    await createWorkspace(handle);

    const refreshed = await createWorkspace(handle);

    expect(refreshed.slug).toBe('tau-workspace');
  });
});

// ===========================================================================
// RC2 — Home engine selection and pinning
// ===========================================================================

describe('Home storage backend', () => {
  it('prefers OPFS only when the worker probe confirms sync access handles', async () => {
    const construct = stubHomeProbe(true);
    const { getHomeStorageBackend } = await loadStore();

    await expect(getHomeStorageBackend()).resolves.toBe('opfs');
    expect(construct).toHaveBeenCalledTimes(1);
  });

  it('degrades to IndexedDB when the worker probe fails', async () => {
    stubHomeProbe(false);
    const { getHomeStorageBackend } = await loadStore();

    await expect(getHomeStorageBackend()).resolves.toBe('indexeddb');
  });

  it('reads a materialized pin without probing again', async () => {
    const { getHomeStorageBackend, pinHomeStorageBackend } = await loadStore();
    await pinHomeStorageBackend('indexeddb');
    const construct = stubHomeProbe(true);

    await expect(getHomeStorageBackend()).resolves.toBe('indexeddb');
    expect(construct).not.toHaveBeenCalled();
  });

  it('refuses to split a materialized Home across engines', async () => {
    const { pinHomeStorageBackend } = await loadStore();
    await pinHomeStorageBackend('indexeddb');

    await expect(pinHomeStorageBackend('opfs')).rejects.toThrow('Home is pinned to indexeddb');
  });

  it('fails the open rather than hanging when another tab blocks the upgrade', async () => {
    globalThis.indexedDB = new IDBFactory();
    // Another tab holding an older version open never yields, so the upgrade stays blocked. The open must
    // settle: an unsettled promise leaves the app on the "Opening Home" shell for as long as that tab lives.
    const older = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${appMetaConfig.databasePrefix}fs-handles`, 3);
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore('meta', { keyPath: 'key' });
      });
      request.addEventListener('success', () => {
        resolve(request.result);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('older open failed'));
      });
    });
    stubHomeProbe(false);
    vi.resetModules();
    const { getHomeStorageBackend } = await import('#filesystem/handle-store.js');

    await expect(getHomeStorageBackend()).rejects.toThrow('blocked by another Tau tab');
    older.close();
  });

  /* T-B5.7 (B5): an open queued behind the blocked upgrade must not wait out its deadline and read as a timeout, or
   * the panel shows "couldn't open" instead of asking for the other window to close (D3). */
  it('fails every later open as blocked while another tab blocks the upgrade', async () => {
    globalThis.indexedDB = new IDBFactory();
    const older = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${appMetaConfig.databasePrefix}fs-handles`, 3);
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore('meta', { keyPath: 'key' });
      });
      request.addEventListener('success', () => {
        resolve(request.result);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('older open failed'));
      });
    });
    globalThis.localStorage.setItem('tau:home-backend', 'opfs');
    stubHomeProbe(false);
    vi.resetModules();
    const { getHomeStorageBackend, readProjectRootConfigs } = await import('#filesystem/handle-store.js');

    try {
      await expect(getHomeStorageBackend()).resolves.toBe('opfs');
      const read = await readProjectRootConfigs();

      expect(read.degraded).toEqual({ input: 'records', errorName: 'StorageUpgradeBlockedError' });
    } finally {
      older.close();
      globalThis.localStorage.clear();
    }
  }, 30_000);

  it('closes its connection so a newer version in another tab can upgrade', async () => {
    stubHomeProbe(false);
    const { getHomeStorageBackend } = await loadStore();
    await expect(getHomeStorageBackend()).resolves.toBe('indexeddb');

    // The store now holds the database open. A newer build in another tab must still be able to upgrade.
    const upgraded = await new Promise<IDBDatabase | 'blocked'>((resolve, reject) => {
      const request = indexedDB.open(`${appMetaConfig.databasePrefix}fs-handles`, 5);
      request.addEventListener('blocked', () => {
        resolve('blocked');
      });
      request.addEventListener('success', () => {
        resolve(request.result);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('upgrade failed'));
      });
    });

    expect(upgraded).not.toBe('blocked');
    (upgraded as IDBDatabase).close();
  });

  it('mounts only the selected Home engine', async () => {
    stubHomeProbe(true);
    const { getProjectRootConfigs } = await loadStore();

    await expect(getProjectRootConfigs()).resolves.toMatchObject({ roots: [{ backend: 'opfs' }] });
  });
});

// ===========================================================================
// Flat-layout config sanitisation (blueprint D1)
// ===========================================================================

describe('getProjectRootConfigs', () => {
  beforeEach(() => {
    // The default harness stub leaves `navigator.storage` undefined; the OPFS
    // probe reads it.
    stubStorage({});
  });

  it('skips a pre-cutover config instead of poisoning the whole route topology', async () => {
    const { getProjectRootConfigs } = await loadStore([
      {
        projectId: 'proj_000000000000000000001',
        backend: 'indexeddb',
        providerBasePath: '/projects/legacy--proj_000000000000000000001',
      },
      {
        projectId: 'proj_000000000000000000002',
        backend: 'indexeddb',
        providerBasePath: '/.tau',
      },
      {
        projectId: 'proj_000000000000000000003',
        backend: 'indexeddb',
        providerBasePath: '/flat-project',
      },
    ]);

    const configuration = await getProjectRootConfigs();

    expect(configuration.projects.map((config) => config.providerBasePath)).toEqual(['flat-project']);
  });

  it('re-admits the config once discovery re-points it at the flat directory', async () => {
    const projectId = 'proj_000000000000000000001';
    const { getProjectRootConfigs, setProjectFileSystemConfig } = await loadStore([
      { projectId, backend: 'indexeddb', providerBasePath: '/projects/legacy' },
    ]);
    const beforeRepoint = await getProjectRootConfigs();
    expect(beforeRepoint.projects).toEqual([]);

    await setProjectFileSystemConfig({ projectId, backend: 'indexeddb', providerBasePath: 'legacy' });

    const afterRepoint = await getProjectRootConfigs();
    expect(afterRepoint.projects).toEqual([{ projectId, backend: 'indexeddb', providerBasePath: 'legacy' }]);
  });

  it('keeps one canonical handle on the workspace root instead of cloning it into every project route', async () => {
    const { applyProjectFileSystemConfigChanges, createWorkspace, getProjectRootConfigs } = await loadStore();
    const workspace = await createWorkspace(makeHandle('Workshop'));
    await applyProjectFileSystemConfigChanges({
      upserts: [
        {
          projectId: 'proj_000000000000000000001',
          backend: 'webaccess',
          workspaceId: workspace.workspaceId,
          providerBasePath: 'first',
        },
        {
          projectId: 'proj_000000000000000000002',
          backend: 'webaccess',
          workspaceId: workspace.workspaceId,
          providerBasePath: 'second',
        },
      ],
      deletes: [],
    });

    const configuration = await getProjectRootConfigs();

    expect(configuration.roots).toHaveLength(2);
    expect(configuration.projects.filter(({ backend }) => backend === 'webaccess')).toEqual([
      {
        projectId: 'proj_000000000000000000001',
        backend: 'webaccess',
        workspaceId: workspace.workspaceId,
        providerBasePath: 'first',
      },
      {
        projectId: 'proj_000000000000000000002',
        backend: 'webaccess',
        workspaceId: workspace.workspaceId,
        providerBasePath: 'second',
      },
    ]);
    expect(configuration.projects.every((config) => !('directoryHandle' in config))).toBe(true);
  });

  it('builds a 500-project topology with one permission probe for its workspace', async () => {
    const queryPermission = vi.fn(async (): Promise<PermissionState> => 'granted');
    const { applyProjectFileSystemConfigChanges, createWorkspace, getProjectRootConfigs } = await loadStore();
    const workspace = await createWorkspace(makeHandle('Workshop', { queryPermission }));
    queryPermission.mockClear();
    await applyProjectFileSystemConfigChanges({
      upserts: Array.from({ length: 500 }, (_, index) => ({
        projectId: `proj_${String(index).padStart(21, '0')}`,
        backend: 'webaccess',
        workspaceId: workspace.workspaceId,
        providerBasePath: `project-${index}`,
      })),
      deletes: [],
    });

    const configuration = await getProjectRootConfigs();

    expect(configuration.projects.filter(({ backend }) => backend === 'webaccess')).toHaveLength(500);
    expect(queryPermission).toHaveBeenCalledOnce();
  });

  it('rechecks permission without a durable config mutation on the next root snapshot', async () => {
    let permission: PermissionState = 'granted';
    const queryPermission = vi.fn(async (): Promise<PermissionState> => permission);
    const { createWorkspace, getProjectRootConfigs, setProjectFileSystemConfig } = await loadStore();
    const workspace = await createWorkspace(makeHandle('Permission changes', { queryPermission }));
    const projectId = 'proj_000000000000000000010';
    await setProjectFileSystemConfig({
      projectId,
      backend: 'webaccess',
      workspaceId: workspace.workspaceId,
      providerBasePath: 'project',
    });
    const granted = await getProjectRootConfigs();
    expect(granted.projects.some((project) => project.projectId === projectId)).toBe(true);
    queryPermission.mockClear();
    permission = 'denied';
    const denied = await getProjectRootConfigs();
    expect(denied.projects.some((project) => project.projectId === projectId)).toBe(false);
    expect(queryPermission).toHaveBeenCalledOnce();
    permission = 'granted';
    const regranted = await getProjectRootConfigs();
    expect(regranted.projects.some((project) => project.projectId === projectId)).toBe(true);
  });

  it('reads the newly committed replacement handle in the next root snapshot', async () => {
    const {
      createWorkspace,
      getProjectRootConfigs,
      disconnectWorkspace,
      updateWorkspaceHandle,
      setProjectFileSystemConfig,
    } = await loadStore();
    const original = makeHandle('Original snapshot');
    const replacement = makeHandle('Replacement snapshot');
    const workspace = await createWorkspace(original);
    await setProjectFileSystemConfig({
      projectId: 'proj_000000000000000000011',
      backend: 'webaccess',
      workspaceId: workspace.workspaceId,
      providerBasePath: 'project',
    });
    const before = await getProjectRootConfigs();
    await disconnectWorkspace(workspace.workspaceId);
    await updateWorkspaceHandle(workspace.workspaceId, replacement);
    const after = await getProjectRootConfigs();
    const beforeRoot = before.roots.find((root) => root.backend === 'webaccess');
    const afterRoot = after.roots.find((root) => root.backend === 'webaccess');
    expect(beforeRoot).toMatchObject({ workspaceId: workspace.workspaceId, directoryHandle: original });
    expect(afterRoot).toMatchObject({ workspaceId: workspace.workspaceId, directoryHandle: replacement });
  });

  // R13 — a workspace dropped from the topology used to vanish in silence.
  it('classifies disconnected roots without an alarming console warning', async () => {
    stubLocks();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onRootSkipped = vi.fn<(skip: HandleStore.WorkspaceRootSkip) => void>();
    const { createWorkspace, getProjectRootConfigs } = await loadStore();
    const evicted = await createWorkspace(makeHandle('Evicted'));
    const revoked = await createWorkspace(makeHandle('Revoked', { permission: 'prompt' }));
    await rawDeleteHandle(evicted.workspaceId);

    await getProjectRootConfigs(onRootSkipped);
    await getProjectRootConfigs(onRootSkipped);

    expect(warn.mock.calls.filter((call) => String(call[0]).includes(evicted.workspaceId))).toHaveLength(0);
    expect(warn.mock.calls.filter((call) => String(call[0]).includes(revoked.workspaceId))).toHaveLength(1);
    expect(onRootSkipped).toHaveBeenCalledTimes(2);
    expect(onRootSkipped.mock.calls.map(([skip]) => skip)).toEqual(
      expect.arrayContaining([
        { workspaceId: evicted.workspaceId, reason: 'disconnected' },
        { workspaceId: revoked.workspaceId, reason: 'permission' },
      ]),
    );
  });
});

// ===========================================================================
// Phase 4 — hardening (DF4–DF8, DF10, DF19, pre-slug rows)
// ===========================================================================

describe('pre-slug workspace rows', () => {
  it('resolves a row written before slugs existed and backfills its slug', async () => {
    const { createWorkspace, resolveWorkspaceBySlug } = await loadStore();
    const workspace = await createWorkspace(makeHandle('Tau Workspace'));
    await rawUpdateWorkspace(workspace.workspaceId, (row) => {
      delete row['slug'];
    });

    const resolved = await resolveWorkspaceBySlug('tau-workspace');

    expect(resolved?.workspaceId).toBe(workspace.workspaceId);
    const backfilled = await rawReadWorkspace(workspace.workspaceId);
    expect(backfilled?.['slug']).toBe('tau-workspace');
  });

  // `Workspace.slug` is required (L10), so every read path — not just slug
  // resolution — has to hand back a row that satisfies the type.
  it('backfills on a plain listing, without colliding with a live sibling', async () => {
    const { createWorkspace, listWorkspaces } = await loadStore();
    const first = await createWorkspace(makeHandle('Tau Workspace'));
    const second = await createWorkspace(makeHandle('Tau Workspace'));
    expect(second.slug).toBe('tau-workspace-1');
    await rawUpdateWorkspace(second.workspaceId, (row) => {
      delete row['slug'];
    });

    const listed = await listWorkspaces();

    expect(listed.find((row) => row.workspaceId === first.workspaceId)?.slug).toBe('tau-workspace');
    expect(listed.find((row) => row.workspaceId === second.workspaceId)?.slug).toBe('tau-workspace-1');
    const persisted = await rawReadWorkspace(second.workspaceId);
    expect(persisted?.['slug']).toBe('tau-workspace-1');
  });
});

describe('createWorkspace mint reporting', () => {
  it('writes only live workspace metadata', async () => {
    const { createWorkspace } = await loadStore();
    const workspace = await createWorkspace(makeHandle('first'));

    expect(workspace.minted).toBe(true);
    expect(Object.keys((await rawReadWorkspace(workspace.workspaceId)) ?? {}).sort()).toEqual([
      'lastConnectedAt',
      'name',
      'slug',
      'workspaceId',
    ]);
  });

  it('reports a reconnect as a refresh rather than a mint', async () => {
    const { createWorkspace } = await loadStore();
    const handle = makeHandle('tau-workspace');
    await createWorkspace(handle);

    const reconnected = await createWorkspace(handle);
    expect(reconnected.minted).toBe(false);
  });

  it('mints one identity when two contexts connect the same folder at once', async () => {
    stubLocks();
    const { createWorkspace, listWorkspaces } = await loadStore();
    const handle = makeHandle('tau-workspace');

    const [first, second] = await Promise.all([createWorkspace(handle), createWorkspace(handle)]);

    expect(second.workspaceId).toBe(first.workspaceId);
    const rows = await listWorkspaces();
    expect(rows).toHaveLength(1);
  });

  it('ignores a stored handle that cannot answer isSameEntry', async () => {
    const { createWorkspace, listWorkspaces } = await loadStore();
    const broken = makeHandle('broken');
    const first = await createWorkspace(broken);
    Object.defineProperty(broken, 'isSameEntry', {
      configurable: true,
      value: async () => {
        throw new DOMException('The requested entry is gone', 'NotFoundError');
      },
    });

    const second = await createWorkspace(makeHandle('tau-workspace'));

    expect(second.workspaceId).not.toBe(first.workspaceId);
    const rows = await listWorkspaces();
    expect(rows).toHaveLength(2);
  });
});

describe('workspace disconnect and undo', () => {
  const preferenceKey = 'project-creation-location';

  it('should remove only the handle when 500 projects remain bound', async () => {
    const {
      applyProjectFileSystemConfigChanges,
      createWorkspace,
      disconnectWorkspace,
      getProjectCreationLocation,
      listProjectsForWorkspace,
      setProjectCreationLocation,
    } = await loadStore();
    const handle = makeHandle('Workshop');
    const workspace = await createWorkspace(handle);
    const workspaceBefore = await rawReadWorkspace(workspace.workspaceId);
    const markerBefore = readMarker(handle);
    await applyProjectFileSystemConfigChanges({
      upserts: Array.from({ length: 500 }, (_, index) => ({
        projectId: `proj_${String(index).padStart(21, '0')}`,
        backend: 'webaccess',
        workspaceId: workspace.workspaceId,
        providerBasePath: `bound-project-${index}`,
      })),
      deletes: [],
    });
    await setProjectCreationLocation({ kind: 'workspace', workspaceId: workspace.workspaceId });
    const projectsBefore = await listProjectsForWorkspace(workspace.workspaceId);

    const disconnected = await disconnectWorkspace(workspace.workspaceId);

    expect(disconnected).toEqual({ workspace: workspaceBefore, handle });
    expect(await rawReadHandle(workspace.workspaceId)).toBeUndefined();
    expect(await rawReadWorkspace(workspace.workspaceId)).toEqual(workspaceBefore);
    expect(await listProjectsForWorkspace(workspace.workspaceId)).toEqual(projectsBefore);
    expect(await getProjectCreationLocation({ webAccessSupported: true })).toEqual({
      location: { kind: 'workspace', workspaceId: workspace.workspaceId },
      repaired: undefined,
    });
    expect(await rawReadMeta(preferenceKey)).toEqual({
      key: preferenceKey,
      location: { kind: 'workspace', workspaceId: workspace.workspaceId },
    });
    expect(readMarker(handle)).toEqual(markerBefore);
  });

  it('should restore the captured handle without changing workspace identity', async () => {
    const { createWorkspace, disconnectWorkspace, getWorkspace, restoreWorkspaceHandle } = await loadStore();
    const handle = makeHandle('Workshop');
    const workspace = await createWorkspace(handle);
    const disconnected = await disconnectWorkspace(workspace.workspaceId);
    if (!disconnected) {
      throw new Error('Expected workspace to disconnect');
    }

    await expect(restoreWorkspaceHandle(workspace.workspaceId, disconnected.handle)).resolves.toBe(true);

    const restored = await getWorkspace(workspace.workspaceId);
    expect(restored?.workspace.workspaceId).toBe(workspace.workspaceId);
    expect(restored?.handle).toBe(handle);
  });

  it('should preserve 500 bindings through generic reconnect after disconnect', async () => {
    stubStorage({});
    const {
      applyProjectFileSystemConfigChanges,
      createWorkspace,
      disconnectWorkspace,
      getProjectRootConfigs,
      listProjectsForWorkspace,
      listWorkspaces,
    } = await loadStore();
    const handle = makeHandle('Workshop');
    const connected = await createWorkspace(handle);
    const configs = Array.from(
      { length: 500 },
      (_, index) =>
        ({
          projectId: `proj_${String(index).padStart(21, '0')}`,
          backend: 'webaccess',
          workspaceId: connected.workspaceId,
          providerBasePath: `bound-project-${index}`,
        }) satisfies HandleStore.ProjectFileSystemConfig,
    );
    await applyProjectFileSystemConfigChanges({ upserts: configs, deletes: [] });
    await disconnectWorkspace(connected.workspaceId);

    const reconnected = await createWorkspace(handle);
    const topology = await getProjectRootConfigs();

    expect(reconnected).toMatchObject({ workspaceId: connected.workspaceId, minted: false });
    expect(await listWorkspaces()).toHaveLength(1);
    expect(await listProjectsForWorkspace(connected.workspaceId)).toEqual(configs);
    expect(topology.projects.filter(({ backend }) => backend === 'webaccess')).toEqual(configs);
  });

  it('should refuse stale undo after another handle is connected', async () => {
    const { createWorkspace, disconnectWorkspace, getWorkspace, restoreWorkspaceHandle, updateWorkspaceHandle } =
      await loadStore();
    const originalHandle = makeHandle('Original');
    const replacementHandle = makeHandle('Replacement');
    const workspace = await createWorkspace(originalHandle);
    const disconnected = await disconnectWorkspace(workspace.workspaceId);
    if (!disconnected) {
      throw new Error('Expected workspace to disconnect');
    }
    await updateWorkspaceHandle(workspace.workspaceId, replacementHandle);

    await expect(restoreWorkspaceHandle(workspace.workspaceId, disconnected.handle)).resolves.toBe(false);

    const current = await getWorkspace(workspace.workspaceId);
    expect(current?.handle).toBe(replacementHandle);
  });

  it('should refuse stale undo after a durable generic reconnect', async () => {
    const { createWorkspace, disconnectWorkspace, getWorkspace, restoreWorkspaceHandle } = await loadStore();
    const handle = makeHandle('Workshop');
    const workspace = await createWorkspace(handle);
    const disconnected = await disconnectWorkspace(workspace.workspaceId);
    if (!disconnected) {
      throw new Error('Expected workspace to disconnect');
    }
    const reconnected = await createWorkspace(handle);

    await expect(restoreWorkspaceHandle(workspace.workspaceId, disconnected.handle)).resolves.toBe(false);
    expect(reconnected.workspaceId).toBe(workspace.workspaceId);
    const restored = await getWorkspace(workspace.workspaceId);
    expect(restored?.handle).toBe(handle);
  });

  it('should no-op when the workspace is already disconnected or unknown', async () => {
    const { createWorkspace, disconnectWorkspace } = await loadStore();
    const workspace = await createWorkspace(makeHandle('Workshop'));
    await disconnectWorkspace(workspace.workspaceId);

    await expect(disconnectWorkspace(workspace.workspaceId)).resolves.toBeUndefined();
    await expect(disconnectWorkspace('wsp_unknown')).resolves.toBeUndefined();
  });
});

describe('exact workspace reconnect identity', () => {
  it('rejects a handle already owned by another workspace without changing either workspace', async () => {
    const { createWorkspace, disconnectWorkspace, getWorkspace, updateWorkspaceHandle } = await loadStore();
    const ownerHandle = makeHandle('Owner');
    const owner = await createWorkspace(ownerHandle);
    const targetHandle = makeHandle('Target');
    const target = await createWorkspace(targetHandle);
    await disconnectWorkspace(target.workspaceId);

    await expect(updateWorkspaceHandle(target.workspaceId, ownerHandle)).rejects.toMatchObject({
      name: 'WorkspaceIdentityConflictError',
      code: 'handle-owned-by-another-workspace',
      conflictingWorkspaceId: owner.workspaceId,
    });
    const unchangedOwner = await getWorkspace(owner.workspaceId);
    expect(unchangedOwner?.handle).toBe(ownerHandle);
    expect(await getWorkspace(target.workspaceId)).toBeUndefined();
    expect(readMarker(ownerHandle)?.['workspaceId']).toBe(owner.workspaceId);
  });

  it('rejects a folder marked for another workspace without durable writes', async () => {
    const { createWorkspace, disconnectWorkspace, getWorkspace, updateWorkspaceHandle } = await loadStore();
    const owner = await createWorkspace(makeHandle('Owner'));
    const targetHandle = makeHandle('Target');
    const target = await createWorkspace(targetHandle);
    await disconnectWorkspace(target.workspaceId);
    const selected = makeHandle('Selected', { marker: markerJson(owner.workspaceId) });

    await expect(updateWorkspaceHandle(target.workspaceId, selected)).rejects.toMatchObject({
      name: 'WorkspaceIdentityConflictError',
      code: 'marker-owned-by-another-workspace',
      conflictingWorkspaceId: owner.workspaceId,
    });
    expect(await getWorkspace(target.workspaceId)).toBeUndefined();
    expect(readMarker(selected)?.['workspaceId']).toBe(owner.workspaceId);
  });

  it('writes the target marker when exact reconnect selects an unmarked folder', async () => {
    const { createWorkspace, disconnectWorkspace, getWorkspace, updateWorkspaceHandle } = await loadStore();
    const target = await createWorkspace(makeHandle('Target'));
    await disconnectWorkspace(target.workspaceId);
    const replacement = makeHandle('Replacement');

    await updateWorkspaceHandle(target.workspaceId, replacement);

    const reconnected = await getWorkspace(target.workspaceId);
    expect(reconnected?.handle).toBe(replacement);
    expect(readMarker(replacement)).toMatchObject({ workspaceId: target.workspaceId, slug: target.slug });
  });
});

describe('workspace binding repair', () => {
  it('atomically moves verified bindings and preference to the connected canonical workspace', async () => {
    const {
      applyProjectFileSystemConfigChanges,
      createWorkspace,
      disconnectWorkspace,
      getProjectCreationLocation,
      listProjectsForWorkspace,
      listWorkspaces,
      repairWorkspaceBindings,
      setProjectCreationLocation,
    } = await loadStore();
    const canonicalHandle = makeHandle('Canonical');
    const canonical = await createWorkspace(canonicalHandle);
    const sourceHandle = makeHandle('Previous');
    const source = await createWorkspace(sourceHandle);
    await disconnectWorkspace(source.workspaceId);
    const configs = [
      {
        projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
        backend: 'webaccess',
        workspaceId: source.workspaceId,
        providerBasePath: 'alpha',
      },
      {
        projectId: 'proj_bbbbbbbbbbbbbbbbbbbbb',
        backend: 'webaccess',
        workspaceId: source.workspaceId,
        providerBasePath: 'beta',
      },
    ] as const satisfies readonly HandleStore.ProjectFileSystemConfig[];
    await applyProjectFileSystemConfigChanges({ upserts: configs, deletes: [] });
    await setProjectCreationLocation({ kind: 'workspace', workspaceId: source.workspaceId });
    const canonicalMarker = readMarker(canonicalHandle);
    const sourceMarker = readMarker(sourceHandle);

    const result = await repairWorkspaceBindings({
      canonicalWorkspaceId: canonical.workspaceId,
      repairs: configs.map(({ projectId, workspaceId: sourceWorkspaceId, providerBasePath }) => ({
        projectId,
        sourceWorkspaceId,
        providerBasePath,
      })),
    });

    expect(result).toEqual({
      repairedProjectCount: 2,
      removedWorkspaceIds: [source.workspaceId],
      skipped: [],
    });
    expect(await listProjectsForWorkspace(canonical.workspaceId)).toEqual(
      configs.map((config) => ({ ...config, workspaceId: canonical.workspaceId })),
    );
    expect(await listWorkspaces()).toEqual([expect.objectContaining({ workspaceId: canonical.workspaceId })]);
    expect(await getProjectCreationLocation({ webAccessSupported: true })).toEqual({
      location: { kind: 'workspace', workspaceId: canonical.workspaceId },
      repaired: undefined,
    });
    expect(readMarker(canonicalHandle)).toEqual(canonicalMarker);
    expect(readMarker(sourceHandle)).toEqual(sourceMarker);
  });

  it('leaves every store unchanged when any candidate changed before commit', async () => {
    const {
      applyProjectFileSystemConfigChanges,
      createWorkspace,
      disconnectWorkspace,
      getAllProjectFileSystemConfigs,
      listWorkspaces,
      repairWorkspaceBindings,
    } = await loadStore();
    const canonical = await createWorkspace(makeHandle('Canonical'));
    const source = await createWorkspace(makeHandle('Previous'));
    await disconnectWorkspace(source.workspaceId);
    const configs = [
      {
        projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
        backend: 'webaccess',
        workspaceId: source.workspaceId,
        providerBasePath: 'alpha',
      },
      {
        projectId: 'proj_bbbbbbbbbbbbbbbbbbbbb',
        backend: 'webaccess',
        workspaceId: source.workspaceId,
        providerBasePath: 'beta',
      },
    ] as const satisfies readonly HandleStore.ProjectFileSystemConfig[];
    await applyProjectFileSystemConfigChanges({ upserts: configs, deletes: [] });

    const result = await repairWorkspaceBindings({
      canonicalWorkspaceId: canonical.workspaceId,
      repairs: [
        { projectId: configs[0].projectId, sourceWorkspaceId: source.workspaceId, providerBasePath: 'alpha' },
        { projectId: configs[1].projectId, sourceWorkspaceId: source.workspaceId, providerBasePath: 'changed' },
      ],
    });

    expect(result.repairedProjectCount).toBe(0);
    expect(result.skipped).toEqual([{ projectId: configs[1].projectId, reason: 'config-changed' }]);
    expect(await getAllProjectFileSystemConfigs()).toEqual(configs);
    const workspaces = await listWorkspaces();
    expect(workspaces.map(({ workspaceId }) => workspaceId)).toEqual(
      expect.arrayContaining([canonical.workspaceId, source.workspaceId]),
    );
  });
});

describe('project creation location preference', () => {
  const preferenceKey = 'project-creation-location';

  it('uses Home when no preference exists', async () => {
    const { getProjectCreationLocation } = await loadStore();

    await expect(getProjectCreationLocation({ webAccessSupported: true })).resolves.toEqual({
      location: { kind: 'home' },
      repaired: undefined,
    });
  });

  it('round-trips Home and exact workspace locations', async () => {
    const { createWorkspace, getProjectCreationLocation, setProjectCreationLocation } = await loadStore();
    const workspace = await createWorkspace(makeHandle('Workshop'));

    await setProjectCreationLocation({ kind: 'workspace', workspaceId: workspace.workspaceId });
    await expect(getProjectCreationLocation({ webAccessSupported: true })).resolves.toEqual({
      location: { kind: 'workspace', workspaceId: workspace.workspaceId },
      repaired: undefined,
    });

    await setProjectCreationLocation({ kind: 'home' });
    await expect(getProjectCreationLocation({ webAccessSupported: true })).resolves.toEqual({
      location: { kind: 'home' },
      repaired: undefined,
    });
  });

  it.each([
    [{ kind: 'workspace', workspaceId: 'project_wrong' }, 'invalid'],
    [{ kind: 'workspace', workspaceId: 'wsp_unknown' }, 'unknown-workspace'],
  ] as const)('repairs malformed or stale metadata %# to Home', async (location, reason) => {
    const { getProjectCreationLocation } = await loadStore();
    await getProjectCreationLocation({ webAccessSupported: true });
    await rawWriteMeta({ key: preferenceKey, location });

    await expect(getProjectCreationLocation({ webAccessSupported: true })).resolves.toEqual({
      location: { kind: 'home' },
      repaired: reason,
    });
    expect(await rawReadMeta(preferenceKey)).toEqual({ key: preferenceKey, location: { kind: 'home' } });
  });

  it('repairs a disk preference to Home when folder access is unsupported', async () => {
    const { createWorkspace, getProjectCreationLocation, setProjectCreationLocation } = await loadStore();
    const workspace = await createWorkspace(makeHandle('Workshop'));
    await setProjectCreationLocation({ kind: 'workspace', workspaceId: workspace.workspaceId });

    await expect(getProjectCreationLocation({ webAccessSupported: false })).resolves.toEqual({
      location: { kind: 'home' },
      repaired: 'unsupported',
    });
    expect(await rawReadMeta(preferenceKey)).toEqual({ key: preferenceKey, location: { kind: 'home' } });
  });

  it('keeps a known workspace selected when only its handle is missing', async () => {
    const { createWorkspace, getProjectCreationLocation, setProjectCreationLocation } = await loadStore();
    const workspace = await createWorkspace(makeHandle('Workshop'));
    await setProjectCreationLocation({ kind: 'workspace', workspaceId: workspace.workspaceId });
    await rawDeleteHandle(workspace.workspaceId);

    await expect(getProjectCreationLocation({ webAccessSupported: true })).resolves.toEqual({
      location: { kind: 'workspace', workspaceId: workspace.workspaceId },
      repaired: undefined,
    });
  });

  it('serializes concurrent preference writes in transaction creation order', async () => {
    const { createWorkspace, getProjectCreationLocation, setProjectCreationLocation } = await loadStore();
    const workspace = await createWorkspace(makeHandle('Workshop'));

    await Promise.all([
      setProjectCreationLocation({ kind: 'workspace', workspaceId: workspace.workspaceId }),
      setProjectCreationLocation({ kind: 'home' }),
    ]);

    await expect(getProjectCreationLocation({ webAccessSupported: true })).resolves.toEqual({
      location: { kind: 'home' },
      repaired: undefined,
    });
  });
});

describe('project-root configuration broadcasts', () => {
  it('does not broadcast preference-only writes', async () => {
    const { setProjectCreationLocation } = await loadStore();
    const channel = new BroadcastChannel(`${appMetaConfig.databasePrefix}project-root-configuration`);
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    const listener = vi.fn();
    channel.addEventListener('message', listener);

    await setProjectCreationLocation({ kind: 'home' });
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(listener).not.toHaveBeenCalled();
    channel.close();
  });

  it('coalesces a burst of durable writes into one cross-tab notification', async () => {
    const { setProjectFileSystemConfig } = await loadStore();
    const channel = new BroadcastChannel(`${appMetaConfig.databasePrefix}project-root-configuration`);
    // Let notifications still pending from earlier tests in this file drain.
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    let messages = 0;
    channel.addEventListener('message', () => {
      messages++;
    });

    /* oxlint-disable no-await-in-loop -- The burst must be sequential to reproduce the per-write publish. */
    for (let index = 0; index < 5; index++) {
      await setProjectFileSystemConfig({
        projectId: `proj_00000000000000000000${index}`,
        backend: 'indexeddb',
        providerBasePath: `project-${index}`,
      });
    }
    /* oxlint-enable no-await-in-loop */
    await vi.waitFor(() => {
      expect(messages).toBeGreaterThan(0);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    expect(messages).toBe(1);
    channel.close();
  });

  it('broadcasts successful disconnects and restores but not no-ops', async () => {
    const { createWorkspace, disconnectWorkspace, restoreWorkspaceHandle } = await loadStore();
    const workspace = await createWorkspace(makeHandle('Workshop'));
    const channel = new BroadcastChannel(`${appMetaConfig.databasePrefix}project-root-configuration`);
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    const listener = vi.fn();
    channel.addEventListener('message', listener);

    const disconnected = await disconnectWorkspace(workspace.workspaceId);
    if (!disconnected) {
      throw new Error('Expected workspace to disconnect');
    }
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1);
    });

    await restoreWorkspaceHandle(workspace.workspaceId, disconnected.handle);
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(2);
    });

    await disconnectWorkspace(workspace.workspaceId);
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(3);
    });
    await disconnectWorkspace(workspace.workspaceId);
    await disconnectWorkspace('wsp_unknown');
    await restoreWorkspaceHandle('wsp_unknown', disconnected.handle);
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(listener).toHaveBeenCalledTimes(3);
    channel.close();
  });
});

// ===========================================================================
// Desktop resilient startup (WP2): open deadline and a degraded Home-only configuration
// ===========================================================================

/** An `indexedDB` whose open requests never fire an event, as a wedged profile can leave them (B31). */
const stubSilentIndexedDb = (): ReturnType<typeof vi.fn> => {
  const open = vi.fn(() => new EventTarget());
  vi.stubGlobal('indexedDB', { open });
  return open;
};

/** An `indexedDB` whose open fails with a named DOM error, as an older build opening a newer profile does (B5). */
const stubFailingIndexedDb = (name: string): void => {
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = new EventTarget() as EventTarget & { error: DOMException };
      request.error = new DOMException('The requested version is less than the existing version.', name);
      queueMicrotask(() => {
        request.dispatchEvent(new Event('error'));
      });
      return request;
    },
  });
};

const desktopHomeRoot = '/Users/tester/Library/Application Support/Tau/home';

const installDesktop = (list: () => Promise<string[]>): void => {
  buildTarget.desktop = true;
  vi.stubGlobal('tau', {
    nodeFs: { homeRoot: desktopHomeRoot, connect: async () => new MessageChannel().port1 },
    dialog: { selectDirectory: vi.fn() },
    directories: { list, onChange: () => () => undefined },
  });
};

describe('database open deadline', () => {
  it('should reject a handle database open that fires no event at 5 000 ms, and open again on the next read', async () => {
    vi.resetModules();
    const store = await import('#filesystem/handle-store.js');
    vi.useFakeTimers();
    const open = stubSilentIndexedDb();

    const first = store.getAllProjectFileSystemConfigs();
    const settled = expect(first).rejects.toMatchObject({ name: 'DatabaseOpenTimeoutError' });
    await vi.advanceTimersByTimeAsync(4999);
    expect(open).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await settled;

    const second = store.getAllProjectFileSystemConfigs();
    const secondSettled = expect(second).rejects.toMatchObject({ name: 'DatabaseOpenTimeoutError' });
    expect(open).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    await secondSettled;
  });
});

describe('readProjectRootConfigs', () => {
  it('should start Home alone, marked degraded, when the records cannot be read on the desktop', async () => {
    installDesktop(async () => ['/Users/tester/Projects/Workshop']);
    vi.resetModules();
    const { readProjectRootConfigs } = await import('#filesystem/handle-store.js');
    stubFailingIndexedDb('VersionError');

    const read = await readProjectRootConfigs();

    expect(read.configuration).toEqual({ projects: [], roots: [{ backend: 'node', path: desktopHomeRoot }] });
    expect(read.degraded).toEqual({ input: 'records', errorName: 'VersionError' });
  });

  it('should start Home alone, marked degraded, when the grant list cannot be read', async () => {
    installDesktop(async () => {
      throw new Error('The services utility is not answering');
    });
    vi.resetModules();
    const { readProjectRootConfigs } = await import('#filesystem/handle-store.js');

    const read = await readProjectRootConfigs();

    expect(read.configuration.roots).toEqual([{ backend: 'node', path: desktopHomeRoot }]);
    expect(read.degraded).toEqual({ input: 'grants', errorName: 'Error' });
  });

  it('should return the full configuration, not degraded, when every input reads', async () => {
    stubStorage({});
    const { readProjectRootConfigs, getProjectRootConfigs } = await loadStore();

    const read = await readProjectRootConfigs();

    expect(read.degraded).toBeUndefined();
    expect(read.configuration).toEqual(await getProjectRootConfigs());
  });
});

// ===========================================================================
// Desktop resilient startup WP3 — Remove from Tau, creation location, overlap
// ===========================================================================

const projectId = (index: number): string => `proj_${String(index).padStart(21, '0')}`;

describe('removeWorkspace', () => {
  it('should delete the row, its handle and its bindings in one transaction without touching files', async () => {
    const { applyProjectFileSystemConfigChanges, createWorkspace, getAllProjectFileSystemConfigs, removeWorkspace } =
      await loadStore();
    const handle = makeHandle('Workshop');
    const removeEntry = vi.fn();
    const getFileHandle = vi.spyOn(handle, 'getFileHandle');
    const getDirectoryHandle = vi.spyOn(handle, 'getDirectoryHandle');
    Object.defineProperty(handle, 'removeEntry', { value: removeEntry });
    const removed = await createWorkspace(handle);
    const kept = await createWorkspace(makeHandle('Studio'));
    const keptBinding = {
      projectId: projectId(3),
      backend: 'webaccess',
      workspaceId: kept.workspaceId,
      providerBasePath: 'kept',
    } as const;
    await applyProjectFileSystemConfigChanges({
      upserts: [
        { projectId: projectId(1), backend: 'webaccess', workspaceId: removed.workspaceId, providerBasePath: 'one' },
        { projectId: projectId(2), backend: 'webaccess', workspaceId: removed.workspaceId, providerBasePath: 'two' },
        keptBinding,
      ],
      deletes: [],
    });
    const keptRow = await rawReadWorkspace(kept.workspaceId);
    getFileHandle.mockClear();
    getDirectoryHandle.mockClear();
    const transaction = vi.spyOn(FakeIDBDatabase.prototype, 'transaction');

    await expect(removeWorkspace(removed.workspaceId)).resolves.toBe(true);

    const writes = transaction.mock.calls.filter(([, mode]) => mode === 'readwrite');
    expect(writes).toHaveLength(1);
    const scope = writes[0]![0];
    const stores = typeof scope === 'string' ? [scope] : [...scope];
    expect(stores.toSorted((left, right) => left.localeCompare(right))).toEqual(['configs', 'handles', 'workspaces']);
    transaction.mockRestore();
    expect(await rawReadWorkspace(removed.workspaceId)).toBeUndefined();
    expect(await rawReadHandle(removed.workspaceId)).toBeUndefined();
    expect(await getAllProjectFileSystemConfigs()).toEqual([keptBinding]);
    expect(await rawReadWorkspace(kept.workspaceId)).toEqual(keptRow);
    expect(await rawReadHandle(kept.workspaceId)).toBeDefined();
    expect(removeEntry).not.toHaveBeenCalled();
    expect(getFileHandle).not.toHaveBeenCalled();
    expect(getDirectoryHandle).not.toHaveBeenCalled();
  });

  it('should delete the node bindings that name the removed folder and keep the others', async () => {
    const { createNodeWorkspace, getAllProjectFileSystemConfigs, removeWorkspace, setProjectFileSystemConfig } =
      await loadStore();
    const removed = await createNodeWorkspace('/Users/tester/Scratch');
    await createNodeWorkspace('/Users/tester/Studio');
    const kept = {
      projectId: projectId(3),
      backend: 'node',
      path: '/Users/tester/Studio',
      providerBasePath: 'kept',
    } as const;
    const home = { projectId: projectId(4), backend: 'node', providerBasePath: 'home-project' } as const;
    await setProjectFileSystemConfig({
      projectId: projectId(1),
      backend: 'node',
      path: '/Users/tester/Scratch',
      providerBasePath: 'one',
    });
    await setProjectFileSystemConfig({
      projectId: projectId(2),
      backend: 'node',
      path: '/Users/tester/Scratch',
      providerBasePath: 'two',
    });
    await setProjectFileSystemConfig(kept);
    await setProjectFileSystemConfig(home);

    await expect(removeWorkspace(removed.workspaceId)).resolves.toBe(true);

    expect(await rawReadWorkspace(removed.workspaceId)).toBeUndefined();
    const remaining = await getAllProjectFileSystemConfigs();
    expect(remaining.toSorted((left, right) => left.projectId.localeCompare(right.projectId))).toEqual([kept, home]);
  });

  it('should report an unknown workspace without writing', async () => {
    const { removeWorkspace } = await loadStore();

    await expect(removeWorkspace('wsp_unknown')).resolves.toBe(false);
  });
});

describe('project creation location while its folder is unavailable', () => {
  const preferenceKey = 'project-creation-location';

  it('should create in Home and keep the stored folder while that folder is not found', async () => {
    const { createNodeWorkspace, getProjectCreationLocation, setProjectCreationLocation } = await loadStore();
    const workspace = await createNodeWorkspace('/Users/tester/Workshop');
    await setProjectCreationLocation({ kind: 'workspace', workspaceId: workspace.workspaceId });

    await expect(
      getProjectCreationLocation({
        webAccessSupported: true,
        rootStatuses: [
          { storageRootKey: 'node:/Users/tester/Workshop', backend: 'node', state: 'notFound', code: 'ENOENT' },
        ],
      }),
    ).resolves.toEqual({ location: { kind: 'home' }, repaired: 'workspace-unavailable' });
    expect(await rawReadMeta(preferenceKey)).toEqual({
      key: preferenceKey,
      location: { kind: 'workspace', workspaceId: workspace.workspaceId },
    });

    await expect(
      getProjectCreationLocation({
        webAccessSupported: true,
        rootStatuses: [{ storageRootKey: 'node:/Users/tester/Workshop', backend: 'node', state: 'available' }],
      }),
    ).resolves.toEqual({ location: { kind: 'workspace', workspaceId: workspace.workspaceId }, repaired: undefined });
  });
});

describe('node workspace overlap', () => {
  const homeRoot = '/Users/tester/Library/Application Support/Tau/home';

  beforeEach(() => {
    vi.stubGlobal('tau', {
      nodeFs: { homeRoot, connect: async () => new MessageChannel().port1 },
      directories: { list: async () => [], onChange: () => () => undefined },
    });
  });

  it.each([
    ['equal to Home', homeRoot],
    ['containing Home', '/Users/tester/Library/Application Support/Tau'],
    ['inside Home', `${homeRoot}/Nested`],
    ['containing another workspace', '/Users/tester'],
    ['inside another workspace', '/Users/tester/Workshop/Parts'],
    ['inside another workspace on Windows', String.raw`C:\Users\tester\Studio\Parts`],
  ])('should refuse a folder %s', async (_case, path) => {
    buildTarget.desktop = true;
    const store = await loadStore();
    await store.createNodeWorkspace('/Users/tester/Workshop');
    await store.createNodeWorkspace(String.raw`C:\Users\tester\Studio`);
    const before = await store.listWorkspaces();

    await expect(store.createNodeWorkspace(path)).rejects.toMatchObject({ name: 'WorkspaceOverlapError' });
    expect(await store.listWorkspaces()).toEqual(before);
  });

  it('should still re-adopt the same folder and admit a sibling', async () => {
    buildTarget.desktop = true;
    const store = await loadStore();
    const first = await store.createNodeWorkspace('/Users/tester/Workshop');

    await expect(store.createNodeWorkspace('/Users/tester/Workshop/')).resolves.toMatchObject({
      workspaceId: first.workspaceId,
      minted: false,
    });
    await expect(store.createNodeWorkspace('/Users/tester/Workshop Two')).resolves.toMatchObject({ minted: true });
  });
});

describe('relinkWorkspace (Locate)', () => {
  const homeRoot = '/Users/tester/Library/Application Support/Tau/home';
  const oldPath = '/Users/tester/Workshop';
  const newPath = '/Volumes/Archive/Workshop Moved';

  type Store = typeof HandleStore;
  type Evidence = Awaited<ReturnType<HandleStore.RelinkPorts['readEvidence']>>;

  const evidence = (overrides: Partial<Evidence> = {}): Evidence => ({
    marker: undefined,
    projects: [],
    subfolders: [],
    ...overrides,
  });

  const ports = (found: Evidence) => ({
    readEvidence: vi.fn<HandleStore.RelinkPorts['readEvidence']>(async () => found),
    revokeGrant: vi.fn<(path: string) => Promise<void>>(async () => undefined),
  });

  /** A node workspace at {@link oldPath} with the given projects bound to it, plus Studio as another workspace. */
  const seed = async (
    store: Store,
    bound: ReadonlyArray<{ readonly id: string; readonly directory: string }>,
  ): Promise<HandleStore.Workspace> => {
    const workspace = await store.createNodeWorkspace(oldPath);
    await store.createNodeWorkspace('/Users/tester/Studio');
    for (const project of bound) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Seeding rows in order.
      await store.setProjectFileSystemConfig({
        projectId: project.id,
        backend: 'node',
        path: oldPath,
        providerBasePath: project.directory,
      });
    }
    return workspace;
  };

  const nodeConfigs = async (store: Store): Promise<Array<Record<string, unknown>>> =>
    ((await store.getAllProjectFileSystemConfigs()) as Array<Record<string, unknown>>).toSorted((left, right) =>
      String(left['projectId']).localeCompare(String(right['projectId'])),
    );

  beforeEach(() => {
    buildTarget.desktop = true;
    vi.stubGlobal('tau', {
      nodeFs: { homeRoot, connect: async () => new MessageChannel().port1 },
      directories: { list: async () => [], onChange: () => () => undefined },
    });
  });

  afterEach(() => {
    buildTarget.desktop = false;
  });

  describe('evidence rules (T-R4.1)', () => {
    it('should relink with no prompt when the folder carries a marker naming this workspace', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [
        { id: projectId(1), directory: 'gearbox' },
        { id: projectId(2), directory: 'bracket' },
      ]);
      const found = evidence({
        marker: {
          $schema: workspaceMarkerSchemaUrl,
          workspaceId: workspace.workspaceId,
          slug: 'workshop',
          createdAt: '2026-07-24T00:11:47.808Z',
        },
      });

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: newPath, wasGranted: false },
        ports(found),
      );

      expect(result).toMatchObject({ status: 'relinked' });
      expect(await rawReadWorkspace(workspace.workspaceId)).toMatchObject({ path: newPath });
    });

    it('should relink with no prompt when every bound project is found', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [
        { id: projectId(1), directory: 'gearbox' },
        { id: projectId(2), directory: 'bracket' },
      ]);
      const found = evidence({
        projects: [
          { projectId: projectId(1), directory: 'gearbox' },
          { projectId: projectId(2), directory: 'bracket' },
        ],
      });

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: newPath, wasGranted: false },
        ports(found),
      );

      expect(result).toMatchObject({ status: 'relinked', matched: 2, unmatched: [] });
      expect(await nodeConfigs(store)).toEqual([
        { projectId: projectId(1), backend: 'node', path: newPath, providerBasePath: 'gearbox' },
        { projectId: projectId(2), backend: 'node', path: newPath, providerBasePath: 'bracket' },
      ]);
    });

    it('should ask for confirmation with the counts and write nothing when only some projects are found', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [
        { id: projectId(1), directory: 'gearbox' },
        { id: projectId(2), directory: 'bracket' },
        { id: projectId(3), directory: 'hinge' },
      ]);
      const before = await rawReadWorkspace(workspace.workspaceId);
      const configsBefore = await nodeConfigs(store);
      const found = evidence({ projects: [{ projectId: projectId(1), directory: 'gearbox' }] });

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: newPath, wasGranted: false },
        ports(found),
      );

      expect(result).toEqual({ status: 'confirm', matched: 1, total: 3 });
      expect(await rawReadWorkspace(workspace.workspaceId)).toEqual(before);
      expect(await nodeConfigs(store)).toEqual(configsBefore);

      const confirmed = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: newPath, wasGranted: false },
        { ...ports(found), confirmed: true },
      );
      expect(confirmed).toMatchObject({ status: 'relinked', matched: 1, unmatched: [projectId(2), projectId(3)] });
      /* An unmatched project keeps its binding; it is never dropped silently. */
      expect(await nodeConfigs(store)).toEqual([
        { projectId: projectId(1), backend: 'node', path: newPath, providerBasePath: 'gearbox' },
        { projectId: projectId(2), backend: 'node', path: oldPath, providerBasePath: 'bracket' },
        { projectId: projectId(3), backend: 'node', path: oldPath, providerBasePath: 'hinge' },
      ]);
    });

    it('should say the folder looks different when none of its projects match', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [{ id: projectId(1), directory: 'gearbox' }]);
      const before = await rawReadWorkspace(workspace.workspaceId);

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: newPath, wasGranted: false },
        ports(evidence({ projects: [{ projectId: projectId(9), directory: 'someone-else' }] })),
      );

      expect(result).toEqual({ status: 'confirm-different' });
      expect(await rawReadWorkspace(workspace.workspaceId)).toEqual(before);
    });

    it('should suggest the subfolder that holds every project when the parent was picked', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [
        { id: projectId(1), directory: 'gearbox' },
        { id: projectId(2), directory: 'bracket' },
      ]);
      const before = await rawReadWorkspace(workspace.workspaceId);

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: '/Volumes/Archive', wasGranted: false },
        ports(
          evidence({
            subfolders: [
              { name: 'Other', projects: [{ projectId: projectId(9), directory: 'other' }] },
              {
                name: 'Workshop Moved',
                projects: [
                  { projectId: projectId(1), directory: 'gearbox' },
                  { projectId: projectId(2), directory: 'bracket' },
                ],
              },
            ],
          }),
        ),
      );

      expect(result).toEqual({ status: 'suggest-subfolder', name: 'Workshop Moved' });
      expect(await rawReadWorkspace(workspace.workspaceId)).toEqual(before);
    });

    it('should match a renamed project folder by its manifest id and move its provider path', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [{ id: projectId(1), directory: 'gearbox' }]);

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: newPath, wasGranted: false },
        ports(evidence({ projects: [{ projectId: projectId(1), directory: 'gearbox-v2' }] })),
      );

      expect(result).toMatchObject({ status: 'relinked', matched: 1 });
      expect(await nodeConfigs(store)).toEqual([
        { projectId: projectId(1), backend: 'node', path: newPath, providerBasePath: 'gearbox-v2' },
      ]);
    });

    it('should resolve two folders with one id by the old directory name, or leave the project unmatched', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [
        { id: projectId(1), directory: 'gearbox' },
        { id: projectId(2), directory: 'bracket' },
      ]);

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: newPath, wasGranted: false },
        {
          ...ports(
            evidence({
              projects: [
                { projectId: projectId(1), directory: 'gearbox' },
                { projectId: projectId(1), directory: 'gearbox copy' },
                { projectId: projectId(2), directory: 'bracket-a' },
                { projectId: projectId(2), directory: 'bracket-b' },
              ],
            }),
          ),
          confirmed: true,
        },
      );

      expect(result).toMatchObject({ status: 'relinked', matched: 1, unmatched: [projectId(2)] });
      expect(await nodeConfigs(store)).toEqual([
        { projectId: projectId(1), backend: 'node', path: newPath, providerBasePath: 'gearbox' },
        { projectId: projectId(2), backend: 'node', path: oldPath, providerBasePath: 'bracket' },
      ]);
    });
  });

  describe('refusals (T-R4.2)', () => {
    it.each([
      ['Home', homeRoot, 'home'],
      ['another workspace', '/Users/tester/Studio/Parts', 'workspace-overlap'],
      ['the data directory', '/Users/tester/Library/Application Support/Tau/filesystem-authority', 'data-directory'],
    ] as const)('should refuse a target that overlaps %s', async (_case, path, reason) => {
      const store = await loadStore();
      const workspace = await seed(store, [{ id: projectId(1), directory: 'gearbox' }]);
      const rowsBefore = await store.listWorkspaces();
      const configsBefore = await nodeConfigs(store);
      const relinkPorts = ports(evidence({ projects: [{ projectId: projectId(1), directory: 'gearbox' }] }));

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path, wasGranted: false },
        relinkPorts,
      );

      expect(result).toEqual({ status: 'refused', reason });
      expect(await store.listWorkspaces()).toEqual(rowsBefore);
      expect(await nodeConfigs(store)).toEqual(configsBefore);
      expect(relinkPorts.revokeGrant).toHaveBeenCalledWith(path);
    });

    it('should refuse a folder marked for another workspace', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [{ id: projectId(1), directory: 'gearbox' }]);
      const rowsBefore = await store.listWorkspaces();
      const relinkPorts = ports(
        evidence({
          marker: {
            $schema: workspaceMarkerSchemaUrl,
            workspaceId: 'wsp_someoneElse000000000',
            slug: 'elsewhere',
            createdAt: '2026-07-24T00:11:47.808Z',
          },
          projects: [{ projectId: projectId(1), directory: 'gearbox' }],
        }),
      );

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: newPath, wasGranted: false },
        relinkPorts,
      );

      expect(result).toEqual({ status: 'refused', reason: 'marker-owned-by-another-workspace' });
      expect(await store.listWorkspaces()).toEqual(rowsBefore);
      expect(relinkPorts.revokeGrant).toHaveBeenCalledWith(newPath);
    });

    it('should keep a grant the folder held before the pick', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [{ id: projectId(1), directory: 'gearbox' }]);
      const relinkPorts = ports(evidence());

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: '/Users/tester/Studio', wasGranted: true },
        relinkPorts,
      );

      expect(result).toEqual({ status: 'refused', reason: 'workspace-overlap' });
      expect(relinkPorts.revokeGrant).not.toHaveBeenCalled();
    });
  });

  describe('atomicity and order (T-R4.3)', () => {
    it('should change no row when the commit aborts halfway', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [
        { id: projectId(1), directory: 'gearbox' },
        { id: projectId(2), directory: 'bracket' },
      ]);
      const before = await rawReadWorkspace(workspace.workspaceId);
      const configsBefore = await nodeConfigs(store);
      const relinkPorts = ports(
        evidence({
          projects: [
            { projectId: projectId(1), directory: 'gearbox' },
            { projectId: projectId(2), directory: 'bracket' },
          ],
        }),
      );
      const { put } = FakeIDBObjectStore.prototype;
      let puts = 0;
      const failing = vi.spyOn(FakeIDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore['put']>
      ) {
        puts += 1;
        if (this.name === 'configs' && puts === 3) {
          throw new DOMException('The disk is full', 'QuotaExceededError');
        }
        return put.apply(this, args);
      });

      await expect(
        store.relinkWorkspace(
          workspace.workspaceId,
          { backend: 'node', path: newPath, wasGranted: false },
          relinkPorts,
        ),
      ).rejects.toThrow();
      failing.mockRestore();

      expect(await rawReadWorkspace(workspace.workspaceId)).toEqual(before);
      expect(await nodeConfigs(store)).toEqual(configsBefore);
      expect(relinkPorts.revokeGrant).not.toHaveBeenCalledWith(oldPath);
    });

    it('should keep the workspace id, re-allocate the slug and revoke the old grant only after the commit', async () => {
      const store = await loadStore();
      const workspace = await seed(store, [{ id: projectId(1), directory: 'gearbox' }]);
      const seen: Array<Record<string, unknown> | undefined> = [];
      const relinkPorts = ports(evidence({ projects: [{ projectId: projectId(1), directory: 'gearbox' }] }));
      relinkPorts.revokeGrant.mockImplementation(async () => {
        seen.push(await rawReadWorkspace(workspace.workspaceId));
      });

      const result = await store.relinkWorkspace(
        workspace.workspaceId,
        { backend: 'node', path: newPath, wasGranted: false },
        relinkPorts,
      );

      expect(result).toMatchObject({ status: 'relinked', workspace: { workspaceId: workspace.workspaceId } });
      const row = await rawReadWorkspace(workspace.workspaceId);
      expect(row).toMatchObject({ workspaceId: workspace.workspaceId, path: newPath, slug: 'workshop-moved' });
      expect(relinkPorts.revokeGrant).toHaveBeenCalledOnce();
      expect(relinkPorts.revokeGrant).toHaveBeenCalledWith(oldPath);
      expect(seen).toEqual([expect.objectContaining({ path: newPath })]);
    });
  });
});

describe('node workspace marker (T-R4.4)', () => {
  it("should write .tau/workspace.json through the file service with the workspace's id", async () => {
    const store = await loadStore();
    const workspace = await store.createNodeWorkspace('/Users/tester/Workshop');
    const written: string[] = [];

    const outcome = await store.syncNodeWorkspaceMarker(workspace, {
      read: async () => undefined,
      write: async (content) => {
        written.push(content);
      },
    });

    expect(outcome).toBe('written');
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0]!)).toMatchObject({
      $schema: workspaceMarkerSchemaUrl,
      workspaceId: workspace.workspaceId,
      slug: workspace.slug,
    });
  });

  it('should skip a read-only folder without an error', async () => {
    const store = await loadStore();
    const workspace = await store.createNodeWorkspace('/Users/tester/Workshop');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      store.syncNodeWorkspaceMarker(workspace, {
        read: async () => undefined,
        write: async () => {
          throw new DOMException('The request is not allowed', 'NotAllowedError');
        },
      }),
    ).resolves.toBe('skipped');
    warn.mockRestore();
  });

  it('should leave a marker that already names the workspace untouched', async () => {
    const store = await loadStore();
    const workspace = await store.createNodeWorkspace('/Users/tester/Workshop');
    const write = vi.fn(async () => undefined);

    await expect(
      store.syncNodeWorkspaceMarker(workspace, {
        read: async () => markerJson(workspace.workspaceId, workspace.slug),
        write,
      }),
    ).resolves.toBe('unchanged');
    expect(write).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Desktop resilient startup (WP9): Home's engine mirror and the folder list from the grants
// ===========================================================================

const homeBackendMirrorKey = 'tau:home-backend';

/*
 * T-B5.4 (B5, R7): Home's pin is mirrored to `localStorage` at pin time and on every read of it, and the mirror is
 * read only when the database cannot be opened. On the desktop with no mirror Home is node, its engine by build; on
 * the web with no mirror nothing is guessed (row S37).
 */
describe('Home engine mirror', () => {
  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('should write the mirror when Home is pinned', async () => {
    const { pinHomeStorageBackend } = await loadStore();

    await pinHomeStorageBackend('opfs');

    expect(globalThis.localStorage.getItem(homeBackendMirrorKey)).toBe('opfs');
  });

  it('should refresh the mirror on a read of the pin', async () => {
    const { getHomeStorageBackend, pinHomeStorageBackend } = await loadStore();
    await pinHomeStorageBackend('opfs');
    globalThis.localStorage.removeItem(homeBackendMirrorKey);

    await expect(getHomeStorageBackend()).resolves.toBe('opfs');

    expect(globalThis.localStorage.getItem(homeBackendMirrorKey)).toBe('opfs');
  });

  it('should take Home from the mirror when the database cannot be opened', async () => {
    globalThis.localStorage.setItem(homeBackendMirrorKey, 'opfs');
    vi.resetModules();
    const { getHomeStorageBackend } = await import('#filesystem/handle-store.js');
    stubFailingIndexedDb('VersionError');

    await expect(getHomeStorageBackend()).resolves.toBe('opfs');
  });

  it('should start desktop Home on node when the database cannot be opened and no mirror exists', async () => {
    installDesktop(async () => []);
    vi.resetModules();
    const { getHomeStorageBackend } = await import('#filesystem/handle-store.js');
    stubFailingIndexedDb('UnknownError');

    await expect(getHomeStorageBackend()).resolves.toBe('node');
  });

  it('should guess no engine on the web when the database cannot be opened and no mirror exists', async () => {
    vi.resetModules();
    const { getHomeStorageBackend } = await import('#filesystem/handle-store.js');
    stubFailingIndexedDb('VersionError');

    await expect(getHomeStorageBackend()).rejects.toMatchObject({ name: 'VersionError' });
  });

  it('should ignore a mirror that names no engine', async () => {
    globalThis.localStorage.setItem(homeBackendMirrorKey, 'floppy');
    vi.resetModules();
    const { getHomeStorageBackend } = await import('#filesystem/handle-store.js');
    stubFailingIndexedDb('VersionError');

    await expect(getHomeStorageBackend()).rejects.toMatchObject({ name: 'VersionError' });
  });
});

/*
 * T-B5.8 (R7): after a desktop reset the handle database starts empty, and each folder the grant file still holds gets
 * its workspace row back, with the id its `.tau/workspace.json` names when no other row holds it. A database that was
 * not just created adopts nothing: a grant without a row there is not this function's to restore.
 */
describe('folder list from the grants after a database reset', () => {
  const grantedPath = '/Users/tester/Projects/Workshop';
  const markedWorkspaceId = 'wsp_K3d9Qm2Lx7Vb4Np8Rt1Zs';

  const installGrants = (
    paths: string[],
    readMarker: (path: string) => Promise<string | undefined> = async () => undefined,
  ): ReturnType<typeof vi.fn> => {
    const read = vi.fn(readMarker);
    buildTarget.desktop = true;
    vi.stubGlobal('tau', {
      nodeFs: { homeRoot: desktopHomeRoot, connect: async () => new MessageChannel().port1 },
      dialog: { selectDirectory: vi.fn() },
      directories: { list: async () => paths, onChange: () => () => undefined, readMarker: read },
    });
    return read;
  };

  it('should adopt a granted folder under the id its marker names', async () => {
    const readMarker = installGrants([grantedPath], async (path) =>
      path === grantedPath ? markerJson(markedWorkspaceId, 'workshop') : undefined,
    );
    const { getProjectRootConfigs, listWorkspaces } = await loadStore();

    const configuration = await getProjectRootConfigs();

    const workspaces = await listWorkspaces();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({ workspaceId: markedWorkspaceId, path: grantedPath, name: 'Workshop' });
    expect(readMarker).toHaveBeenCalledWith(grantedPath);
    expect(configuration.roots).toContainEqual({ backend: 'node', path: grantedPath });
  });

  it('should adopt a granted folder with no marker under a new id', async () => {
    installGrants([grantedPath]);
    const { getProjectRootConfigs, listWorkspaces } = await loadStore();

    await getProjectRootConfigs();

    const workspaces = await listWorkspaces();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]?.path).toBe(grantedPath);
    expect(workspaces[0]?.workspaceId).toMatch(/^wsp_/u);
    expect(workspaces[0]?.workspaceId).not.toBe(markedWorkspaceId);
  });

  it('should give a second folder that names the same marker a new id', async () => {
    const copy = '/Users/tester/Projects/Workshop copy';
    installGrants([grantedPath, copy], async () => markerJson(markedWorkspaceId, 'workshop'));
    const { getProjectRootConfigs, listWorkspaces } = await loadStore();

    await getProjectRootConfigs();

    const workspaces = await listWorkspaces();
    expect(workspaces).toHaveLength(2);
    expect(workspaces.filter((workspace) => workspace.workspaceId === markedWorkspaceId)).toHaveLength(1);
  });

  it('should adopt nothing into a database that was not just created', async () => {
    const grants: string[] = [];
    installGrants(grants);
    const { getProjectRootConfigs } = await loadStore();
    await getProjectRootConfigs();
    /* A later launch over the same database: a grant with no row appears. */
    grants.push(grantedPath);
    vi.resetModules();
    const reloaded = await import('#filesystem/handle-store.js');

    await reloaded.getProjectRootConfigs();

    await expect(reloaded.listWorkspaces()).resolves.toEqual([]);
  });

  it('should adopt the folder list on a later read when the first one could not read the grants', async () => {
    let failing = true;
    buildTarget.desktop = true;
    vi.stubGlobal('tau', {
      nodeFs: { homeRoot: desktopHomeRoot, connect: async () => new MessageChannel().port1 },
      dialog: { selectDirectory: vi.fn() },
      directories: {
        list: async () => {
          if (failing) {
            throw new Error('The services utility is not answering');
          }
          return [grantedPath];
        },
        onChange: () => () => undefined,
        readMarker: async () => undefined,
      },
    });
    const { getProjectRootConfigs, listWorkspaces } = await loadStore();
    await expect(getProjectRootConfigs()).rejects.toThrow();
    failing = false;

    await getProjectRootConfigs();

    await expect(listWorkspaces()).resolves.toHaveLength(1);
  });
});
