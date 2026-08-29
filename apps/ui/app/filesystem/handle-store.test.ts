// oxlint-disable-next-line import/no-unassigned-import -- side-effect import polyfills IndexedDB for tests
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { workspaceMarkerPath, workspaceMarkerSchemaUrl } from '@taucad/types';
import { metaConfig } from '#constants/meta.constants.js';
import type * as HandleStore from '#filesystem/handle-store.js';

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
      const request = indexedDB.open(`${metaConfig.databasePrefix}fs-handles`, 3);
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
    const request = indexedDB.open(`${metaConfig.databasePrefix}fs-handles`, 4);
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

describe('createWorkspace persistent storage', () => {
  it('requests persistence once per connect and records the outcome', async () => {
    const persist = vi.fn(async () => true);
    const persisted = vi.fn(async () => false);
    stubStorage({ persist, persisted });
    const { createWorkspace } = await loadStore();

    const workspace = await createWorkspace(makeHandle('tau-workspace'));

    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(workspace.storagePersisted).toBe(true);
  });

  it('does not re-request persistence when it is already granted', async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persist, persisted: async () => true });
    const { createWorkspace } = await loadStore();

    const workspace = await createWorkspace(makeHandle('tau-workspace'));

    expect(persist).not.toHaveBeenCalled();
    expect(workspace.storagePersisted).toBe(true);
  });

  it('tolerates a browser without the Storage Manager API', async () => {
    stubStorage(undefined);
    const { createWorkspace } = await loadStore();

    const workspace = await createWorkspace(makeHandle('tau-workspace'));

    expect(workspace.storagePersisted).toBeUndefined();
  });
});

// ===========================================================================
// R6 — quota
// ===========================================================================

describe('storage quota errors', () => {
  it('maps a QuotaExceededError write failure to a typed workspace error', async () => {
    const { setProjectFileSystemConfig } = await loadStore();
    const { StorageQuotaExceededError: storageQuotaExceededErrorClass } =
      await import('#filesystem/workspace-errors.js');
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
    const channel = new BroadcastChannel(`${metaConfig.databasePrefix}project-root-configuration`);
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
    const channel = new BroadcastChannel(`${metaConfig.databasePrefix}project-root-configuration`);
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
    const channel = new BroadcastChannel(`${metaConfig.databasePrefix}project-root-configuration`);
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
