/**
 * File-Manager Worker
 *
 * Single entry point for all filesystem access. Every connection (main thread,
 * kernel workers, git) receives a MessagePort that is served by the same
 * WorkspaceFileService instance. Mutations serialize on their logical and physical
 * conflict paths; independent authority subtrees can still run in parallel.
 */

/* eslint-disable tau-lint/no-direct-indexeddb -- This worker is the browser compute-store authority. */

import { exposeFileSystem, workerReadyMessageType } from '@taucad/fs-bridge';
import { composeView } from '@taucad/filesystem/composed-view';
import { withReadContentOps } from '@taucad/filesystem/content-ops';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import {
  createGitRemoteTransport,
  createIsomorphicGitRevisionPort,
  createRevisionHttpClient,
  recordLastPush,
  sendKeepalivePush,
} from '@taucad/revisions';
import type { PushRecorder } from '@taucad/revisions';
import { randomUuid } from '@taucad/utils/id';
import { createIndexedDbComputeEngine, exposeComputeStoreChannel } from '@taucad/runtime/host';

import { populateBundledTypesMount } from '@taucad/filesystem/bundled-types-mount';
import type { BundledTypesMountEntry } from '@taucad/filesystem/bundled-types-mount';
import type { WorkspaceScope } from '@taucad/filesystem';
import {
  ChangeEventBus,
  EventCoalescer,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  WorkspaceFileService,
} from '@taucad/filesystem';
import { SharedPool } from '@taucad/memory';
import { authoringTypeMaps } from '@taucad/api-extractor/authoring-types';
import { kernelTypePackageMaps } from '@taucad/api-extractor/kernel-types';
import type { SyncFsWorkspaceAdapter } from '@taucad/lsp-fs/sync';
import { attachSyncFsServer } from '@taucad/lsp-fs/sync';
import { metaConfig } from '#constants/meta.constants.js';
import { ensureBundledTypesMount } from '#machines/bundled-types-sentinel.js';
import { homeBackendFromWorkerName } from '#machines/file-manager-worker-name.js';
import { listWorkspaceDirectories } from '#machines/file-manager-sync-fs-adapter.js';
import {
  createCheckoutRoutes,
  createWorkerRevisionRegistry,
  versionedChangePaths,
} from '#machines/file-manager.worker.revisions.js';
import { systemSkillsOverlay } from '#workers/system-skills-overlay.js';

/**
 * Handshake for the node filesystem backend (desktop only).
 *
 * The shell brokers one `MessageChannelMain` to the provider host in the
 * services utility; main relays this end through the preload and the FM
 * machine, which posts it as `{ type: 'nodeFsPort' }` right after constructing
 * this worker. The listener is installed here — before the `/` root mount's
 * top-level await — because a node-backed Home cannot mount without it.
 */
let nodeFsDelivery = Promise.withResolvers<MessagePort>();
/** Nobody may await a port the previous channel already consumed and killed. */
let nodeFsPortClaimed = false;
const nodeFsHomeRoot = Promise.withResolvers<string>();
self.addEventListener('message', (event: MessageEvent<{ type?: string; port?: unknown; homeRoot?: unknown }>) => {
  const { data } = event;
  if (data.type === 'nodeFsPort' && data.port instanceof MessagePort && typeof data.homeRoot === 'string') {
    nodeFsHomeRoot.resolve(data.homeRoot);
    nodeFsDelivery.resolve(data.port);
  }
});

const providerRegistry = new ProviderRegistry({
  databasePrefix: metaConfig.databasePrefix,
  createNodeFsPort: async () => {
    if (nodeFsPortClaimed) {
      // The previous channel died (the registry evicts on close and calls back
      // here). The shell forks a fresh services utility on the next `connect()`,
      // so ask for another port instead of re-handing the dead one — awaiting
      // the one-shot delivery would wedge the filesystem for the session.
      nodeFsDelivery = Promise.withResolvers<MessagePort>();
      nodeFsPortClaimed = false;
      self.postMessage({ type: 'nodeFsPortRequest' });
    }
    const port = await nodeFsDelivery.promise;
    nodeFsPortClaimed = true;
    return port;
  },
});
const resourceQueue = new ResourceQueue();
const eventBus = new ChangeEventBus();
const mountTable = new MountTable();

/**
 * Structured envelope sent to the main thread when the worker catches one of
 * its own crashes. Mirrors the `WorkerErrorEnvelope` type the main-thread FM
 * machine listens for in `file-manager-worker-error.ts`. Posting this before
 * the worker re-throws (or before the browser fires the opaque load-failure
 * `error` event) ensures the FM XState machine surfaces a real message
 * instead of `undefined undefined undefined`.
 */
