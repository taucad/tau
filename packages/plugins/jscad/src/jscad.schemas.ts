/**
 * JSCAD kernel Zod schemas — single source of truth.
 *
 * Consumed by `jscad.kernel.ts` for plugin type inference and runtime validation.
 *
 * @public
 */

import { z } from 'zod';
import { gltfExportConventionSchema } from '@taucad/runtime/kernel';
import { jscadTessellationSchema } from '#jscad-tessellation.js';

/**
 * JSCAD render options: a tessellation preset or an explicit default segment count; previews default to `medium`.
 * @public
 */
export const jscadRenderSchema = z.object({
  tessellation: jscadTessellationSchema.default('medium').describe('Tessellation quality for preview rendering'),
});

/**
 * JSCAD per-format export schemas; mesh exports default to the `high` preset.
 * @public
 */
export const jscadExportSchemas = {
  glb: gltfExportConventionSchema.extend({
    tessellation: jscadTessellationSchema.default('high').describe('Tessellation quality for mesh-based exports'),
  }),
} as const satisfies Record<string, z.ZodType>;
