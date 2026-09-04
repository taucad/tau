/**
 * Handle, Workspace & Project-Config store.
 *
 * Persists `FileSystemDirectoryHandle` objects, workspace metadata, and
 * per-project filesystem configuration in a dedicated IndexedDB database
 * (`tau-fs-handles`, db schema v3).
 *
 * **Workspaces store** (`workspaces`, keyPath `workspaceId`):
 * Holds `{ workspaceId, name, lastConnectedAt }` for every
 * connected directory the user has linked. Identity is a `wsp_*` id minted
 * via `generatePrefixedId(idPrefix.workspace)` — the runtime `wsp_*` shape
 * is enforced by `createWorkspace` being the only mint site (per the
 * workspaces-foundation policy in `docs/policy/filesystem-authority-policy.md`
 * Rule 11).
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
 * Stores cross-cutting profile metadata, including Home's pinned engine and
 * the last successful project-creation location.
 *
 * This module runs on the main thread only — permission APIs require a
 * window context.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryHandle
 */

import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { assertRootedPath } from '@taucad/utils/path';
import type { ProjectRootConfig, ProjectRootConfiguration, StorageRootConfig } from '@taucad/filesystem';
import type { WorkspaceMarker } from '@taucad/types';
import {
  parseWorkspaceMarker,
  serializeWorkspaceMarker,
  workspaceMarkerPath,
  workspaceMarkerSchemaUrl,
} from '@taucad/types';
import { metaConfig } from '#constants/meta.constants.js';
import { allocateSlug, projectNameToSlug } from '#utils/project-directory.utils.js';
import { toStorageWriteError, WorkspaceIdentityConflictError } from '#filesystem/workspace-errors.js';
import { probeHomeOpfs } from '#filesystem/home-opfs-probe.js';
import { hostPathName, isDesktopTarget, nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';
import { parseProjectCreationLocation } from '#utils/project-creation-location.utils.js';

const dbName = `${metaConfig.databasePrefix}fs-handles`;
const handlesStoreName = 'handles';
const configsStoreName = 'configs';
const workspacesStoreName = 'workspaces';
const metaStoreName = 'meta';
const dbVersion = 4;
const projectRootConfigurationChannelName = `${metaConfig.databasePrefix}project-root-configuration`;
const homeBackendMetaKey = 'home-storage-backend';
const projectCreationLocationMetaKey = 'project-creation-location';

/**
 * Physical engine backing the system-owned Home workspace. `node` is the
 * desktop arm (charter ruling C1): Home lives on real disk under `userData`,
 * and the browser engines never enter the desktop data path.
 */
export type HomeStorageBackend = 'indexeddb' | 'opfs' | 'node';

type HomeBackendMeta = {
  readonly key: typeof homeBackendMetaKey;
  readonly backend: HomeStorageBackend;
};

type ProjectCreationLocationMeta = {
  readonly key: typeof projectCreationLocationMetaKey;
  readonly location: ProjectCreationLocation;
};

export type ProjectCreationLocationRepairReason = 'invalid' | 'unknown-workspace' | 'unsupported';

export type ProjectCreationLocationRead = {
  readonly location: ProjectCreationLocation;
  readonly repaired: ProjectCreationLocationRepairReason | undefined;
};

let unpinnedHomeBackend: Promise<HomeStorageBackend> | undefined;

let projectRootConfigurationChannel: BroadcastChannel | undefined;

function getProjectRootConfigurationChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') {
    return undefined;
  }
  projectRootConfigurationChannel ??= new BroadcastChannel(projectRootConfigurationChannelName);
  return projectRootConfigurationChannel;
}

/**
 * Milliseconds. Trailing-edge only: one discovery reconcile writes a config row
 * per project, and every listening tab answers a notification with a full
 * `syncProjectRoots`. The durable writes stay one-per-mutation; only the
 * notification coalesces (DF10).
 */
const projectRootConfigurationPublishDebounce = 50;
let publishTimer: ReturnType<typeof setTimeout> | undefined;

function publishProjectRootConfigurationChange(): void {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => {
    publishTimer = undefined;
    getProjectRootConfigurationChannel()?.postMessage(undefined);
  }, projectRootConfigurationPublishDebounce);
}

/** Subscribe to project-root configuration mutations made by another browser context. */
export function subscribeProjectRootConfigurationChanges(listener: () => void): () => void {
  const channel = getProjectRootConfigurationChannel();
  if (!channel) {
    return () => undefined;
  }
  channel.addEventListener('message', listener);
  return () => {
    channel.removeEventListener('message', listener);
  };
}

async function withStorageWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toStorageWriteError(error);
  }
}

async function withProjectRootConfigurationMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = await withStorageWrite(operation);
  publishProjectRootConfigurationChange();
  return result;
}

// ============ Types ============

/**
 * Workspace metadata. The `workspaceId` is the canonical identity used by
 * `handles`, `configs.workspaceId`, and the picker's `id` option
 * (`showDirectoryPicker({ id })`). The persistent `configs.workspaceId`
 * is the only authority for the project ↔ workspace binding — workspace
 * picks happen via `bindProjectToWorkspace` on `useFileManager`, which
 * writes that row first and then triggers an FM machine reload (see
 * `docs/policy/filesystem-authority-policy.md` Rule 11).
 */
export type Workspace = {
  /** `wsp_<nanoid21>` — minted via `generatePrefixedId(idPrefix.workspace)`. */
  readonly workspaceId: string;
  /** Human label, defaults to `handle.name` at creation; editable. */
  name: string;
  /** `Date.now()` snapshot — sort key + UI freshness signal. */
  lastConnectedAt: number;
  /**
   * Slugified folder name, mirrored from `.tau/workspace.json`, and the first
   * segment of every `/w/{workspaceSlug}/{projectSlug}` URL bound to this
   * workspace. Unique across workspaces and never one of
   * {@link reservedWorkspaceSlugs} (blueprint D5). Required: a row minted
   * before slugs existed is backfilled on first read (L10).
   */
  slug: string;
  /**
   * Outcome of `navigator.storage.persist()` at the last connect, or
   * `undefined` when the browser has no Storage Manager. `false` means the
   * origin is evictable and the UI may warn.
   */
  storagePersisted?: boolean;
  /**
   * Absolute host directory, present only on a **node** workspace — a folder
   * picked through the desktop dialog. A webaccess workspace is identified by
   * the `FileSystemDirectoryHandle` retained in the `handles` store; a picked
   * node folder has no handle, and its path *is* its physical identity
   * (`resolveStorageRootKey` keys node roots on it), so the row carries it.
   * Desktop Home is not a workspace row and keeps its ambient path — see
   * {@link ProjectFileSystemConfig}.
   */
  readonly path?: string;
};