type WorkerErrorEnvelope = {
  type: '__worker_init_error__' | '__worker_runtime_error__';
  phase: string;
  name?: string;
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  causeMessage?: string;
};

const stringifyCause = (cause: unknown): string | undefined => {
  if (cause === undefined) {
    return undefined;
  }
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === 'string') {
    return cause;
  }
  try {
    return JSON.stringify(cause);
  } catch {
    return Object.prototype.toString.call(cause);
  }
};

const serializeError = (error: unknown): { name?: string; message: string; stack?: string; causeMessage?: string } => {
  if (error instanceof Error) {
    const { name, message, stack, cause } = error;
    return { name, message, stack, causeMessage: stringifyCause(cause) };
  }
  return { message: typeof error === 'string' ? error : JSON.stringify(error) };
};

const postWorkerInitError = (phase: string, error: unknown): void => {
  const envelope: WorkerErrorEnvelope = { type: '__worker_init_error__', phase, ...serializeError(error) };
  self.postMessage(envelope);
  console.error(`[FM-Worker] ${phase} failed:`, error);
};

self.addEventListener('error', (event) => {
  const envelope: WorkerErrorEnvelope = {
    type: '__worker_runtime_error__',
    phase: 'runtime',
    message: event.message || 'Unknown worker runtime error',
    filename: event.filename || undefined,
    lineno: event.lineno || undefined,
    colno: event.colno || undefined,
    stack: event.error instanceof Error ? event.error.stack : undefined,
    name: event.error instanceof Error ? event.error.name : undefined,
  };
  self.postMessage(envelope);
});

self.addEventListener('unhandledrejection', (event) => {
  const envelope: WorkerErrorEnvelope = {
    type: '__worker_runtime_error__',
    phase: 'unhandledrejection',
    ...serializeError(event.reason),
  };
  self.postMessage(envelope);
});

async function createNodeModulesMount(): Promise<void> {
  try {
    await fileService.mount('/node_modules', {
      backend: 'opfs',
      providerBasePath: 'tau-node-modules',
      class: 'derived',
    });
    console.debug('[FM-Worker] /node_modules mounted on OPFS');
  } catch (error) {
    console.warn('[FM-Worker] Failed to mount OPFS /node_modules, falling through to root', error);
  }
}

const buildBundledTypesPayload = (): readonly BundledTypesMountEntry[] =>
  [...kernelTypePackageMaps, ...authoringTypeMaps].flatMap((typesMap) =>
    Object.entries(typesMap).map(
      ([packageName, entry]): BundledTypesMountEntry => ({
        packageName,
        content: entry.content,
        files: entry.files,
        packageJson: entry.packageJson,
      }),
    ),
  );

const fileService = new WorkspaceFileService({
  providerRegistry,
  resourceQueue,
  eventBus,
  mountTable,
});

const t0 = performance.now();
console.debug(`[FM-Worker] module evaluated in ${t0.toFixed(1)}ms`);

/**
 * Physical engine of the system-owned Home workspace, pinned per browser
 * profile and handed over by the FM machine as this worker's name (see
 * `file-manager-worker-name.ts`). The pin itself is owned by main-thread-only
 * `handle-store.ts`, and the root mount below runs during module evaluation,
 * so the name is the only channel that is both authoritative and readable in
 * time.
 */
const homeStorageBackend = homeBackendFromWorkerName(self.name);

// `/` is Home's workspace root: everything the app persists outside a
// configured mount (`/projects/<id>` routes, `/previews/<instance>`,
// `/node_modules`) lands here, so it must follow the same engine pin that
// project discovery scans — otherwise an OPFS-pinned profile would keep
// writing Home-level state (`/.agents/…`) into IndexedDB where nothing looks
// for it.
/**
 * Home's root scope. A node-backed Home blocks here until the shell hands over
 * the brokered port and the absolute `userData/home` path with it.
 */
const resolveHomeRootScope = async (): Promise<WorkspaceScope> => {
  if (homeStorageBackend !== 'node') {
    return { backend: homeStorageBackend };
  }
  return { backend: 'node', path: await nodeFsHomeRoot.promise };
};

try {
  const rootScope = await resolveHomeRootScope();
  const rootProvider = await providerRegistry.getProvider(rootScope);
  mountTable.mount('/', rootProvider, {
    backend: homeStorageBackend,
    storageRootKey: providerRegistry.resolveStorageRootKey(rootScope),
    class: 'authored',
  });
} catch (error) {
  postWorkerInitError(`mount root ${homeStorageBackend} provider`, error);
  throw error;
}

