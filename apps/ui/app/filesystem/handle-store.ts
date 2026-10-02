/**
 * Handle, Workspace & Project-Config store.
 *
 * Persists `FileSystemDirectoryHandle` objects, workspace metadata, and
 * per-project filesystem configuration in a dedicated IndexedDB database
 * (`tau-fs-handles`, db schema v3).
 *
 * **Workspaces store** (`workspaces`, keyPath `workspaceId`):
 * Holds `{ workspaceId, name, isDefault, lastConnectedAt }` for every
 * connected directory the user has linked. Identity is a `wsp_*` id minted
 * via `generatePrefixedId(idPrefix.workspace)` — the runtime `wsp_*` shape
 * is enforced by `createWorkspace` being the only mint site (per the
 * workspaces-foundation policy in `docs/policy/filesystem-policy.md`
 * Rule 13b).
 *
 * **Handles store** (`handles`, key = `workspaceId`):
 * Stores the actual `FileSystemDirectoryHandle` per workspace. Structured
 * cloning lets it survive sessions; the browser may revoke permission
 * between sessions, so callers must check permission after retrieval.
 *
 * **Configs store** (`configs`, keyPath `projectId`):
 * Discriminated by `backend`. Webaccess projects carry their bound
 * `workspaceId` so the FM machine can resolve the correct handle at
 * project-open time (closes Finding 15 of the audit).
 *
 * **Meta store** (`meta`, keyPath `key`):
 * Reserved for cross-cutting metadata (currently unused at runtime).
 *
 * This module runs on the main thread only — permission APIs require a
 * window context.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryHandle
 */

import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { metaConfig } from '#constants/meta.constants.js';

const dbName = `${metaConfig.databasePrefix}fs-handles`;
const handlesStoreName = 'handles';
const configsStoreName = 'configs';
const workspacesStoreName = 'workspaces';
const metaStoreName = 'meta';
const legacyHandleKey = 'root';
const dbVersion = 3;

// ============ Types ============

/**
 * Workspace metadata. The `workspaceId` is the canonical identity used by
 * `handles`, `configs.workspaceId`, and the picker's `id` option
 * (`showDirectoryPicker({ id })`). The persistent `configs.workspaceId`
 * is the only authority for the project ↔ workspace binding — workspace
 * picks happen via `bindProjectToWorkspace` on `useFileManager`, which
 * writes that row first and then triggers an FM machine reload (see
 * `docs/policy/filesystem-policy.md` Rule 13b).
 */
export type Workspace = {
  /** `wsp_<nanoid21>` — minted via `generatePrefixedId(idPrefix.workspace)`. */
  readonly workspaceId: string;
  /** Human label, defaults to `handle.name` at creation; editable. */
  name: string;
  /** Exactly one workspace is the default for new webaccess projects. */
  isDefault: boolean;
  /** `Date.now()` snapshot — sort key + UI freshness signal. */
  lastConnectedAt: number;
};

/**
 * Per-project filesystem configuration, discriminated by `backend`.
 * Webaccess projects are bound to a specific workspace at creation time;
 * non-webaccess projects don't need a workspace.
 */
export type ProjectFileSystemConfig =
  | { readonly projectId: string; readonly backend: 'indexeddb' | 'opfs' | 'memory' }
  | { readonly projectId: string; readonly backend: 'webaccess'; readonly workspaceId: string };

/** Resolved workspace plus its current handle (when granted/stored). */
export type WorkspaceEntry = {
  readonly workspace: Workspace;
  readonly handle: FileSystemDirectoryHandle;
};

// ============ Database (ref-counted singleton) ============

/** Idle delay before the cached DB connection is closed. Milliseconds. */
const idleCloseDelay = 5000;

let cachedDb: IDBDatabase | undefined;
let refCount = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let openPromise: Promise<IDBDatabase> | undefined;

