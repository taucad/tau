/**
 * Manifold kernel Zod schemas — single source of truth.
 *
 * Consumed by `manifold.kernel.ts` for plugin type inference and runtime validation.
 *
 * @public
 */

import { z } from 'zod';
import { gltfExportConventionSchema } from '@taucad/runtime/kernel';
import { manifoldTessellationSchema } from '#manifold-tessellation.js';

/**
 * Manifold kernel initialization options schema.
 * @public
 */
export const manifoldOptionsSchema = z.object({
  wasmUrl: z.string().optional(),
});

/**
 * Manifold render options: a tessellation preset or explicit circular detail; previews default to `medium`.
 * @public
 */
export const manifoldRenderSchema = z.object({
  tessellation: manifoldTessellationSchema.default('medium').describe('Tessellation quality for preview rendering'),
});

/**
 * Manifold per-format export schemas; mesh exports default to the `high` preset.
 * @public
 */
export const manifoldExportSchemas = {
  glb: gltfExportConventionSchema.extend({
    tessellation: manifoldTessellationSchema.default('high').describe('Tessellation quality for mesh-based exports'),
  }),
} as const satisfies Record<string, z.ZodType>;