/** True when this workspace is a picked node folder rather than a webaccess handle. */
export const isNodeWorkspace = (workspace: Workspace): workspace is Workspace & { readonly path: string } =>
  workspace.path !== undefined;

/**
 * Per-project filesystem configuration, discriminated by `backend`.
 * Webaccess projects are bound to a specific workspace at creation time;
 * non-webaccess projects don't need a workspace.
 */
export type ProjectFileSystemConfig =
  | {
      readonly projectId: string;
      readonly backend: 'indexeddb' | 'opfs';
      readonly providerBasePath: string;
    }
  | {
      /**
       * A project on real disk. `path` names the node root it lives in and is
       * **absent for Home**, whose `userData/home` path is ambient and resolved
       * from the shell at read time — so a Home row still bakes no
       * machine-specific path (L2 deviation 1). A project in a *picked* folder
       * carries the root's absolute path, which is that root's physical
       * identity everywhere else too (`resolveStorageRootKey`,
       * `ProjectLocator`, `StorageRootConfig`); routing it through the
       * workspace row instead would need a path lookup threaded into every
       * discovery-reconcile comparison for no durability gain — the workspace
       * row stores the same path.
       */
      readonly projectId: string;
      readonly backend: 'node';
      readonly path?: string;
      readonly providerBasePath: string;
    }
  | {
      readonly projectId: string;
      readonly backend: 'memory';
      readonly storageRootKey: string;
      readonly providerBasePath: string;
    }
  | {
      readonly projectId: string;
      readonly backend: 'webaccess';
      readonly workspaceId: string;
      readonly providerBasePath: string;
    };

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

    // Pure bootstrap: create whatever the current schema needs and nothing
    // else. The v2 -> v3 legacy-handle promotion was deleted at L6 — the
    // `handles['root']` slot has been dead since v3 shipped.
    request.addEventListener('upgradeneeded', (event) => {
      const db = request.result;

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
      if (event.oldVersion < 4) {
        const { transaction } = request;
        if (!transaction) {
          throw new Error('IndexedDB upgrade transaction is unavailable');
        }
        const cursorRequest = transaction.objectStore(configsStoreName).openCursor();
        cursorRequest.addEventListener('success', () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            return;
          }
          const config = cursor.value as Record<string, unknown>;
          const { providerBasePath } = config;
          if (typeof providerBasePath === 'string' && providerBasePath.startsWith('/')) {
            const migrated = providerBasePath.slice(1);
            if (isFlatProjectBasePath(migrated)) {
              cursor.update({ ...config, providerBasePath: migrated });
            }
          }
          cursor.continue();
        });
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

  try {
    cachedDb = await openPromise;
    return cachedDb;
  } catch (error) {
    refCount--;
    throw error;
  } finally {
    openPromise = undefined;
  }
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

// ============ Persistent storage + disk-side identity marker ============

/**
 * Ask the browser to move the origin out of the evictable best-effort bucket
 * (R1). Connecting a workspace is the strongest available signal of intent, so
 * that is where the request lives. Never throws: Safari/Firefox-without-flag
 * and jsdom simply have no Storage Manager.
 *
 * @returns the persistence state, or `undefined` when the API is absent.
 */
async function ensurePersistentStorage(): Promise<boolean | undefined> {
  const storage = globalThis.navigator.storage as StorageManager | undefined;
  if (typeof storage?.persisted !== 'function' || typeof storage.persist !== 'function') {
    return undefined;
  }
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch (error) {
    console.warn('Persistent storage request failed', error);
    return undefined;
  }
}

const [markerDirectoryName, markerFileName] = workspaceMarkerPath.split('/') as [string, string];

/** Read `.tau/workspace.json`; `undefined` when absent, unreadable, or invalid. */
async function readWorkspaceMarker(handle: FileSystemDirectoryHandle): Promise<WorkspaceMarker | undefined> {
  try {
    const directory = await handle.getDirectoryHandle(markerDirectoryName);
    const fileHandle = await directory.getFileHandle(markerFileName);
    const file = await fileHandle.getFile();
    return parseWorkspaceMarker(await file.text());
  } catch {
    return undefined;
  }
}

/**
 * Anchor workspace identity on disk (R2 / child-blueprint D7). Best-effort: the
 * folder may be read-only, and a workspace that cannot be marked is still a
 * usable workspace — it just loses eviction recovery.
 *
 * The resolved store identity is written after collision checks. A live
 * `isSameEntry` match may normalize a stale marker; a copied folder receives
 * a fresh identity before this helper is called.
 */
async function syncWorkspaceMarker(
  handle: FileSystemDirectoryHandle,
  existing: WorkspaceMarker | undefined,
  next: { workspaceId: string; slug: string },
): Promise<void> {
  if (existing?.workspaceId === next.workspaceId && existing.slug === next.slug) {
    return;
  }
  try {
    const directory = await handle.getDirectoryHandle(markerDirectoryName, { create: true });
    const file = await directory.getFileHandle(markerFileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(
      serializeWorkspaceMarker({
        $schema: workspaceMarkerSchemaUrl,
        workspaceId: next.workspaceId,
        slug: next.slug,
        createdAt: existing?.workspaceId === next.workspaceId ? existing.createdAt : new Date().toISOString(),
      }),
    );
    await writable.close();
  } catch (error) {
    console.warn(`Could not write ${workspaceMarkerPath} — workspace identity is not anchored on disk`, error);
  }
}

// ============ Workspace slug registry (blueprint D5) ============

/**
 * System-owned and tombstoned slugs. Home is live; `opfs` and `indexeddb`
 * remain reserved only so stale links cannot be claimed by a disk folder.
 */
export const reservedWorkspaceSlugs: readonly string[] = ['home', 'opfs', 'indexeddb'];

export const legacyWorkspaceSlugTombstones: readonly string[] = ['opfs', 'indexeddb'];

/**
 * Slug for a workspace folder, unique against the reserved names and every
 * other workspace. Existing rows keep their slug — the workspace being
 * connected is the most recent by `lastConnectedAt`, so it is the one that
 * yields.
 */
function allocateWorkspaceSlug(folderName: string, others: readonly Workspace[]): string {
  const taken = new Set([...reservedWorkspaceSlugs, ...others.map((other) => other.slug)]);
  return allocateSlug(projectNameToSlug(folderName), taken);
}

/**
 * Resolve the workspace addressed by a `/w/{workspaceSlug}` segment. Matching
 * is case-insensitive (F3); ties break on `lastConnectedAt` desc, which is the
 * order {@link listWorkspaces} already returns.
 */
export async function resolveWorkspaceBySlug(slug: string): Promise<Workspace | undefined> {
  const folded = slug.toLocaleLowerCase();
  if (legacyWorkspaceSlugTombstones.includes(folded)) {
    return undefined;
  }
  const workspaces = await listWorkspaces();
  return workspaces.find((workspace) => workspace.slug.toLocaleLowerCase() === folded);
}

// ============ Home storage engine pin ============

const isHomeStorageBackend = (value: unknown): value is HomeStorageBackend =>
  value === 'indexeddb' || value === 'opfs' || value === 'node';

/**
 * Ruling C1 is a property of the build, not of the runtime: the preload bridge
 * is installed asynchronously, so a boot-time probe can run before
 * `window.tau` exists. Deciding from the bridge would let one early call pin
 * Home to OPFS **durably** and silently put the desktop data path in the
 * browser. `isDesktopTarget` is a build-time define and cannot race.
 */
const detectHomeStorageBackend = async (): Promise<HomeStorageBackend> =>
  isDesktopTarget ? 'node' : (await probeHomeOpfs()) ? 'opfs' : 'indexeddb';

const readHomeBackendPin = async (db: IDBDatabase): Promise<HomeStorageBackend | undefined> =>
  new Promise((resolve, reject) => {
    const request = db.transaction(metaStoreName, 'readonly').objectStore(metaStoreName).get(homeBackendMetaKey);
    request.addEventListener('success', () => {
      const value = request.result as Partial<HomeBackendMeta> | undefined;
      resolve(isHomeStorageBackend(value?.backend) ? value.backend : undefined);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Failed to read the Home storage backend'));
    });
  });

/** The durable Home engine, or the current profile's unpinned preference. */
export async function getHomeStorageBackend(): Promise<HomeStorageBackend> {
  const pinned = await withDb(readHomeBackendPin);
  if (pinned) {
    return pinned;
  }
  unpinnedHomeBackend ??= detectHomeStorageBackend();
  return unpinnedHomeBackend;
}

/** Pin Home immediately before its first materializing write. */
export async function pinHomeStorageBackend(backend: HomeStorageBackend): Promise<HomeStorageBackend> {
  if (isDesktopTarget && backend !== 'node') {
    // Durable and irreversible: refuse loudly rather than write a pin that puts
    // the desktop data path in browser storage forever (ruling C1).
    throw new Error(`Refusing to pin desktop Home to ${backend}; the desktop data path is node-backed.`);
  }
  return withProjectRootConfigurationMutation(async () =>
    withDb(
      async (db) =>
        new Promise<HomeStorageBackend>((resolve, reject) => {
          const tx = db.transaction(metaStoreName, 'readwrite');
          const store = tx.objectStore(metaStoreName);
          const read = store.get(homeBackendMetaKey);
          let resolved = backend;

          read.addEventListener('success', () => {
            const existing = read.result as Partial<HomeBackendMeta> | undefined;
            if (isHomeStorageBackend(existing?.backend)) {
              resolved = existing.backend;
              if (existing.backend !== backend) {
                tx.abort();
              }
              return;
            }
            store.put({ key: homeBackendMetaKey, backend } satisfies HomeBackendMeta);
          });
          tx.addEventListener('complete', () => {
            resolve(resolved);
          });
          tx.addEventListener('abort', () => {
            reject(new Error(`Home is pinned to ${resolved}; refusing to materialize it in ${backend}`));
          });
          tx.addEventListener('error', () => {
            reject(tx.error ?? new Error('Failed to pin the Home storage backend'));
          });
        }),
    ),
  );
}

// ============ Project-creation location preference ============

const readProjectCreationLocationMeta = async (db: IDBDatabase): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const request = db
      .transaction(metaStoreName, 'readonly')
      .objectStore(metaStoreName)
      .get(projectCreationLocationMetaKey);
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Failed to read the project creation location'));
    });
  });

