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
export function fileManagerWorkerName(
  backend: HomeStorageBackend,
  options: { readonly safeMode?: boolean } = {},
): string {
  return `${workerNamePrefix}${options.safeMode === true ? `:${safeModeSegment}` : ''}:${backend}`;
}

/* Safe mode is known at boot and travels on the name too, so the worker reads it once, never live (W9 R5). */
const safeModeSegment = 'safe';

/**
 * Whether a worker name says its page load started in safe mode.
 *
 * @param name - The worker's name.
 * @returns Whether it is in safe mode.
 */
export function isSafeModeWorkerName(name: string): boolean {
  return name.split(':').includes(safeModeSegment);
}

/**
 * Read the Home engine back out of a worker name.
 *
 * IndexedDB is the fallback for any unrecognized name: every profile can open
 * it, so a worker created without this handoff still gets a mountable root
 * instead of failing to boot.
 */
export function homeBackendFromWorkerName(name: string): HomeStorageBackend {
  const suffix = name.slice(name.lastIndexOf(':') + 1);
  return suffix === 'opfs' || suffix === 'node' ? suffix : 'indexeddb';
}
