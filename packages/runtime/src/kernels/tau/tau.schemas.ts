/**
 * Tau converter kernel Zod schemas — single source of truth.
 *
 * Consumed by `tau.kernel.ts` for plugin type inference and runtime validation.
 *
 * @public
 */

import type { ZodType } from 'zod';
import { coordinateSystemSchema, unitSchema } from '#types/export-option-schemas.js';

const tauGlbExportSchema = coordinateSystemSchema
  .extend(unitSchema.shape)
  .extend({
    // Imported native handles are already Y-up/metres. Preserve direct
    // empty-options GLB export as a byte pass-through.
    coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up'),
  })
  .strict();

/**
 * Tau per-format export schemas.
 * GLB supports explicit coordinate/unit conversion from its Y-up/metre native
 * handle.
 * @public
 */
export const tauExportSchemas = {
  glb: tauGlbExportSchema,
} as const satisfies Record<string, ZodType>;
