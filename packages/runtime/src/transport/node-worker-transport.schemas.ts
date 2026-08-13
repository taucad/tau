/**
 * Zod schemas for the bundled node-worker transport.
 *
 * @internal
 */

import { z } from 'zod';
import { isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';

const workerCtorSchema = z.custom<unknown>((value) => typeof value === 'function');

const runtimeFileSystemSchema = z.custom<RuntimeFileSystem>(
  (value) => value === undefined || isRuntimeFileSystem(value),
);

export const nodeWorkerClientOptionsSchema = z
  .object({
    /**
     * Application-owned URL of the ESM worker module entry.
     */
    url: z.union([z.string(), z.instanceof(URL)]),
    /**
     * Override for `node:worker_threads.Worker` — primary use is
     * unit-test injection of a fake worker.
     */
    workerCtor: workerCtorSchema.optional(),
    /**
     * Optional shared-memory pool descriptor.
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
  .strict();