/** Persist the location used by the latest successful direct project creation. */
export async function setProjectCreationLocation(location: ProjectCreationLocation): Promise<void> {
  await withStorageWrite(async () =>
    withDb(
      async (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(metaStoreName, 'readwrite');
          tx.objectStore(metaStoreName).put({
            key: projectCreationLocationMetaKey,
            location,
          } satisfies ProjectCreationLocationMeta);
          tx.addEventListener('complete', () => {
            resolve();
          });
          tx.addEventListener('error', () => {
            reject(tx.error ?? new Error('Failed to persist the project creation location'));
          });
        }),
    ),
  );
}

/** Read and repair advisory creation-location metadata against current capability and rows. */
export async function getProjectCreationLocation(options: {
  webAccessSupported: boolean;
}): Promise<ProjectCreationLocationRead> {
  const raw = await withDb(readProjectCreationLocationMeta);
  if (raw === undefined) {
    return { location: homeProjectCreationLocation, repaired: undefined };
  }

  const stored = raw as Partial<ProjectCreationLocationMeta>;
  const location = parseProjectCreationLocation(stored.location);
  let repaired: ProjectCreationLocationRepairReason | undefined;
  if (!location) {
    repaired = 'invalid';
  } else if (location.kind === 'workspace' && !options.webAccessSupported) {
    repaired = 'unsupported';
  } else if (location.kind === 'workspace') {
    const workspaces = await listWorkspaces();
    if (!workspaces.some((workspace) => workspace.workspaceId === location.workspaceId)) {
      repaired = 'unknown-workspace';
    }
  }

  if (!repaired && location) {
    return { location, repaired: undefined };
  }
  await setProjectCreationLocation(homeProjectCreationLocation);
  return { location: homeProjectCreationLocation, repaired };
}

// ============ Workspace CRUD ============

/** A connected workspace plus whether this call minted its identity (DF19). */
export type WorkspaceConnection = Workspace & { readonly minted: boolean };

/**
 * Serialize the read-check-mint across tabs so two contexts connecting the same
 * folder cannot mint two identities for it (DF7).
 *
 * ponytail: one global mint lock — connects are user-gestured and rare; split
 * per-folder only if that ever becomes a contention point.
 */
async function withWorkspaceMintLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    return operation();
  }
  return navigator.locks.request('tau-fs-write:workspace-mint', { mode: 'exclusive' }, operation);
}