try {
  await createNodeModulesMount();
} catch (error) {
  postWorkerInitError('createNodeModulesMount', error);
  throw error;
}

try {
  const outcome = await ensureBundledTypesMount(fileService, buildBundledTypesPayload(), {
    populate: async (payload) => populateBundledTypesMount(fileService, payload),
    // Vite substitutes this define inside worker bundles too (verified against
    // vite 8.0.10); a realm without it falls back to the payload digest.
    buildIdentity: typeof tauBuildId === 'number' ? String(tauBuildId) : undefined,
  });
  const populationLabel = outcome === 'skipped' ? 'bundled types current, skipped' : 'bundled types populated';
  console.debug(`[FM-Worker] ${populationLabel} +${(performance.now() - t0).toFixed(1)}ms`);
} catch (error) {
  postWorkerInitError('populateBundledTypesMount', error);
  throw error;
}

exposeFileSystem(fileService, {
  /*
   * A connection that names a consumer gets that consumer's composed view
   * (architecture L4); one that does not gets the checkout itself, because the
   * host's own capture, apply and language planes must read the working copy
   * and never the overlays composed above it (V6).
   */
  handlerForRoot: (root, context, consumer) => {
    const filesystem = fileService.createRootedFileSystem(root, context);
    const view =
      consumer === undefined
        ? filesystem
        : composeView({ filesystem }, { consumer, overlays: [systemSkillsOverlay()], policy: tauPathPolicy });
    /*
     * The read content operations run here, over the view the connection asked
     * for (charter D2); `search` and `statTree` are already on it, answered from
     * the root's index and masked by the view itself (D3).
     */
    return withReadContentOps(view, tauPathPolicy);
  },
  changeEventBus: eventBus,
  createCoalescer: (deliver, coalescingWindow, onOverflow) =>
    new EventCoalescer(deliver, { coalescingWindow, onOverflow }),
});

/**
 * One revision root per opened project (A38).
 *
 * The page opens a `MessagePort` per project route and reads the
 * `RevisionStatus` projection over it; the tree itself — `projectRevisionsMachine`
 * and its children over `createIsomorphicGitRevisionPort` — runs here, where the
 * mount table can give each checkout route its own rooted provider and where
 * every content change is already observed.
 *
 * The authority epoch is the **project session's** identity (W19, W3c review
 * R4): a lease written under any other epoch belongs to a session that no
 * longer owns the project — another document, or an earlier session of this
 * one — and `sweepLeases` retires it on open (N3). Only the session that owns
 * a project's revisions actor system may sweep its leases, which is what makes
 * the rule hold across processes and not merely across documents.
 *
 * The page sends its session's epoch with `revisionsConnect`; a connection
 * that names none falls back to this document's, so a host that has no session
 * layer still gets the old per-document guarantee.
 */
const documentAuthorityEpoch = randomUuid();
const projectAuthorityEpochs = new Map<string, string>();
/* One place a linked checkout's files live, for the port that creates them
 * (W7 review R2/P24). Without it `capabilities.checkouts` is false and no
 * browser project can hold a second branch at all. */
const checkoutRoutes = createCheckoutRoutes({ mountTable, fileService });
/*
 * The last push each project made, kept so `pagehide` can offer it again under
 * `keepalive` (W13, A32). The recorder wraps the *client*, so it is built here
 * beside the client and read back by project id.
 */
