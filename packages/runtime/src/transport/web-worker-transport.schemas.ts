/**
 * Zod schemas for the bundled web-worker transport.
 *
 * @internal
 */

import { z } from 'zod';
import { isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { KernelWorker } from '#framework/kernel-worker.js';

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

const sharedArrayBufferSchema = z.custom<SharedArrayBuffer>(
  (value) => typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer,
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
    /**
     * Caller-owned `SharedArrayBuffer` for the file-content pool.
     * Forwarded verbatim into the worker via `memoryHandle.filePoolBuffer`.
     */
    filePoolBuffer: sharedArrayBufferSchema.optional(),
  })
  .strict()
  .refine((value) => value.url !== undefined || typeof value.createWorker === 'function', {
    message: 'webWorkerTransport requires `createWorker` or an explicit worker `url`',
    path: ['createWorker'],
  });

/**
 * Worker-side `KernelWorker` instance the host wires its
 * `ChannelServer` against. Validated structurally — the worker
 * surface is large and we don't want a Zod schema for every
 * `KernelWorker` method, so we accept any non-null object as a
 * KernelWorker (the dispatcher's runtime checks reject unfit
 * shapes downstream).
 */
const kernelWorkerSchema = z.custom<KernelWorker>((value) => typeof value === 'object' && value !== null);

export const webWorkerHostOptionsSchema = z
  .object({
    /** Worker-side {@link KernelWorker} instance to bridge into the channel. */
    worker: kernelWorkerSchema,
  })
  .strict();