/** `isSameEntry` against a stored handle; a handle that cannot answer is not a match (DF8). */
async function isSameStoredEntry(
  stored: FileSystemDirectoryHandle | undefined,
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  if (!stored) {
    return false;
  }
  try {
    return await stored.isSameEntry(handle);
  } catch (error) {
    console.warn('Stored workspace handle could not be compared', error);
    return false;
  }
}

async function findSameEntryWorkspaceId(
  handles: ReadonlyMap<string, FileSystemDirectoryHandle>,
  handle: FileSystemDirectoryHandle,
  excludedWorkspaceId: string,
): Promise<string | undefined> {
  const matches = await Promise.all(
    [...handles].map(async ([workspaceId, stored]) =>
      workspaceId !== excludedWorkspaceId && (await isSameStoredEntry(stored, handle)) ? workspaceId : undefined,
    ),
  );
  return matches.find((workspaceId) => workspaceId !== undefined);
}

/**
 * Create a new workspace bound to the given handle. Identity resolves in three
 * steps: `isSameEntry` against stored handles, then the on-disk
 * `.tau/workspace.json` marker, then a fresh mint via
 * `generatePrefixedId(idPrefix.workspace)` — the only `wsp_*` mint site in the
 * codebase. Step two is what makes an IndexedDB eviction recoverable: re-picking
 * the folder resurrects the original id, so every `configs` row stays valid
 * (`docs/research/offline-first-storage-durability-blueprint.md` R2).
 */
export async function createWorkspace(
  handle: FileSystemDirectoryHandle,
  options?: { name?: string },
): Promise<WorkspaceConnection> {
  return withWorkspaceMintLock(async () => createWorkspaceLocked(handle, options));
}

async function createWorkspaceLocked(
  handle: FileSystemDirectoryHandle,
  options?: { name?: string },
): Promise<WorkspaceConnection> {
  return withProjectRootConfigurationMutation(async () =>
    withDb(async (db) => {
      const storagePersisted = await ensurePersistentStorage();
      const marker = await readWorkspaceMarker(handle);
      const existing = await readAllWorkspaces(db);
      /* oxlint-disable eslint/no-await-in-loop -- Handle identity checks must stop at the first matching durable workspace. */
      for (const workspace of existing) {
        const storedHandle = await readHandle(db, workspace.workspaceId);
        if (await isSameStoredEntry(storedHandle, handle)) {
          // Re-slugged every connect so an external folder rename follows the
          // URL grammar, still without colliding with a sibling workspace.
          const slug = allocateWorkspaceSlug(
            handle.name,
            existing.filter((other) => other.workspaceId !== workspace.workspaceId),
          );
          const refreshed = {
            ...workspace,
            name: options?.name ?? workspace.name,
            slug,
            lastConnectedAt: Date.now(),
            ...(storagePersisted === undefined ? {} : { storagePersisted }),
          };
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction([workspacesStoreName, handlesStoreName], 'readwrite');
            tx.addEventListener('complete', () => {
              resolve();
            });
            tx.addEventListener('error', () => {
              reject(tx.error ?? new Error('Failed to refresh workspace'));
            });
            tx.objectStore(workspacesStoreName).put(refreshed);
            tx.objectStore(handlesStoreName).put(handle, workspace.workspaceId);
          });
          await syncWorkspaceMarker(handle, marker, { workspaceId: workspace.workspaceId, slug });
          return { ...refreshed, minted: false };
        }
      }
      /* oxlint-enable eslint/no-await-in-loop -- End ordered handle identity checks. */
      const markedWorkspace = marker
        ? existing.find((workspace) => workspace.workspaceId === marker.workspaceId)
        : undefined;
      if (markedWorkspace && (await readHandle(db, markedWorkspace.workspaceId)) === undefined) {
        const reconnected: Workspace = {
          ...markedWorkspace,
          name: options?.name ?? markedWorkspace.name,
          lastConnectedAt: Date.now(),
          ...(storagePersisted === undefined ? {} : { storagePersisted }),
        };
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([workspacesStoreName, handlesStoreName], 'readwrite');
          tx.objectStore(workspacesStoreName).put(reconnected);
          tx.objectStore(handlesStoreName).put(handle, reconnected.workspaceId);
          tx.addEventListener('complete', () => {
            resolve();
          });
          tx.addEventListener('error', () => {
            reject(tx.error ?? new Error('Failed to reconnect workspace'));
          });
          tx.addEventListener('abort', () => {
            reject(tx.error ?? new Error('Workspace reconnect transaction aborted'));
          });
        });
        await syncWorkspaceMarker(handle, marker, reconnected);
        return { ...reconnected, minted: false };
      }
      // An unknown marker resurrects evicted profile state. A known marker with
      // a different live handle is a copied folder and must receive a fresh id.
      const adopted = marker && markedWorkspace === undefined ? marker : undefined;
      const workspaceId = adopted?.workspaceId ?? generatePrefixedId(idPrefix.workspace);
      const slug = allocateWorkspaceSlug(handle.name, existing);
      const workspace: Workspace = {
        workspaceId,
        name: options?.name ?? handle.name,
        lastConnectedAt: Date.now(),
        slug,
        ...(storagePersisted === undefined ? {} : { storagePersisted }),
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
        tx.objectStore(workspacesStoreName).put(workspace);
        tx.objectStore(handlesStoreName).put(handle, workspaceId);
      });

      await syncWorkspaceMarker(handle, marker, { workspaceId, slug });

      return { ...workspace, minted: adopted === undefined };
    }),
  );
}

/** Trailing separators are cosmetic; the key derived from the path is not. */
const normalizeHostPath = (path: string): string => path.replace(/[/\\]+$/, '') || path;

/**
 * Create (or re-adopt) the workspace for a picked node folder.
 *
 * The absolute host path is the identity — the same identity
 * `resolveStorageRootKey` derives — so re-picking the same folder returns the
 * same `workspaceId` and every project bound to it stays valid. There is no
 * `.tau/workspace.json` step: the renderer cannot read disk directly, and node
 * project rows are keyed on the path rather than on `workspaceId`, so a lost
 * IndexedDB re-mints an id without stranding a single project.
 *
 * ponytail: no marker sync for node roots. Add one through the file-manager
 * service if a node workspace ever needs to survive being moved on disk.
 *
 * @param hostPath - Absolute host directory chosen in the desktop dialog.
 * @param options - Optional display name; defaults to the folder name.
 * @returns The workspace row plus whether this call minted its identity.
 */
