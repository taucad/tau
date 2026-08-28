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
import { toStorageWriteError } from '#filesystem/workspace-errors.js';
import { probeHomeOpfs } from '#filesystem/home-opfs-probe.js';
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

export type HomeStorageBackend = 'indexeddb' | 'opfs';

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
};

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
 * The marker's `workspaceId` is authoritative and never rewritten in place; a
 * differing id means the caller deliberately minted a new identity (copied
 * folder), which does get a fresh marker.
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

const isHomeStorageBackend = (value: unknown): value is HomeStorageBackend => value === 'indexeddb' || value === 'opfs';

const detectHomeStorageBackend = async (): Promise<HomeStorageBackend> =>
  (await probeHomeOpfs()) ? 'opfs' : 'indexeddb';

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
          await syncWorkspaceMarker(handle, marker, {
            workspaceId: marker?.workspaceId ?? workspace.workspaceId,
            slug,
          });
          return { ...refreshed, minted: false };
        }
      }
      /* oxlint-enable eslint/no-await-in-loop -- End ordered handle identity checks. */
      // Adopt the marker's identity unless it already names a live row — that
      // means the user copied a marked folder, so the copy needs its own id.
      const adopted = marker && !existing.some((w) => w.workspaceId === marker.workspaceId) ? marker : undefined;
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

      return { ...workspace, minted: true };
    }),
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

/**
 * Remove the workspace entirely (handle, metadata, and any cached
 * disk-usage info). Callers must guarantee no `ProjectFileSystemConfig`
 * references this workspace — verify via `listProjectsForWorkspace`
 * before calling.
 *
 * If this workspace is the remembered creation location, Home is selected in
 * the same transaction that removes the row and handle.
 */
export async function forgetWorkspace(workspaceId: string): Promise<void> {
  return withProjectRootConfigurationMutation(async () =>
    withDb(async (db) => {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([workspacesStoreName, handlesStoreName, metaStoreName], 'readwrite');
        tx.addEventListener('complete', () => {
          resolve();
        });
        tx.addEventListener('error', () => {
          reject(tx.error ?? new Error('Failed to forget workspace'));
        });
        tx.objectStore(workspacesStoreName).delete(workspaceId);
        tx.objectStore(handlesStoreName).delete(workspaceId);
        const meta = tx.objectStore(metaStoreName);
        const readPreference = meta.get(projectCreationLocationMetaKey);
        readPreference.addEventListener('success', () => {
          const stored = readPreference.result as Partial<ProjectCreationLocationMeta> | undefined;
          const location = parseProjectCreationLocation(stored?.location);
          if (location?.kind === 'workspace' && location.workspaceId === workspaceId) {
            meta.put({
              key: projectCreationLocationMetaKey,
              location: homeProjectCreationLocation,
            } satisfies ProjectCreationLocationMeta);
          }
        });
      });
    }),
  );
}

/**
 * Replace a workspace's handle (e.g. user re-picks the same folder after a
 * permission revoke, or migrates the workspace to a different mounted
 * drive). The workspace identity stays stable so every project bound to
 * it remains valid.
 */
export async function updateWorkspaceHandle(workspaceId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  return withProjectRootConfigurationMutation(async () =>
    withDb(async (db) => {
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
    }),
  );
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
  return withProjectRootConfigurationMutation(async () =>
    withDb(
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
  return withProjectRootConfigurationMutation(async () =>
    withDb(
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
    ),
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
          resolve((request.result as unknown[]).filter((value) => isProjectFileSystemConfig(value)));
        });
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('Failed to retrieve all project filesystem configs'));
        });
      }),
  );
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
  readonly reason: 'missing' | 'permission';
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
  console.warn(
    `[HandleStore] Skipped workspace ${name ?? '(unknown)'} (${workspaceId}): ${
      reason === 'missing' ? 'missing-handle' : 'permission-state'
    }`,
  );
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
  const configs = await getAllProjectFileSystemConfigs();
  const projects: ProjectRootConfig[] = [];
  /* oxlint-disable eslint/no-await-in-loop -- The configuration snapshot performs bounded permission checks in stable registry order. */
  for (const config of configs) {
    // A row written before the flat-layout cutover still points at
    // `/projects/<dir>`, which `configureProjectRoots` rejects for the whole
    // topology. Skip it: discovery re-mints the row from disk on the next pass,
    // and the orphan sweep clears it when the directory is really gone.
    if (!isFlatProjectBasePath(config.providerBasePath)) {
      continue;
    }
    if (config.backend !== 'webaccess') {
      projects.push(config);
      continue;
    }
    const entry = await getWorkspace(config.workspaceId);
    if (!entry) {
      reportWorkspaceRootSkip({ workspaceId: config.workspaceId, reason: 'missing' }, onRootSkipped);
      continue;
    }
    if ((await checkHandlePermission(entry.handle)) !== 'granted') {
      reportWorkspaceRootSkip(
        { workspaceId: config.workspaceId, name: entry.workspace.name, reason: 'permission' },
        onRootSkipped,
      );
      continue;
    }
    projects.push({
      ...config,
      directoryHandle: entry.handle,
    });
  }

  const roots: StorageRootConfig[] = [{ backend: await getHomeStorageBackend() }];
  for (const workspace of await listWorkspaces()) {
    const entry = await getWorkspace(workspace.workspaceId);
    if (!entry) {
      reportWorkspaceRootSkip({ ...workspace, reason: 'missing' }, onRootSkipped);
      continue;
    }
    if ((await checkHandlePermission(entry.handle)) !== 'granted') {
      reportWorkspaceRootSkip({ ...workspace, reason: 'permission' }, onRootSkipped);
      continue;
    }
    roots.push({
      backend: 'webaccess',
      directoryHandle: entry.handle,
      workspaceId: workspace.workspaceId,
    });
  }
  /* oxlint-enable eslint/no-await-in-loop -- End bounded ordered permission checks. */
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
