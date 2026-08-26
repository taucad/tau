/**
 * Zoo (KCL) kernel Zod schemas — single source of truth.
 *
 * Consumed by `zoo.kernel.ts` for plugin type inference and runtime validation.
 *
 * @public
 */

import { z } from 'zod';
import { coordinateSystemSchema, unitSchema } from '@taucad/runtime/kernel';

const stlUnitSchema = z.object({
  unit: z
    .object({
      length: z
        .enum(['meter', 'millimeter'])
        .default('millimeter')
        .describe('Output length unit for geometry coordinates'),
    })
    .default({ length: 'millimeter' })
    .describe('Output unit convention'),
});

/**
 * Zoo (KCL) kernel initialization options schema.
 * @public
 */
export const zooOptionsSchema = z.object({
  baseUrl: z.string().default('wss://api.zoo.dev/ws/modeling/commands'),
  closeErrors: z.record(z.string(), z.string()).optional(),
  token: z.string().optional(),
});

/**
 * Zoo per-format export schemas.
 * @public
 */
export const zooExportSchemas = {
  stl: z
    .object({
      binary: z.boolean().default(true).describe('Binary STL format'),
    })
    .extend(coordinateSystemSchema.shape)
    .extend(stlUnitSchema.shape),
  step: coordinateSystemSchema,
  glb: coordinateSystemSchema.extend(unitSchema.shape),
  gltf: coordinateSystemSchema.extend(unitSchema.shape),
} as const satisfies Record<string, z.ZodType>;