export async function createNodeWorkspace(hostPath: string, options?: { name?: string }): Promise<WorkspaceConnection> {
  const path = normalizeHostPath(hostPath);
  const folderName = hostPathName(path);
  return withWorkspaceMintLock(async () =>
    withProjectRootConfigurationMutation(async () =>
      withDb(async (db) => {
        const existing = await readAllWorkspaces(db);
        const matched = existing.find((workspace) => workspace.path === path);
        const others = existing.filter((workspace) => workspace.workspaceId !== matched?.workspaceId);
        const workspace: Workspace = {
          workspaceId: matched?.workspaceId ?? generatePrefixedId(idPrefix.workspace),
          name: options?.name ?? matched?.name ?? folderName,
          // Re-slugged every connect so a folder renamed on disk follows the URL
          // grammar, exactly as the webaccess path does.
          slug: allocateWorkspaceSlug(folderName, others),
          lastConnectedAt: Date.now(),
          path,
        };
        await putWorkspace(db, workspace);
        return { ...workspace, minted: matched === undefined };
      }),
    ),
  );
}

async function readHandle(db: IDBDatabase, workspaceId: string): Promise<FileSystemDirectoryHandle | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(handlesStoreName, 'readonly');
    const request = tx.objectStore(handlesStoreName).get(workspaceId);
    request.addEventListener('success', () => {
      resolve(request.result as FileSystemDirectoryHandle | undefined);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error(`Failed to read handle ${workspaceId}`));
    });
  });
}

/** List every workspace known to the store, ordered by `lastConnectedAt` desc. */
export async function listWorkspaces(): Promise<Workspace[]> {
  return withDb(async (db) => {
    const rows = await readAllWorkspaces(db);
    return rows.sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
  });
}

/** A durable row as it may sit on disk: written before `slug` was required. */
type StoredWorkspace = Omit<Workspace, 'slug'> & { slug?: string };

const hasSlug = (workspace: StoredWorkspace): workspace is Workspace => workspace.slug !== undefined;

/**
 * Give every row a slug, allocating and persisting one for rows minted before
 * slugs existed (L10). Read paths pay this once; an unwritable store still
 * yields a usable slug so a `/w/` URL cannot 404 on a storage hiccup.
 */
async function backfillWorkspaceSlugs(db: IDBDatabase, rows: readonly StoredWorkspace[]): Promise<Workspace[]> {
  const known = rows.filter((row) => hasSlug(row));
  if (known.length === rows.length) {
    return known;
  }
  const byId = new Map(known.map((row) => [row.workspaceId, row] as const));
  /* oxlint-disable eslint/no-await-in-loop -- Each backfill must see the slugs the previous one took. */
  for (const row of rows) {
    if (byId.has(row.workspaceId)) {
      continue;
    }
    const filled: Workspace = { ...row, slug: allocateWorkspaceSlug(row.name, known) };
    known.push(filled);
    byId.set(filled.workspaceId, filled);
    try {
      await putWorkspace(db, filled);
    } catch (error) {
      console.warn('Could not backfill workspace slug', error);
    }
  }
  /* oxlint-enable eslint/no-await-in-loop -- End ordered slug allocation. */
  return rows.map((row) => byId.get(row.workspaceId)!);
}

async function readAllWorkspaces(db: IDBDatabase): Promise<Workspace[]> {
  const rows = await new Promise<StoredWorkspace[]>((resolve, reject) => {
    const tx = db.transaction(workspacesStoreName, 'readonly');
    const request = tx.objectStore(workspacesStoreName).getAll();
    request.addEventListener('success', () => {
      resolve(request.result as StoredWorkspace[]);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Failed to read workspaces'));
    });
  });
  return backfillWorkspaceSlugs(db, rows);
}

/** Resolve a workspace + its handle by id, or `undefined` if either is missing. */
export async function getWorkspace(workspaceId: string): Promise<WorkspaceEntry | undefined> {
  return withDb(async (db) => {
    const workspace = await readWorkspace(db, workspaceId);
    const handle = workspace && (await readHandle(db, workspaceId));
    return workspace && handle ? { workspace, handle } : undefined;
  });
}

/** Resolve workspace identity by id even when its directory handle is disconnected. */
export async function getWorkspaceMetadata(workspaceId: string): Promise<Workspace | undefined> {
  return withDb(async (db) => readWorkspace(db, workspaceId));
}

/** Rename a workspace. The id is immutable — only the human label changes. */
export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  return withProjectRootConfigurationMutation(async () =>
    withDb(async (db) => {
      const existing = await readWorkspace(db, workspaceId);
      if (!existing) {
        throw new Error(`Cannot rename unknown workspace: ${workspaceId}`);
      }
      await putWorkspace(db, { ...existing, name });
    }),
  );
}

/** Remove only the retained handle, preserving workspace identity and every project binding. */
export async function disconnectWorkspace(workspaceId: string): Promise<WorkspaceEntry | undefined> {
  const disconnected = await withStorageWrite(async () =>
    withDb(async (db) => {
      // Backfill any pre-slug row before the atomic mutation returns it as a current Workspace.
      await readAllWorkspaces(db);
      return new Promise<WorkspaceEntry | undefined>((resolve, reject) => {
        const tx = db.transaction([workspacesStoreName, handlesStoreName], 'readwrite');
        const workspaceRequest = tx.objectStore(workspacesStoreName).get(workspaceId);
        const handleRequest = tx.objectStore(handlesStoreName).get(workspaceId);
        let disconnectedEntry: WorkspaceEntry | undefined;

        handleRequest.addEventListener('success', () => {
          const workspace = workspaceRequest.result as Workspace | undefined;
          const handle = handleRequest.result as FileSystemDirectoryHandle | undefined;
          if (!workspace || !handle) {
            return;
          }
          disconnectedEntry = { workspace, handle };
          tx.objectStore(handlesStoreName).delete(workspaceId);
        });
        tx.addEventListener('complete', () => {
          resolve(disconnectedEntry);
        });
        tx.addEventListener('error', () => {
          reject(tx.error ?? new Error('Failed to disconnect workspace'));
        });
      });
    }),
  );
  if (disconnected) {
    publishProjectRootConfigurationChange();
  }
  return disconnected;
}

