/**
 * Home-engine handoff between the FM machine and the file-manager worker.
 *
 * The worker installs its `/` composition mount while its module evaluates, so
 * the engine has to be readable synchronously at that point — before any
 * message could have been observed. Home's pin lives in `handle-store.ts`,
 * which runs on the main thread only (its permission APIs need a window), and
 * `name` is the single constructor option Vite's worker wrapper forwards. The
 * resolved pin therefore travels as a suffix on the worker name.
 */

import type { HomeStorageBackend } from '#filesystem/handle-store.js';

const workerNamePrefix = 'fm-root';

/** Worker name carrying the resolved Home engine to the worker's `/` mount. */
export function fileManagerWorkerName(backend: HomeStorageBackend): string {
  return `${workerNamePrefix}:${backend}`;
}

/**
 * Read the Home engine back out of a worker name.
 *
 * IndexedDB is the fallback for any unrecognized name: every profile can open
 * it, so a worker created without this handoff still gets a mountable root
 * instead of failing to boot.
 */
export function homeBackendFromWorkerName(name: string): HomeStorageBackend {
  return name.slice(name.lastIndexOf(':') + 1) === 'opfs' ? 'opfs' : 'indexeddb';
}
