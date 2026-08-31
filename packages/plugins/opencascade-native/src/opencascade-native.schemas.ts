/**
 * `@taucad/opencascade-native` Zod schemas — single source of truth.
 *
 * Consumed by `opencascade-native.kernel.ts` for plugin type inference and
 * runtime validation.
 *
 * @public
 */

import { gltfExportConventionSchema } from '@taucad/runtime/kernel';
import { z } from 'zod';

/**
 * Native OpenCascade kernel initialization options.
 * @public
 */
export const opencascadeNativeOptionsSchema = z.object({
  /**
   * `'native'` throws when the addon is unavailable. There is no `'auto'`:
   * a silent WASM downgrade turns a benchmark and a support claim into a lie
   * (charter R-O(d)), so fallback is a host-recipe decision, not a kernel one.
   */
  backend: z.literal('native').default('native'),
});

/**
 * OCCT tessellation fragment, same defaults as the WASM OpenCascade kernel.
 * @param linearTolerance - Default chord deflection for this phase.
 * @returns A Zod object carrying the `tessellation` field.
 */
const tessellationFragment = (linearTolerance: number) =>
  z.object({
    tessellation: z
      .object({
        linearTolerance: z
          .number()
          .positive()
          .default(linearTolerance)
          .describe('Linear tolerance (distance) for tessellation'),
        angularTolerance: z.number().positive().default(20).describe('Angular tolerance (degrees) for tessellation'),
      })
      .default({ linearTolerance, angularTolerance: 20 })
      .describe('Tessellation quality'),
  });

/**
 * Native OpenCascade render option schema.
 * @public
 */
export const opencascadeNativeRenderSchema = tessellationFragment(0.02);

/**
 * Native OpenCascade per-format export schemas.
 *
 * STEP carries no tessellation options: a BRep format never tessellates.
 * @public
 */
export const opencascadeNativeExportSchemas = {
  glb: tessellationFragment(0.01).extend(gltfExportConventionSchema.shape),
  step: z.object({}),
} as const satisfies Record<string, z.ZodType>;
