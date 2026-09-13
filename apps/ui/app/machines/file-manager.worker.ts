/**
 * File-Manager Worker
 *
 * Single entry point for all filesystem access. Every connection (main thread,
 * kernel workers, git) receives a MessagePort that is served by the same
 * WorkspaceFileService instance. Writes to the same file are serialized via a per-file
 * ResourceQueue (VS Code pattern); writes to different files run in parallel.
 */

import { exposeFileSystem, workerReadyMessageType } from '@taucad/runtime/transport-internals';

import { populateBundledTypesMount } from '@taucad/filesystem/bundled-types-mount';
import type { BundledTypesMountEntry } from '@taucad/filesystem/bundled-types-mount';
import { FileSystemAccessProvider } from '@taucad/filesystem/backend';
import {
  ChangeEventBus,
  EventCoalescer,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  ThrottledWorker,
  WorkspaceFileService,
} from '@taucad/filesystem';
import { SharedPool } from '@taucad/memory';
import { kernelTypeMaps } from '@taucad/api-extractor/kernel-types';
import type { SyncFsWorkspaceAdapter } from '@taucad/lsp-fs/sync';
import { attachSyncFsServer } from '@taucad/lsp-fs/sync';
import { metaConfig } from '#constants/meta.constants.js';

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
  if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
    console.debug('[FM-Worker] OPFS not available, /node_modules falls through to root mount');
    return;
  }
  try {
    const opfsRoot = await navigator.storage.getDirectory();
    const nodeModulesHandle = await opfsRoot.getDirectoryHandle('tau-node-modules', { create: true });
    const nodeModulesProvider = new FileSystemAccessProvider(nodeModulesHandle);
    // Worker-internal OPFS-backed mount — no workspaceId because the
    // backing storage isn't user-pickable. The discriminated
    // `MountConfig` accepts `backend: 'opfs'` without the webaccess
    // identity fields.
    mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'opfs' });
    console.debug('[FM-Worker] /node_modules mounted on OPFS');
  } catch (error) {
    console.warn('[FM-Worker] Failed to mount OPFS /node_modules, falling through to root', error);
  }
}

function buildBundledTypesPayload(): readonly BundledTypesMountEntry[] {
  return kernelTypeMaps.flatMap((typesMap) =>
    Object.entries(typesMap).map(
      (entry): BundledTypesMountEntry => ({
        packageName: entry[0],
        content: entry[1],
        prewrapped: true,
      }),
    ),
  );
}

const fileService = new WorkspaceFileService({
  providerRegistry,
  resourceQueue,
  eventBus,
  mountTable,
});

const t0 = performance.now();
console.debug(`[FM-Worker] module evaluated in ${t0.toFixed(1)}ms`);

try {
  await fileService.mount('/', { backend: 'indexeddb' });
} catch (error) {
  postWorkerInitError("mount('/', 'indexeddb')", error);
  throw error;
}

try {
  await createNodeModulesMount();
} catch (error) {
  postWorkerInitError('createNodeModulesMount', error);
  throw error;
}

try {
  await populateBundledTypesMount(fileService, buildBundledTypesPayload());
  console.debug(`[FM-Worker] bundled types populated +${(performance.now() - t0).toFixed(1)}ms`);
} catch (error) {
  postWorkerInitError('populateBundledTypesMount', error);
  throw error;
}

exposeFileSystem(fileService, {
  watchHandler: {
    watch(request, handler, ownerId) {
      return fileService.watch(request, handler, ownerId);
    },
    cleanupWatches(ownerId) {
      fileService.cleanupWatches(ownerId);
    },
  },
  changeEventBus: eventBus,
  createCoalescer: (deliver, coalescingWindow) => new EventCoalescer(deliver, { coalescingWindow }),
  createThrottledWorker: (handler) => new ThrottledWorker(handler),
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
      data.arenaSab instanceof SharedArrayBuffer
    ) {
      languageFsSyncDispose?.dispose();
      const workspace: SyncFsWorkspaceAdapter = {
        readFileBytes: async (path) => {
          const bytes = await fileService.readFile(path);
          if (typeof bytes === 'string') {
            return new TextEncoder().encode(bytes);
          }
          return bytes;
        },
        stat: async (path) => {
          const stat = await fileService.stat(path);
          return { mtimeMs: stat.mtimeMs, isDirectory: stat.type === 'dir' };
        },
        readdir: async (path) => fileService.readdir(path),
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
