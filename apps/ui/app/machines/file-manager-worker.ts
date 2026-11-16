/**
 * Create the file-manager worker. Vite bundles the worker only for the client: the server graph reaches this module
 * through the file-manager machine, and a `?worker` import there emitted the worker bundle, with every worker it
 * starts, into the server output (React Router 8 migration RR0, RD8).
 *
 * @param options - The worker's name, which carries Home's pinned storage engine to its module evaluation.
 * @returns The started module worker.
 */
export const createFileManagerWorker = (options: { readonly name: string }): Worker =>
  new Worker(new URL('file-manager.worker.ts', import.meta.url), { type: 'module', name: options.name });
