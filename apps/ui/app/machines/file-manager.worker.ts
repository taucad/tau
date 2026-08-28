/**
 * File-Manager Worker
 *
 * Single entry point for all filesystem access. Every connection (main thread,
 * kernel workers, git) receives a MessagePort that is served by the same
 * WorkspaceFileService instance. Mutations serialize on their logical and physical
 * conflict paths; independent authority subtrees can still run in parallel.
 */

import { exposeFileSystem, workerReadyMessageType } from '@taucad/fs-bridge';

import { populateBundledTypesMount } from '@taucad/filesystem/bundled-types-mount';
import type { BundledTypesMountEntry } from '@taucad/filesystem/bundled-types-mount';
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

const providerRegistry = new ProviderRegistry({ databasePrefix: metaConfig.databasePrefix });
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
    await fileService.mount('/node_modules', { backend: 'opfs', providerBasePath: 'tau-node-modules' });
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
try {
  const rootScope = { backend: homeStorageBackend } as const;
  const rootProvider = await providerRegistry.getProvider(rootScope);
  mountTable.mount('/', rootProvider, {
    backend: homeStorageBackend,
    storageRootKey: providerRegistry.resolveStorageRootKey(rootScope),
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
  const outcome = await ensureBundledTypesMount(fileService, buildBundledTypesPayload(), async (payload) =>
    populateBundledTypesMount(fileService, payload),
  );
  const populationLabel = outcome === 'skipped' ? 'bundled types current, skipped' : 'bundled types populated';
  console.debug(`[FM-Worker] ${populationLabel} +${(performance.now() - t0).toFixed(1)}ms`);
} catch (error) {
  postWorkerInitError('populateBundledTypesMount', error);
  throw error;
}

exposeFileSystem(fileService, {
  handlerForRoot: (root, context) => fileService.createRootedFileSystem(root, context),
  changeEventBus: eventBus,
  createCoalescer: (deliver, coalescingWindow, onOverflow) =>
    new EventCoalescer(deliver, { coalescingWindow, onOverflow }),
});

let languageFsSyncDispose: { dispose(): void } | undefined;

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
    }>,
  ) => {
    const { data } = event;
    if (data.type === 'filePool' && data.buffer instanceof SharedArrayBuffer) {
      fileService.setFilePool(new SharedPool(data.buffer));
      console.debug('[FM-Worker] filePool attached');
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
