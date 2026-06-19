/**
 * Manifold kernel Zod schemas — single source of truth.
 *
 * Consumed by `manifold.kernel.ts` for plugin type inference and runtime validation.
 *
 * @public
 */

import { z } from 'zod';
import { coordinateSystemSchema, unitSchema } from '#types/export-option-schemas.js';

/**
 * Manifold kernel initialization options schema.
 * @public
 */
export const manifoldOptionsSchema = z.object({
  wasmUrl: z.string().optional(),
});

/**
 * Manifold per-format export schemas.
 * @public
 */
export const manifoldExportSchemas = {
  glb: coordinateSystemSchema.extend(unitSchema.shape),
} as const satisfies Record<string, z.ZodType>;
