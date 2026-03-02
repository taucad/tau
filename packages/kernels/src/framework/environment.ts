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
 */
export function getEnvironment(): RuntimeEnvironment {
  // Node.js — check first because worker_threads also have `process`
  // eslint-disable-next-line n/prefer-global/process, @typescript-eslint/no-unnecessary-condition -- process may be undefined in browser/worker
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }

  // Browser Web Worker — `self` exists and is not `window`
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- self may not exist
  if (globalThis.self !== undefined && typeof self.postMessage === 'function' && globalThis.window === undefined) {
    return 'worker';
  }

  return 'browser';
}

/** Convenience: `true` when running in Node.js (main thread or worker_threads). */
export function isNode(): boolean {
  return getEnvironment() === 'node';
}

/** Convenience: `true` when running in a browser main thread. */
export function isBrowser(): boolean {
  return getEnvironment() === 'browser';
}

/** Convenience: `true` when running inside a browser Web Worker. */
export function isWebWorker(): boolean {
  return getEnvironment() === 'worker';
}

/**
 * Assert that the current environment supports SharedArrayBuffer.
 * In browsers/workers, this requires cross-origin isolation (COOP + COEP headers).
 * In Node.js, SharedArrayBuffer is always available.
 *
 * @throws TypeError when SharedArrayBuffer is not supported by the browser
 * @throws Error when cross-origin isolation headers are missing
 */
export function assertCrossOriginIsolated(): void {
  if (isNode()) {
    return;
  }

  if (typeof SharedArrayBuffer === 'undefined') {
    throw new TypeError(
      'SharedArrayBuffer is not available in this browser. Use a modern browser that supports SharedArrayBuffer.',
    );
  }

  if (!globalThis.crossOriginIsolated) {
    throw new Error(
      'SharedArrayBuffer requires cross-origin isolation. ' +
        'The server must send these HTTP headers:\n' +
        '  Cross-Origin-Opener-Policy: same-origin\n' +
        '  Cross-Origin-Embedder-Policy: require-corp (or credentialless)\n' +
        'See https://web.dev/articles/cross-origin-isolation-guide',
    );
  }
}

/**
 * Convert a `file://` URL to a filesystem path in Node.js.
 * In browser/worker environments, returns the original URL string unchanged.
 *
 * This is the isomorphic replacement for `import { fileURLToPath } from 'node:url'`
 * which crashes in browsers ("Module 'node:url' has been externalized").
 */
export async function resolveFileUrl(url: string | URL): Promise<string> {
  const urlString = typeof url === 'string' ? url : url.href;

  if (!isNode() || !urlString.startsWith('file:')) {
    return urlString;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention -- node API
  const { fileURLToPath } = await import('node:url');
  return fileURLToPath(urlString);
}