/** Restore an undo handle only while the workspace still exists and remains disconnected. */
export async function restoreWorkspaceHandle(workspaceId: string, handle: FileSystemDirectoryHandle): Promise<boolean> {
  const restored = await withWorkspaceMintLock(async () => {
    const marker = await readWorkspaceMarker(handle);
    return withStorageWrite(async () =>
      withDb(async (db) => {
        const handles = await readAllHandles(db);
        if (marker && marker.workspaceId !== workspaceId) {
          return false;
        }
        if (await findSameEntryWorkspaceId(handles, handle, workspaceId)) {
          return false;
        }
        return new Promise<boolean>((resolve, reject) => {
          const tx = db.transaction([workspacesStoreName, handlesStoreName], 'readwrite');
          const workspaceRequest = tx.objectStore(workspacesStoreName).get(workspaceId);
          const handleRequest = tx.objectStore(handlesStoreName).get(workspaceId);
          let didRestore = false;

          handleRequest.addEventListener('success', () => {
            const workspace = workspaceRequest.result as Workspace | undefined;
            if (!workspace || handleRequest.result !== undefined) {
              return;
            }
            didRestore = true;
            tx.objectStore(workspacesStoreName).put({ ...workspace, lastConnectedAt: Date.now() } satisfies Workspace);
            tx.objectStore(handlesStoreName).put(handle, workspaceId);
          });
          tx.addEventListener('complete', () => {
            resolve(didRestore);
          });
          tx.addEventListener('error', () => {
            reject(tx.error ?? new Error('Failed to restore workspace handle'));
          });
        });
      }),
    );
  });
  if (restored) {
    publishProjectRootConfigurationChange();
  }
  return restored;
}

/**
 * Replace a workspace's handle (e.g. user re-picks the same folder after a
 * permission revoke, or migrates the workspace to a different mounted
 * drive). The workspace identity stays stable so every project bound to
 * it remains valid.
 */
export async function updateWorkspaceHandle(workspaceId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  return withWorkspaceMintLock(async () => {
    const marker = await readWorkspaceMarker(handle);
    return withProjectRootConfigurationMutation(async () =>
      withDb(async (db) => {
        const existing = await readWorkspace(db, workspaceId);
        if (!existing) {
          throw new WorkspaceIdentityConflictError('stale-target', { workspaceId });
        }
        const handles = await readAllHandles(db);
        const current = handles.get(workspaceId);
        const sameTarget = await isSameStoredEntry(current, handle);
        if (current && !sameTarget) {
          throw new WorkspaceIdentityConflictError('stale-target', { workspaceId });
        }
        const conflictingWorkspaceId = await findSameEntryWorkspaceId(handles, handle, workspaceId);
        if (conflictingWorkspaceId) {
          throw new WorkspaceIdentityConflictError('handle-owned-by-another-workspace', {
            workspaceId,
            conflictingWorkspaceId,
          });
        }
        if (!sameTarget && marker && marker.workspaceId !== workspaceId) {
          throw new WorkspaceIdentityConflictError('marker-owned-by-another-workspace', {
            workspaceId,
            conflictingWorkspaceId: marker.workspaceId,
          });
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
        await syncWorkspaceMarker(handle, marker, existing);
      }),
    );
  });
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
  return applyProjectFileSystemConfigChanges({ upserts: [config], deletes: [] });
}

export type ProjectFileSystemConfigChanges = {
  readonly upserts: readonly ProjectFileSystemConfig[];
  readonly deletes: readonly string[];
};

/** Validate and commit one complete route-generation diff in a single transaction. */
export async function applyProjectFileSystemConfigChanges(changes: ProjectFileSystemConfigChanges): Promise<void> {
  const upsertIds = new Set<string>();
  for (const config of changes.upserts) {
    if (!isFlatProjectBasePath(config.providerBasePath)) {
      throw new TypeError(
        `Project provider path must be a canonical root-relative directory: ${config.providerBasePath}`,
      );
    }
    if (upsertIds.has(config.projectId)) {
      throw new TypeError(`Duplicate project filesystem config upsert: ${config.projectId}`);
    }
    upsertIds.add(config.projectId);
  }
  const deleteIds = new Set(changes.deletes);
  if (deleteIds.size !== changes.deletes.length) {
    throw new TypeError('Duplicate project filesystem config delete');
  }
  for (const projectId of upsertIds) {
    if (deleteIds.has(projectId)) {
      throw new TypeError(`Project filesystem config cannot be upserted and deleted together: ${projectId}`);
    }
  }
  if (changes.upserts.length === 0 && changes.deletes.length === 0) {
    return;
  }

  return withProjectRootConfigurationMutation(async () =>
    withDb(
      async (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(configsStoreName, 'readwrite');
          const store = tx.objectStore(configsStoreName);
          for (const projectId of changes.deletes) {
            store.delete(projectId);
          }
          for (const config of changes.upserts) {
            store.put(config);
          }
          tx.addEventListener('complete', () => {
            resolve();
          });
          tx.addEventListener('error', () => {
            reject(tx.error ?? new Error('Failed to apply project filesystem config changes'));
          });
          tx.addEventListener('abort', () => {
            reject(tx.error ?? new Error('Applying project filesystem config changes was aborted'));
          });
        }),
    ),
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
          const result = request.result as unknown;
          resolve(isProjectFileSystemConfig(result) ? result : undefined);
        });
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('Failed to retrieve project filesystem config'));
        });
      }),
  );
}

/** Remove the filesystem config for a deleted project. */
export async function deleteProjectFileSystemConfig(projectId: string): Promise<void> {
  return applyProjectFileSystemConfigChanges({ upserts: [], deletes: [projectId] });
}

/**
 * Enumerate every project config across all backends. Used by the
 * `/files` route to group projects by backend and by Settings to count
 * how many projects reference each workspace.
 */
export async function getAllProjectFileSystemConfigs(): Promise<ProjectFileSystemConfig[]> {
  return withDb(readAllProjectFileSystemConfigs);
}

export type WorkspaceBindingRepair = {
  readonly projectId: string;
  readonly sourceWorkspaceId: string;
  readonly providerBasePath: string;
};

export type WorkspaceBindingRepairSkipReason =
  | 'canonical-disconnected'
  | 'source-missing'
  | 'source-connected'
  | 'config-changed';

export type WorkspaceBindingRepairResult = {
  readonly repairedProjectCount: number;
  readonly removedWorkspaceIds: readonly string[];
  readonly skipped: ReadonlyArray<{ readonly projectId: string; readonly reason: WorkspaceBindingRepairSkipReason }>;
};

async function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Workspace binding repair read failed'));
    });
  });
}

async function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.addEventListener('complete', () => {
      resolve();
    });
    tx.addEventListener('abort', () => {
      reject(tx.error ?? new Error('Workspace binding repair was aborted'));
    });
    tx.addEventListener('error', () => {
      reject(tx.error ?? new Error('Workspace binding repair failed'));
    });
  });
}

function abortActiveTransaction(tx: IDBTransaction): void {
  try {
    tx.abort();
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'InvalidStateError')) {
      throw error;
    }
  }
}

