/**
 * The kcl-lib engine client waits on its WASM timer (the `zduny-wasm-timer` crate) for asynchronous engine commands such as foreign-file
 * imports. The crate schedules on the JS global and panics with "no supported global object available" unless that
 * global is a `Window` or a `WorkerGlobalScope`. Browser pages and workers are one or the other; Node, Deno and Bun
 * are neither, though their global has the `performance` and `setTimeout` the crate calls.
 */

/**
 * Lets kcl-lib's timer run outside browsers: where the global is neither a `Window` nor a `WorkerGlobalScope`, it
 * defines a `Window` class the global is an instance of. It is a no-op in browser pages and workers. It shims
 * `Window` rather than `WorkerGlobalScope` because Emscripten glue, libcascade's included, reads
 * `globalThis.WorkerGlobalScope` to decide that it runs in a worker.
 */
export function ensureWasmTimerGlobal(): void {
  const scope = globalThis as { Window?: unknown; WorkerGlobalScope?: unknown };
  if (scope.Window !== undefined || scope.WorkerGlobalScope !== undefined) {
    return;
  }

  // A `Window` constructor that only the global object is an instance of.
  const globalWindow = Object.defineProperty(() => undefined, Symbol.hasInstance, {
    value: (value: unknown): boolean => value === globalThis,
  });
  Object.defineProperty(globalThis, 'Window', { value: globalWindow, configurable: true, writable: true });
}