async function openHandleDbRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

    request.addEventListener('upgradeneeded', (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) {
        // Should never happen — `upgradeneeded` always has an associated transaction.
        return;
      }

      if (!db.objectStoreNames.contains(handlesStoreName)) {
        db.createObjectStore(handlesStoreName);
      }
      if (!db.objectStoreNames.contains(configsStoreName)) {
        db.createObjectStore(configsStoreName, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(workspacesStoreName)) {
        db.createObjectStore(workspacesStoreName, { keyPath: 'workspaceId' });
      }
      if (!db.objectStoreNames.contains(metaStoreName)) {
        db.createObjectStore(metaStoreName, { keyPath: 'key' });
      }

      // V2 -> v3 migration: promote the legacy `handles['root']` slot to a
      // first-class workspace. Atomic with the schema bump — the migration
      // runs inside the upgrade transaction and commits with it.
      if (event.oldVersion > 0 && event.oldVersion < 3) {
        promoteLegacyHandleWithinUpgrade(tx);
      }
    });

    request.addEventListener('success', () => {
      resolve(request.result);
    });

    request.addEventListener('error', () => {
      reject(request.error ?? new Error(`Failed to open IndexedDB database: ${dbName}`));
    });
  });
}

/**
 * Inside the v2 -> v3 upgrade transaction: read the legacy `handles['root']`
 * entry; if present, mint a fresh `wsp_*` id, write the matching
 * `workspaces[wsp_*]` row (flagged `isDefault: true`), rewrite the handle
 * under the new key, and drop the legacy `'root'` key. Legacy projects
 * without an explicit `workspaceId` in `configs` are prompted via the
 * recovery overlay on first load; picks persist via the FM self-persist
 * invariant (Rule 13b).
 *
 * Returns synchronously; the chained `success` handlers run within the
 * upgrade transaction and commit atomically with the schema changes.
 */
function promoteLegacyHandleWithinUpgrade(tx: IDBTransaction): void {
  const handlesStore = tx.objectStore(handlesStoreName);
  const legacyRequest = handlesStore.get(legacyHandleKey);
  legacyRequest.addEventListener('success', () => {
    const legacyHandle = legacyRequest.result as FileSystemDirectoryHandle | undefined;
    if (!legacyHandle) {
      return;
    }
    const workspaceId = generatePrefixedId(idPrefix.workspace);
    const workspaceRow: Workspace = {
      workspaceId,
      name: legacyHandle.name,
      isDefault: true,
      lastConnectedAt: Date.now(),
    };
    tx.objectStore(workspacesStoreName).put(workspaceRow);
    handlesStore.put(legacyHandle, workspaceId);
    handlesStore.delete(legacyHandleKey);
  });
}

async function acquireDb(): Promise<IDBDatabase> {
  if (idleTimer !== undefined) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
  refCount++;

  if (cachedDb) {
    return cachedDb;
  }

  openPromise ??= openHandleDbRaw();

  cachedDb = await openPromise;
  openPromise = undefined;
  return cachedDb;
}

function releaseDb(): void {
  refCount--;
  if (refCount > 0) {
    return;
  }

  idleTimer = setTimeout(() => {
    cachedDb?.close();
    cachedDb = undefined;
    idleTimer = undefined;
  }, idleCloseDelay);
}

async function withDb<T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await acquireDb();
  try {
    return await operation(db);
  } finally {
    releaseDb();
  }
}

// ============ Workspace CRUD ============

/**
 * Create a new workspace bound to the given handle. Mints the
 * `workspaceId` via `generatePrefixedId(idPrefix.workspace)` — the only
 * `wsp_*` mint site in the codebase. If `setDefault` is true (or no
 * workspaces existed before this call), the new entry is flagged as the
 * default for new webaccess projects.
 */
export async function createWorkspace(
  handle: FileSystemDirectoryHandle,
  options?: { name?: string; setDefault?: boolean },
): Promise<Workspace> {
  return withDb(async (db) => {
    const existing = await readAllWorkspaces(db);
    const workspaceId = generatePrefixedId(idPrefix.workspace);
    const setDefault = options?.setDefault === true || existing.length === 0;
    const workspace: Workspace = {
      workspaceId,
      name: options?.name ?? handle.name,
      isDefault: setDefault,
      lastConnectedAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([workspacesStoreName, handlesStoreName], 'readwrite');
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('Failed to create workspace'));
      });
      tx.addEventListener('abort', () => {
        reject(tx.error ?? new Error('Workspace creation transaction aborted'));
      });

      const workspacesStore = tx.objectStore(workspacesStoreName);
      if (setDefault) {
        for (const other of existing) {
          if (other.isDefault) {
            workspacesStore.put({ ...other, isDefault: false });
          }
        }
      }
      workspacesStore.put(workspace);
      tx.objectStore(handlesStoreName).put(handle, workspaceId);
    });

    return workspace;
  });
}

/** List every workspace known to the store, ordered by `lastConnectedAt` desc. */
export async function listWorkspaces(): Promise<Workspace[]> {
  return withDb(async (db) => {
    const rows = await readAllWorkspaces(db);
    return rows.sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
  });
}

