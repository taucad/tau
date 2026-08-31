/**
 * Shared Zod schema fragments for export options.
 *
 * Kernels compose these fragments via `.extend()` to build per-format export
 * option schemas. Tessellation schemas are kernel-specific — each kernel defines
 * its own tessellation fragment locally (see kernel plugin files).
 *
 * @public
 */

import { z } from 'zod';

/**
 * Coordinate system convention fragment for export formats that support
 * coordinate system transformation.
 * Compose into per-format schemas via `.extend()`.
 * @public
 */
export const coordinateSystemSchema = z.object({
  coordinateSystem: z.enum(['y-up', 'z-up']).default('z-up').describe('Output coordinate system convention'),
});

/**
 * Inferred type for coordinate system export options.
 * @public
 */
export type CoordinateSystemOptions = z.infer<typeof coordinateSystemSchema>;

/**
 * Unit convention fragment for export formats that support output-unit
 * transformation. The nested shape leaves room for future unit dimensions
 * without overloading a single scalar string.
 * Compose into per-format schemas via `.extend()`.
 * @public
 */
export const unitSchema = z.object({
  unit: z
    .object({
      length: z.enum(['meter', 'millimeter']).default('meter').describe('Output length unit for geometry coordinates'),
    })
    .default({ length: 'meter' })
    .describe('Output unit convention'),
});

/** Canonical glTF 2.0 Y-up, metre export convention. @public */
export const gltfExportConventionSchema = coordinateSystemSchema
  .extend({
    coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up'),
  })
  .extend(unitSchema.shape);

/**
 * Inferred type for export unit options.
 * @public
 */
export type UnitOptions = z.infer<typeof unitSchema>;