function workspaceBindingRepairError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Workspace binding repair failed', { cause: error });
}

/** Atomically re-point verified stale workspace bindings; project files are never touched. */
export async function repairWorkspaceBindings(options: {
  readonly canonicalWorkspaceId: string;
  readonly repairs: readonly WorkspaceBindingRepair[];
}): Promise<WorkspaceBindingRepairResult> {
  if (options.repairs.length === 0) {
    return { repairedProjectCount: 0, removedWorkspaceIds: [], skipped: [] };
  }
  const projectIds = new Set(options.repairs.map(({ projectId }) => projectId));
  if (projectIds.size !== options.repairs.length) {
    throw new TypeError('Workspace binding repair contains a duplicate project id');
  }

  const result = await withWorkspaceMintLock(async () =>
    withStorageWrite(async () =>
      withDb(async (db) => {
        const tx = db.transaction(
          [configsStoreName, workspacesStoreName, handlesStoreName, metaStoreName],
          'readwrite',
        );
        const completion = waitForTransaction(tx);
        const configsStore = tx.objectStore(configsStoreName);
        const workspacesStore = tx.objectStore(workspacesStoreName);
        const handlesStore = tx.objectStore(handlesStoreName);
        const metaStore = tx.objectStore(metaStoreName);

        try {
          const [rawConfigs, workspaces, rawHandleKeys, rawPreference] = await Promise.all([
            readRequest(configsStore.getAll() as IDBRequest<unknown[]>),
            readRequest(workspacesStore.getAll() as IDBRequest<Workspace[]>),
            readRequest(handlesStore.getAllKeys()),
            readRequest(
              metaStore.get(projectCreationLocationMetaKey) as IDBRequest<
                Partial<ProjectCreationLocationMeta> | undefined
              >,
            ),
          ]);
          const configs = rawConfigs.filter((config) => isProjectFileSystemConfig(config));
          const handleIds = new Set(rawHandleKeys.filter((key): key is string => typeof key === 'string'));
          const skipped: Array<{ projectId: string; reason: WorkspaceBindingRepairSkipReason }> = [];
          if (
            !workspaces.some(({ workspaceId }) => workspaceId === options.canonicalWorkspaceId) ||
            !handleIds.has(options.canonicalWorkspaceId)
          ) {
            skipped.push(
              ...options.repairs.map(
                ({ projectId }): { projectId: string; reason: WorkspaceBindingRepairSkipReason } => ({
                  projectId,
                  reason: 'canonical-disconnected',
                }),
              ),
            );
          } else {
            const configByProjectId = new Map(configs.map((config) => [config.projectId, config] as const));
            for (const repair of options.repairs) {
              const sourceExists = workspaces.some(({ workspaceId }) => workspaceId === repair.sourceWorkspaceId);
              const current = configByProjectId.get(repair.projectId);
              let reason: WorkspaceBindingRepairSkipReason | undefined;
              if (!sourceExists) {
                reason = 'source-missing';
              } else if (handleIds.has(repair.sourceWorkspaceId)) {
                reason = 'source-connected';
              } else if (
                current?.backend !== 'webaccess' ||
                current.workspaceId !== repair.sourceWorkspaceId ||
                current.providerBasePath !== repair.providerBasePath
              ) {
                reason = 'config-changed';
              }
              if (reason) {
                skipped.push({ projectId: repair.projectId, reason });
              }
            }
          }
          if (skipped.length > 0) {
            await completion;
            return { repairedProjectCount: 0, removedWorkspaceIds: [], skipped };
          }

          for (const repair of options.repairs) {
            configsStore.put({
              projectId: repair.projectId,
              backend: 'webaccess',
              workspaceId: options.canonicalWorkspaceId,
              providerBasePath: repair.providerBasePath,
            } satisfies ProjectFileSystemConfig);
          }
          const repairedIds = new Set(options.repairs.map(({ projectId }) => projectId));
          const sourceIds = new Set(options.repairs.map(({ sourceWorkspaceId }) => sourceWorkspaceId));
          const removedWorkspaceIds = [...sourceIds].filter(
            (sourceWorkspaceId) =>
              !configs.some(
                (config) =>
                  config.backend === 'webaccess' &&
                  config.workspaceId === sourceWorkspaceId &&
                  !repairedIds.has(config.projectId),
              ),
          );
          for (const sourceWorkspaceId of removedWorkspaceIds) {
            workspacesStore.delete(sourceWorkspaceId);
            handlesStore.delete(sourceWorkspaceId);
          }
          if (
            rawPreference?.location?.kind === 'workspace' &&
            removedWorkspaceIds.includes(rawPreference.location.workspaceId)
          ) {
            metaStore.put({
              key: projectCreationLocationMetaKey,
              location: { kind: 'workspace', workspaceId: options.canonicalWorkspaceId },
            } satisfies ProjectCreationLocationMeta);
          }
          const result: WorkspaceBindingRepairResult = {
            repairedProjectCount: options.repairs.length,
            removedWorkspaceIds,
            skipped: [],
          };
          await completion;
          return result;
        } catch (error) {
          abortActiveTransaction(tx);
          try {
            await completion;
          } catch {
            // Preserve the original failure below; completion only confirms rollback.
          }
          throw workspaceBindingRepairError(error);
        }
      }),
    ),
  );
  if (result.repairedProjectCount > 0) {
    publishProjectRootConfigurationChange();
  }
  return result;
}

async function readAllProjectFileSystemConfigs(db: IDBDatabase): Promise<ProjectFileSystemConfig[]> {
  return new Promise<ProjectFileSystemConfig[]>((resolve, reject) => {
    const tx = db.transaction(configsStoreName, 'readonly');
    const request = tx.objectStore(configsStoreName).getAll();
    request.addEventListener('success', () => {
      resolve((request.result as unknown[]).filter((value) => isProjectFileSystemConfig(value)));
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Failed to retrieve all project filesystem configs'));
    });
  });
}

async function readAllHandles(db: IDBDatabase): Promise<ReadonlyMap<string, FileSystemDirectoryHandle>> {
  return new Promise((resolve, reject) => {
    const handles = new Map<string, FileSystemDirectoryHandle>();
    const tx = db.transaction(handlesStoreName, 'readonly');
    const request = tx.objectStore(handlesStoreName).openCursor();
    request.addEventListener('success', () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(handles);
        return;
      }
      if (typeof cursor.key === 'string') {
        handles.set(cursor.key, cursor.value as FileSystemDirectoryHandle);
      }
      cursor.continue();
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Failed to retrieve workspace handles'));
    });
  });
}