const pushRecorders = new Map<string, PushRecorder>();
const revisionRegistry = createWorkerRevisionRegistry({
  /*
   * P31: one project, one store.
   *
   * On a host-served project the Node host serves the filesystem *and* owns the
   * revisions actor system over the project's own `.git/`. A browser revision
   * port here would open a second writer onto that same `.git/` (D29 gave both
   * legs one repository name), recording the same bytes twice and agreeing with
   * neither side —
   * the two-store ceiling W5 §9 recorded. The session injects the host kind at
   * `revisionsConnect`; a host-served project gets no port at all, and its
   * `RevisionStatus` projection comes from the Node side.
   */
  hostServesRevisions: (projectId) => hostServedProjects.has(projectId),
  createPort: (projectId, credential) => {
    const recorder = recordLastPush(
      createRevisionHttpClient({ credentials: 'include', ...createGitRemoteTransport(credential) }),
    );
    pushRecorders.set(projectId, recorder);
    return createIsomorphicGitRevisionPort({
      filesystem: fileService.createRootedFileSystem(`/projects/${projectId}`),
      checkouts: checkoutRoutes(projectId),
      /* The page's session is a cookie on the API's origin, so `include` is the
       * whole of "this browser is signed in" (I8, S24). The worker never holds
       * a token and never puts one in a URL. A *third-party* remote is reached
       * through the API's git proxy instead, carrying that remote's own
       * credential and never the Tau session — which is the whole of
       * `createGitRemoteTransport` (S34, P17, W12). */
      http: recorder.client,
    });
  },
  /* The same credential rules as any push: the session cookie for Tau's own
   * origin, and nothing at all for a remote the page never credited. */
  keepalive: async (projectId) => sendKeepalivePush(pushRecorders.get(projectId)?.last(), { credentials: 'include' }),
  /* Which POST the re-send above may carry: the history set's, marked by the
   * scheduler at the moment it pushes it (W13 review 2 R3/P35). */
  recordHistoryPush: (projectId) => pushRecorders.get(projectId)?.record,
  /* A recorded pack is as big as the push was; it goes when the project does. */
  released: (projectId) => {
    pushRecorders.delete(projectId);
  },
  filesystem: (root) => fileService.createRootedFileSystem(root),
  observe: (projectId, onChanged) =>
    eventBus.subscribe((event) => {
      const paths = versionedChangePaths(event, `/projects/${projectId}`);
      if (paths.length > 0) {
        onChanged(paths);
      }
    }),
  authorityEpoch: (projectId) => projectAuthorityEpochs.get(projectId) ?? documentAuthorityEpoch,
});

let languageFsSyncDispose: { dispose(): void } | undefined;
let computeStore: ReturnType<typeof createIndexedDbComputeEngine> | undefined;
/*
 * Compute admission is per **live project**, not per active route (S44).
 *
 * Several projects run agents at once, so one admitted id was the bug: opening
 * B disposed A's channels while A's turn was still computing. The session
 * admits its project on `open` and releases it on `close`, and a project's
 * channels are disposed only by its own release.
 */
const admittedComputeProjectIds = new Set<string>();
const computeChannels = new Map<string, Set<ReturnType<typeof exposeComputeStoreChannel>>>();
/** Projects whose filesystem is served by a host that owns their revisions (P31). */
const hostServedProjects = new Set<string>();

const disposeComputeChannels = (projectId: string, reason: string): void => {
  for (const channel of computeChannels.get(projectId) ?? []) {
    channel.dispose(reason);
  }
  computeChannels.delete(projectId);
};

const rejectComputePort = (port: MessagePort, message: string): void => {
  port.postMessage({ error: message });
  port.close();
};

const openComputeChannel = async (port: MessagePort, projectId: unknown): Promise<void> => {
  try {
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Compute project identity is required.');
    }
    if (!admittedComputeProjectIds.has(projectId)) {
      throw new Error('Compute store project authority does not match a live project.');
    }
    computeStore ??= createIndexedDbComputeEngine({ factory: globalThis.indexedDB });
    const control = await computeStore.control({ workspace: projectId });
    if (!admittedComputeProjectIds.has(projectId)) {
      throw new Error('Compute store project authority changed while opening the channel.');
    }
    const channel = exposeComputeStoreChannel({
      port,
      engine: computeStore.engine,
      workspace: projectId,
      generation: async () => {
        const report = await control.inspect({});
        return report.generation;
      },
    });
    const channels = computeChannels.get(projectId) ?? new Set();
    channels.add(channel);
    computeChannels.set(projectId, channels);
    channel.onClose(() => channels.delete(channel));
  } catch (error) {
    rejectComputePort(port, error instanceof Error ? error.message : String(error));
  }
};

const runComputeControl = async (data: {
  port: MessagePort;
  projectId: unknown;
  action: unknown;
  budget?: unknown;
  cursor?: unknown;
}): Promise<void> => {
  try {
    if (typeof data.projectId !== 'string' || data.projectId.length === 0) {
      throw new Error('Compute project identity is required.');
    }
    if (!admittedComputeProjectIds.has(data.projectId)) {
      throw new Error('Compute control project authority does not match a live project.');
    }
    if (data.action !== 'inspect' && data.action !== 'clear' && data.action !== 'collect') {
      throw new Error('Compute control action is invalid.');
    }
    if (
      data.action === 'collect' &&
      (typeof data.budget !== 'number' || !Number.isSafeInteger(data.budget) || data.budget < 1 || data.budget > 1000)
    ) {
      throw new Error('Compute collection budget must be a safe integer from 1 to 1000.');
    }
    if (data.cursor !== undefined && (typeof data.cursor !== 'string' || data.cursor.length > 1024)) {
      throw new Error('Compute collection cursor is invalid.');
    }
    computeStore ??= createIndexedDbComputeEngine({ factory: globalThis.indexedDB });
    const control = await computeStore.control({ workspace: data.projectId });
    if (!admittedComputeProjectIds.has(data.projectId)) {
      throw new Error('Compute control project authority changed while opening the store.');
    }
    let result;
    if (data.action === 'inspect') {
      result = await control.inspect({});
    } else if (data.action === 'clear') {
      result = await control.clear({});
    } else {
      result = await control.collect({
        budget: data.budget as number,
        ...(data.cursor ? { cursor: data.cursor } : {}),
      });
    }
    data.port.postMessage({ result });
  } catch (error) {
    data.port.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    data.port.close();
  }
};

