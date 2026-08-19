/**
 * Runtime Environment Detection
 *
 * Provides a unified, isomorphic environment detection utility for the kernel framework.
 * All environment-dependent branching should use this module instead of ad-hoc
 * `typeof process` / `typeof window` checks scattered across the codebase.
 */

/**
 * The set of runtime environments the kernel framework may execute in.
 *
 * - `node`    — Main thread of a Node.js process (CLI, server, test runner)
 * - `browser` — Main thread of a browser window/tab
 * - `worker`  — A Web Worker (dedicated, shared, or service worker) in a browser
 */
export type RuntimeEnvironment = 'node' | 'browser' | 'worker';

/**
 * Detect the current runtime environment.
 *
 * Detection order matters — a Node.js `worker_threads` worker still has
 * `process.versions.node`, so it is classified as `node` (not `worker`).
 * The `worker` variant only covers browser-side Web Workers.
 *
 * @returns the detected {@link RuntimeEnvironment}
 */
export function getEnvironment(): RuntimeEnvironment {
  // Node.js — check first because worker_threads also have `process`
  // oxlint-disable-next-line n/prefer-global/process, @typescript-eslint/no-unnecessary-condition -- process may be undefined in browser/worker
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }

  // Browser Web Worker — detect via WorkerGlobalScope (works even if `window` is polyfilled)
  // @ts-expect-error - WorkerGlobalScope is not defined in the global scope
  if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
    return 'worker';
  }

  return 'browser';
}

/**
 * Convenience: `true` when running in Node.js (main thread or worker_threads).
 *
 * @returns `true` in a Node.js environment
 */
export function isNode(): boolean {
  return getEnvironment() === 'node';
}

/**
 * Convenience: `true` when running in a browser main thread.
 *
 * @returns `true` in a browser window/tab
 */
export function isBrowser(): boolean {
  return getEnvironment() === 'browser';
}

/**
 * Convenience: `true` when running inside a browser Web Worker.
 *
 * @returns `true` in a dedicated, shared, or service worker
 */
export function isWebWorker(): boolean {
  return getEnvironment() === 'worker';
}

/**
 * Convert a `file://` URL to a filesystem path in Node.js.
 * In browser/worker environments, returns the original URL string unchanged.
 *
 * This is the isomorphic replacement for `import { fileURLToPath } from 'node:url'`
 * which crashes in browsers ("Module 'node:url' has been externalized").
 *
 * @param url - the URL to resolve (string or URL object)
 * @returns filesystem path in Node.js, or the original URL string in browsers
 */
export async function resolveFileUrl(url: string | URL): Promise<string> {
  const urlString = typeof url === 'string' ? url : url.href;

  if (!isNode() || !urlString.startsWith('file:')) {
    return urlString;
  }

  const { fileURLToPath } = await import('node:url');
  return fileURLToPath(urlString);
}