/**
 * Physical project directories are immediate, non-dot-prefixed children of the
 * workspace root (blueprint D1). Mirrors the service-side invariant enforced by
 * `WorkspaceFileService._configureProjectRoots`.
 */
function isFlatProjectBasePath(providerBasePath: string): boolean {
  try {
    return (
      providerBasePath !== '' &&
      assertRootedPath(providerBasePath) === providerBasePath &&
      !providerBasePath.includes('/') &&
      !providerBasePath.startsWith('.')
    );
  } catch {
    return false;
  }
}

// Profiles that connected their workspace before R1 landed never re-run
// createWorkspace, so the connect-time persist() request alone would leave
// them evictable forever. One boot-time request closes that gap.
let persistRequestedThisSession = false;

/** Why a workspace was left out of the route topology. */
export type WorkspaceRootSkip = {
  readonly workspaceId: string;
  readonly reason: 'disconnected' | 'permission';
};

// The configuration snapshot is rebuilt on every route change, so an
// unconditional warn would spam the console with the same line (R13).
const warnedSkippedWorkspaces = new Set<string>();

/** Report a skipped workspace once per session — the skip itself stays silent to callers. */
function reportWorkspaceRootSkip(
  skipped: { workspaceId: string; name?: string; reason: WorkspaceRootSkip['reason'] },
  onSkip?: (skip: WorkspaceRootSkip) => void,
): void {
  const { workspaceId, name, reason } = skipped;
  if (warnedSkippedWorkspaces.has(workspaceId)) {
    return;
  }
  warnedSkippedWorkspaces.add(workspaceId);
  if (reason === 'disconnected') {
    onSkip?.({ workspaceId, reason });
    return;
  }
  console.warn(`[HandleStore] Skipped workspace ${name ?? '(unknown)'} (${workspaceId}): permission-state`);
  onSkip?.({ workspaceId, reason });
}

/**
 * Resolve the complete cloneable project-route set for the filesystem worker.
 *
 * @param onRootSkipped - Telemetry sink for workspaces left out of the topology (R13).
 */
export async function getProjectRootConfigs(
  onRootSkipped?: (skip: WorkspaceRootSkip) => void,
): Promise<ProjectRootConfiguration> {
  if (!persistRequestedThisSession) {
    persistRequestedThisSession = true;
    void ensurePersistentStorage();
  }
  const { configs, handles, workspaces } = await withDb(async (db) => {
    const [configs, handles, workspaces] = await Promise.all([
      readAllProjectFileSystemConfigs(db),
      readAllHandles(db),
      readAllWorkspaces(db),
    ]);
    return { configs, handles, workspaces };
  });
  // A node workspace is a folder on disk with no permission to lose and no
  // handle to revoke, so its probe short-circuits to granted: it is connected
  // whenever its row exists.
  const nodeRoots = new Map(
    workspaces
      .filter((workspace) => isNodeWorkspace(workspace))
      .map((workspace) => [workspace.path, workspace] as const),
  );
  const entries = await Promise.all(
    workspaces.map(async (workspace) => {
      if (isNodeWorkspace(workspace)) {
        return undefined;
      }
      const handle = handles.get(workspace.workspaceId);
      if (!handle) {
        reportWorkspaceRootSkip({ ...workspace, reason: 'disconnected' }, onRootSkipped);
        return undefined;
      }
      if ((await checkHandlePermission(handle)) !== 'granted') {
        reportWorkspaceRootSkip({ ...workspace, reason: 'permission' }, onRootSkipped);
        return undefined;
      }
      return { workspace, handle };
    }),
  );
  const connected = new Map(
    entries
      .filter((entry): entry is WorkspaceEntry => entry !== undefined)
      .map((entry) => [entry.workspace.workspaceId, entry] as const),
  );
  const projects: ProjectRootConfig[] = configs
    .filter((config) => config.backend !== 'webaccess' || connected.has(config.workspaceId))
    // A node row naming a root no longer registered is unreachable, exactly as a
    // webaccess row whose workspace is gone: publishing it would route a project
    // at a directory nothing scans.
    .filter((config) => config.backend !== 'node' || config.path === undefined || nodeRoots.has(config.path))
    .map((config) => (config.backend === 'node' ? { ...config, path: config.path ?? nodeHomeRoot() } : config));
  const homeBackend = await getHomeStorageBackend();
  const homeRoot: StorageRootConfig =
    homeBackend === 'node' ? { backend: 'node', path: nodeHomeRoot() } : { backend: homeBackend };
  // Nothing stops the dialog from picking `userData/home` itself; both roots
  // would carry the same storage-root key, so Home wins and the duplicate goes.
  const homeNodePath = homeRoot.backend === 'node' ? homeRoot.path : undefined;
  const roots: StorageRootConfig[] = [
    homeRoot,
    ...[...nodeRoots.keys()]
      .filter((path) => path !== homeNodePath)
      .map((path): StorageRootConfig => ({ backend: 'node', path })),
    ...[...connected.values()].map(
      ({ workspace, handle }): StorageRootConfig => ({
        backend: 'webaccess',
        directoryHandle: handle,
        workspaceId: workspace.workspaceId,
      }),
    ),
  ];
  return { projects, roots };
}

function isProjectFileSystemConfig(value: unknown): value is ProjectFileSystemConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const config = value as Record<string, unknown>;
  if (
    typeof config['projectId'] !== 'string' ||
    typeof config['providerBasePath'] !== 'string' ||
    !isFlatProjectBasePath(config['providerBasePath'])
  ) {
    return false;
  }
  if (config['backend'] === 'node') {
    return config['path'] === undefined || typeof config['path'] === 'string';
  }
  return config['backend'] === 'indexeddb' || config['backend'] === 'opfs'
    ? true
    : config['backend'] === 'memory'
      ? typeof config['storageRootKey'] === 'string'
      : config['backend'] === 'webaccess' && typeof config['workspaceId'] === 'string';
}

/** List every webaccess project bound to the given workspace. */
export async function listProjectsForWorkspace(workspaceId: string): Promise<ProjectFileSystemConfig[]> {
  const all = await getAllProjectFileSystemConfigs();
  return all.filter((c) => c.backend === 'webaccess' && c.workspaceId === workspaceId);
}

// ============ Internal helpers ============

/** Single row, through the same backfilling read so slug allocation sees its siblings. */
async function readWorkspace(db: IDBDatabase, workspaceId: string): Promise<Workspace | undefined> {
  const rows = await readAllWorkspaces(db);
  return rows.find((workspace) => workspace.workspaceId === workspaceId);
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
