/**
 * Create the object-store worker. Vite bundles the worker only for the client: the server graph reaches this module
 * through the project library, and a `?worker` import there emitted the worker bundle into the server output (React
 * Router 8 migration RR0, RD8).
 *
 * @returns The started module worker.
 */
export const createObjectStoreWorker = (): Worker =>
  new Worker(new URL('object-store.worker.ts', import.meta.url), { type: 'module' });