self.addEventListener(
  'message',
  (
    event: MessageEvent<{
      type?: string;
      buffer?: SharedArrayBuffer;
      port?: MessagePort;
      slotSab?: SharedArrayBuffer;
      arenaSab?: SharedArrayBuffer;
      rootDirectory?: string;
      projectId?: unknown;
      hostServesRevisions?: unknown;
      sessionEpoch?: unknown;
      action?: unknown;
      budget?: unknown;
      cursor?: unknown;
    }>,
  ) => {
    const { data } = event;
    if (data.type === 'computeStoreAdmission') {
      if (typeof data.projectId === 'string' && data.projectId.length > 0) {
        admittedComputeProjectIds.add(data.projectId);
      }
      return;
    }
    if (data.type === 'computeStoreRelease') {
      if (typeof data.projectId === 'string' && data.projectId.length > 0) {
        admittedComputeProjectIds.delete(data.projectId);
        disposeComputeChannels(data.projectId, 'project closed');
      }
      return;
    }
    if (data.type === 'filePool' && data.buffer instanceof SharedArrayBuffer) {
      fileService.setFilePool(new SharedPool(data.buffer));
      console.debug('[FM-Worker] filePool attached');
      return;
    }

    if (data.type === 'revisionsConnect' && data.port instanceof MessagePort) {
      if (typeof data.projectId === 'string' && data.projectId.length > 0) {
        if (data.hostServesRevisions === true) {
          hostServedProjects.add(data.projectId);
        } else {
          hostServedProjects.delete(data.projectId);
        }
        if (typeof data.sessionEpoch === 'string' && data.sessionEpoch.length > 0) {
          projectAuthorityEpochs.set(data.projectId, data.sessionEpoch);
        }
        revisionRegistry.connect(data.port, data.projectId);
      } else {
        data.port.close();
      }
      return;
    }

    if (data.type === 'computeStoreConnect' && data.port instanceof MessagePort) {
      void openComputeChannel(data.port, data.projectId);
      return;
    }

    if (data.type === 'computeStoreControl' && data.port instanceof MessagePort) {
      void runComputeControl({
        port: data.port,
        projectId: data.projectId,
        action: data.action,
        budget: data.budget,
        cursor: data.cursor,
      });
      return;
    }

    if (
      data.type === 'languageFsSyncAttach' &&
      data.port instanceof MessagePort &&
      data.slotSab instanceof SharedArrayBuffer &&
      data.arenaSab instanceof SharedArrayBuffer &&
      typeof data.rootDirectory === 'string'
    ) {
      languageFsSyncDispose?.dispose();
      const rootedFileSystem = fileService.createRootedFileSystem(data.rootDirectory);
      const workspace: SyncFsWorkspaceAdapter = {
        readFileBytes: async (path) => {
          const bytes = await rootedFileSystem.readFile(path);
          if (typeof bytes === 'string') {
            return new TextEncoder().encode(bytes);
          }
          return bytes;
        },
        stat: async (path) => {
          const stat = await rootedFileSystem.stat(path);
          return { mtimeMs: stat.mtimeMs, isDirectory: stat.type === 'dir' };
        },
        listDirectories: async (path) => listWorkspaceDirectories(rootedFileSystem, path),
      };
      languageFsSyncDispose = attachSyncFsServer({
        port: data.port,
        slotSab: data.slotSab,
        arenaSab: data.arenaSab,
        workspace,
      });
      console.debug('[FM-Worker] languageFs sync FS attach');
    }
  },
);

console.debug(`[FM-Worker] exposeFileSystem registered at +${(performance.now() - t0).toFixed(1)}ms`);
self.postMessage({ type: workerReadyMessageType });