async function readAllWorkspaces(db: IDBDatabase): Promise<Workspace[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(workspacesStoreName, 'readonly');
    const request = tx.objectStore(workspacesStoreName).getAll();
    request.addEventListener('success', () => {
      resolve(request.result as Workspace[]);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Failed to read workspaces'));
    });
  });
}

/** Resolve a workspace + its handle by id, or `undefined` if either is missing. */
export async function getWorkspace(workspaceId: string): Promise<WorkspaceEntry | undefined> {
  return withDb(async (db) => {
    return new Promise<WorkspaceEntry | undefined>((resolve, reject) => {
      const tx = db.transaction([workspacesStoreName, handlesStoreName], 'readonly');
      const workspaceRequest = tx.objectStore(workspacesStoreName).get(workspaceId);
      const handleRequest = tx.objectStore(handlesStoreName).get(workspaceId);
      tx.addEventListener('complete', () => {
        const workspace = workspaceRequest.result as Workspace | undefined;
        const handle = handleRequest.result as FileSystemDirectoryHandle | undefined;
        if (!workspace || !handle) {
          resolve(undefined);
          return;
        }
        resolve({ workspace, handle });
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error(`Failed to read workspace ${workspaceId}`));
      });
    });
  });
}

/** Rename a workspace. The id is immutable — only the human label changes. */
export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  return withDb(async (db) => {
    const existing = await readWorkspace(db, workspaceId);
    if (!existing) {
      throw new Error(`Cannot rename unknown workspace: ${workspaceId}`);
    }
    await putWorkspace(db, { ...existing, name });
  });
}

/** Mark `workspaceId` as the default; clears the flag on every other workspace. */
export async function setDefaultWorkspace(workspaceId: string): Promise<void> {
  return withDb(async (db) => {
    const all = await readAllWorkspaces(db);
    const target = all.find((w) => w.workspaceId === workspaceId);
    if (!target) {
      throw new Error(`Cannot set default on unknown workspace: ${workspaceId}`);
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(workspacesStoreName, 'readwrite');
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('Failed to set default workspace'));
      });
      const store = tx.objectStore(workspacesStoreName);
      for (const workspace of all) {
        const next = { ...workspace, isDefault: workspace.workspaceId === workspaceId };
        if (next.isDefault !== workspace.isDefault) {
          store.put(next);
        }
      }
    });
  });
}

/**
 * Drop the workspace's handle but keep its metadata so the row can be
 * reconnected later (one-click re-grant with the original picker memory).
 */
export async function disconnectWorkspace(workspaceId: string): Promise<void> {
  return withDb(async (db) => {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(handlesStoreName, 'readwrite');
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('Failed to disconnect workspace'));
      });
      tx.objectStore(handlesStoreName).delete(workspaceId);
    });
  });
}

/**
 * Remove the workspace entirely (handle, metadata, and any cached
 * disk-usage info). Callers must guarantee no `ProjectFileSystemConfig`
 * references this workspace — verify via `listProjectsForWorkspace`
 * before calling.
 */
export async function forgetWorkspace(workspaceId: string): Promise<void> {
  return withDb(async (db) => {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([workspacesStoreName, handlesStoreName], 'readwrite');
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('Failed to forget workspace'));
      });
      tx.objectStore(workspacesStoreName).delete(workspaceId);
      tx.objectStore(handlesStoreName).delete(workspaceId);
    });
  });
}

/**
 * Replace a workspace's handle (e.g. user re-picks the same folder after a
 * permission revoke, or migrates the workspace to a different mounted
 * drive). The workspace identity stays stable so every project bound to
 * it remains valid.
 */
export async function updateWorkspaceHandle(workspaceId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  return withDb(async (db) => {
    const existing = await readWorkspace(db, workspaceId);
    if (!existing) {
      throw new Error(`Cannot update handle on unknown workspace: ${workspaceId}`);
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([workspacesStoreName, handlesStoreName], 'readwrite');
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('Failed to update workspace handle'));
      });
      const nextWorkspace: Workspace = {
        ...existing,
        lastConnectedAt: Date.now(),
      };
      tx.objectStore(workspacesStoreName).put(nextWorkspace);
      tx.objectStore(handlesStoreName).put(handle, workspaceId);
    });
  });
}

/**
 * Resolve the default workspace + its handle, or `undefined` when none is
 * connected.
 */
