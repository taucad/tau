/**
 * Zod schemas for the bundled web-worker transport.
 *
 * @internal
 */

import { z } from 'zod';
import { isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';

type WebWorkerLike = {
  postMessage(value: unknown, transfer?: readonly Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  terminate(): void;
};

const workerCtorSchema = z.custom<typeof Worker>((value) => typeof value === 'function');
const createWorkerSchema = z.custom<() => WebWorkerLike>((value) => typeof value === 'function');

const runtimeFileSystemSchema = z.custom<RuntimeFileSystem>(
  (value) => value === undefined || isRuntimeFileSystem(value),
);

export const webWorkerClientOptionsSchema = z
  .object({
    /**
     * URL of the worker module entry. Must resolve to a `type:
     * 'module'` worker that boots the runtime worker dispatcher.
     * Required unless `createWorker` is supplied.
     */
    url: z.union([z.string(), z.instanceof(URL)]).optional(),
    /**
     * Override for the global `Worker` constructor — primary use is
     * unit-test injection of a fake worker.
     */
    workerCtor: workerCtorSchema.optional(),
    /**
     * Factory for an app-owned worker instance. This is the right escape hatch
     * for frameworks such as Next/Turbopack that only compile module workers
     * when they see the native `new Worker(new URL(...), { type: 'module' })`
     * expression in application code.
     */
    createWorker: createWorkerSchema.optional(),
    /**
     * Optional shared-memory pool descriptor. When set the transport
     * advertises `pool` delivery on the descriptor; SAB allocation
     * happens lazily inside `client(...)` so consumers never see raw
     * `SharedArrayBuffer` plumbing.
     */
    sharedMemory: z
      .object({
        geometry: z
          .object({
            bytes: z.number().int().positive(),
          })
          .optional(),
      })
      .optional(),
    /**
     * Optional filesystem handle produced by a `fromX` factory.
     */
    fileSystem: runtimeFileSystemSchema.optional(),
  })
  .strict()
  .refine((value) => value.url !== undefined || typeof value.createWorker === 'function', {
    message: 'webWorkerTransport requires `createWorker` or an explicit worker `url`',
    path: ['createWorker'],
  });
