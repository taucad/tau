/**
 * Zod schemas for the bundled in-process transport.
 *
 * In-process is the simplest transport: same V8 isolate, no wire
 * crossing. The client allocates SAB-backed signal/geometry
 * pools (always available because there's no cross-origin
 * isolation question).
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md` (R3),
 * in-process is now a {@link definePassthroughTransport} — there is no
 * separate host runtime, so no `inProcessHostOptionsSchema` exists.
 *
 * @internal
 */

import { z } from 'zod';
import { isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { isRuntimeDefinition } from '#worker/runtime-definition.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';
import { compiledWasmModuleSchema } from '#transport/_internal/compiled-wasm-module.schema.js';

const runtimeFileSystemSchema = z.custom<RuntimeFileSystem>(
  (value) => value === undefined || isRuntimeFileSystem(value),
);
const runtimeDefinitionSchema = z.custom<AnyRuntimeDefinition>(
  (value) => value === undefined || isRuntimeDefinition(value),
);
export const inProcessClientOptionsSchema = z
  .object({
    /**
     * Optional filesystem handle produced by a `fromX` factory
     * (`fromMemoryFs`, `fromNodeFs`, …). The transport bridges the
     * handle into the worker's in-isolate filesystem.
     */
    fileSystem: runtimeFileSystemSchema.optional(),
    /**
     * Worker-owned runtime definition. Required when the in-process transport
     * is used directly because this topology creates the host worker itself.
     */
    runtime: runtimeDefinitionSchema.optional(),
    /**
     * Geometry shared-pool sizing. Always allocated for in-process —
     * SAB is unconditionally available in the same isolate.
     */
    geometry: z
      .object({
        bytes: z.number().int().positive(),
        maxEntries: z.number().int().positive().optional(),
        maxEntryBytes: z.number().int().positive().optional(),
      })
      .optional(),
    /** Explicit Chrome DevTools Performance Timeline mirroring. */
    devtoolsTelemetry: z.boolean().optional(),
    compiledWasmModules: z
      .array(z.object({ url: z.string(), module: compiledWasmModuleSchema }).strict())
      .readonly()
      .optional(),
  })
  .strict();