export async function getDefaultWorkspace(): Promise<WorkspaceEntry | undefined> {
  const all = await listWorkspaces();
  const fallback = all.find((w) => w.isDefault) ?? all[0];
  if (!fallback) {
    return undefined;
  }
  return getWorkspace(fallback.workspaceId);
}

// ============ Permissions (per-handle) ============

/**
 * Check the current permission state of a `FileSystemDirectoryHandle`.
 * Does not require a user gesture and can be called at any time.
 *
 * @returns `granted` if the handle can be used, `prompt` if permission
 *          needs to be requested (requires user gesture), or `denied`.
 */
export async function checkHandlePermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  return handle.queryPermission({ mode: 'readwrite' });
}

/**
 * Request read/write permission on a `FileSystemDirectoryHandle`. MUST be
 * called from a user gesture (e.g. button click handler).
 *
 * @returns `true` if permission was granted, `false` otherwise.
 */
export async function requestHandlePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const result = await handle.requestPermission({ mode: 'readwrite' });
  return result === 'granted';
}

// ============ Project filesystem configs ============

/**
 * Persist the per-project filesystem configuration. Webaccess projects
 * MUST supply a `workspaceId`; non-webaccess projects MUST NOT (the
 * discriminated union enforces this at the type level).
 */
export async function setProjectFileSystemConfig(config: ProjectFileSystemConfig): Promise<void> {
  return withDb(
    async (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(configsStoreName, 'readwrite');
        const request = tx.objectStore(configsStoreName).put(config);
        request.addEventListener('success', () => {
          resolve();
        });
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('Failed to store project filesystem config'));
        });
      }),
  );
}

/**
 * Resolve the full filesystem config (including the webaccess workspace
 * binding) for `projectId`, or `undefined` for legacy/unknown projects.
 */
export async function getProjectFileSystemConfig(projectId: string): Promise<ProjectFileSystemConfig | undefined> {
  return withDb(
    async (db) =>
      new Promise<ProjectFileSystemConfig | undefined>((resolve, reject) => {
        const tx = db.transaction(configsStoreName, 'readonly');
        const request = tx.objectStore(configsStoreName).get(projectId);
        request.addEventListener('success', () => {
          resolve(request.result as ProjectFileSystemConfig | undefined);
        });
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('Failed to retrieve project filesystem config'));
        });
      }),
  );
}

/** Remove the filesystem config for a deleted project. */
export async function deleteProjectFileSystemConfig(projectId: string): Promise<void> {
  return withDb(
    async (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(configsStoreName, 'readwrite');
        const request = tx.objectStore(configsStoreName).delete(projectId);
        request.addEventListener('success', () => {
          resolve();
        });
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('Failed to delete project filesystem config'));
        });
      }),
  );
}

/**
 * Enumerate every project config across all backends. Used by the
 * `/files` route to group projects by backend and by Settings to count
 * how many projects reference each workspace.
 */
export async function getAllProjectFileSystemConfigs(): Promise<ProjectFileSystemConfig[]> {
  return withDb(
    async (db) =>
      new Promise<ProjectFileSystemConfig[]>((resolve, reject) => {
        const tx = db.transaction(configsStoreName, 'readonly');
        const request = tx.objectStore(configsStoreName).getAll();
        request.addEventListener('success', () => {
          resolve(request.result as ProjectFileSystemConfig[]);
        });
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('Failed to retrieve all project filesystem configs'));
        });
      }),
  );
}

/** List every webaccess project bound to the given workspace. */
export async function listProjectsForWorkspace(workspaceId: string): Promise<ProjectFileSystemConfig[]> {
  const all = await getAllProjectFileSystemConfigs();
  return all.filter((c) => c.backend === 'webaccess' && c.workspaceId === workspaceId);
}

// ============ Internal helpers ============

async function readWorkspace(db: IDBDatabase, workspaceId: string): Promise<Workspace | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(workspacesStoreName, 'readonly');
    const request = tx.objectStore(workspacesStoreName).get(workspaceId);
    request.addEventListener('success', () => {
      resolve(request.result as Workspace | undefined);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error(`Failed to read workspace ${workspaceId}`));
    });
  });
}

async function putWorkspace(db: IDBDatabase, workspace: Workspace): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(workspacesStoreName, 'readwrite');
    const request = tx.objectStore(workspacesStoreName).put(workspace);
    request.addEventListener('success', () => {
      resolve();
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Failed to write workspace'));
    });
  });
}
