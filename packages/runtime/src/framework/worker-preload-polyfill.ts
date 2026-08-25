/**
 * Minimal DOM stubs for Web Worker contexts.
 *
 * Two distinct bundler subsystems require these stubs:
 *
 * 1. **Vite's `__vitePreload` helper** wraps dynamic `import()` calls and
 *    injects `<link rel="modulepreload">` via `document` and dispatches
 *    `vite:preloadError` via `window.dispatchEvent()`.
 * 2. **Vite's HMR client** (`vite/dist/client/client.mjs`) probes
 *    `"document" in globalThis` and unconditionally calls every
 *    `document.X` it needs when the probe succeeds — without per-method
 *    `typeof` guards. Defining `globalThis.document` flips that probe
 *    to `true`, so the stub MUST cover every method the HMR client
 *    touches or the worker dies on import.
 *
 * The HMR-client crash is silent and manifests upstream as a
 * perpetually-hanging preview (the kernel client never gets the
 * `worker-ready` message). Audit Vite's `client.mjs` for `document.X`
 * accesses on every Vite upgrade and extend the stub accordingly. The
 * test file pins the contract.
 *
 * **KCL WASM (`web-time`)** reads high-resolution time from `window.performance`.
 * This file replaces `window` with a minimal stub for Vite; the stub must expose
 * `performance` delegated to `globalThis.performance` (which Node worker threads
 * and browsers already define).
 *
 * Environment detection (`getEnvironment()`) uses `WorkerGlobalScope` to
 * distinguish workers from browsers, so these stubs don't affect detection.
 *
 * This module MUST be the first static import in the worker entry point so that
 * stubs are in place before any bundler-injected preload code executes.
 */

// oxlint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op for DOM stub
const noop = (): void => {};

/*
 * Gate the polyfill to actual worker scopes. When `KernelRuntimeWorker` is
 * imported from a Node test harness (apps/api/app/testing/headless-runtime-client.ts
 * pulls in `@taucad/runtime-testing` -> `@taucad/runtime` -> this module),
 * we must NOT define `window`/`document` on the Node global — `gaxios`'s lazy
 * fetch resolver checks `typeof window !== 'undefined' && !!window` and would
 * pick `window.fetch` (undefined) over `node-fetch`'s default, which then
 * surfaces in google-auth-library as `fetchImpl is not a function`.
 *
 * `WorkerGlobalScope` and `importScripts` are scoped to DOM/WebWorker libs
 * which we don't ambiently include here; access them via `globalThis` so the
 * polyfill stays type-safe under both Node and worker compilation contexts.
 */
const globalScope = globalThis as Record<string, unknown>;
const inWorkerScope =
  globalScope['WorkerGlobalScope'] !== undefined || typeof globalScope['importScripts'] === 'function';

if (inWorkerScope && typeof document === 'undefined') {
  const noopElement = {
    rel: '',
    as: '',
    crossOrigin: '',
    href: '',
    setAttribute: noop,
    addEventListener: noop,
  };

  /*
   * Empty-array stand-in for `NodeList` / `HTMLCollection` results — Vite's
   * HMR client iterates results with `.forEach`, so a real Array suffices.
   */
  const emptyNodeList: never[] = [];

  Object.defineProperty(globalThis, 'document', {
    value: {
      // __vitePreload helper surface
      getElementsByTagName: () => emptyNodeList,
      querySelector: () => null,
      createElement: () => noopElement,
      head: { appendChild: noop },

      // Vite HMR client surface (vite/dist/client/client.mjs)
      querySelectorAll: () => emptyNodeList,
      addEventListener: noop,
      removeEventListener: noop,
      createTextNode: () => noopElement,
      body: null,
      visibilityState: 'visible',
    },
    writable: true,
    configurable: true,
  });
}

// oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- window can be undefined in browser/worker
if (inWorkerScope && globalThis.window === undefined) {
  Object.defineProperty(globalThis, 'window', {
    value: {
      dispatchEvent: noop,
      addEventListener: noop,
      removeEventListener: noop,
      get performance(): Performance {
        return globalThis.performance;
      },
    },
    writable: true,
    configurable: true,
  });
}

export {};
