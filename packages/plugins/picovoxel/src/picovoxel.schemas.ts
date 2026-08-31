import { z } from 'zod';
import { gltfExportConventionSchema } from '@taucad/runtime/kernel';

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

/** PicoVoxel kernel initialization options schema. @public */
export const picovoxelOptionsSchema = z.object({
  wasm: z
    .enum(['auto', 'serial', 'multi'])
    .optional()
    .default('serial')
    .describe(
      'WASM build variant. "serial" (default) uses one thread; "multi" requires pthread WebAssembly support; "auto" selects multi when supported and otherwise serial.',
    ),
});

/** Session options that affect Picovoxel geometry construction. @public */
export const picovoxelRenderSchema = z
  .object({
    lane: z.enum(['exact', 'fast']).default('exact'),
    fastRenorm: z.boolean().default(false),
    serialLattice: z.boolean().default(false),
  })
  .superRefine(({ lane, fastRenorm }, context) => {
    if (lane === 'exact' && fastRenorm) {
      context.addIssue({
        code: 'custom',
        message: "fastRenorm requires lane: 'fast'.",
        path: ['fastRenorm'],
      });
    }
  });

const stlSchema = z.object({
  unit: z.enum(['mm', 'cm', 'm', 'ft', 'in']).default('mm'),
  scale: z.number().positive().default(1),
  offset: vector3Schema.default([0, 0, 0]),
  acceptLane: z.literal('fast').optional(),
});

/** Per-format Picovoxel export schemas. @public */
export const picovoxelExportSchemas = {
  glb: gltfExportConventionSchema,
  stl: stlSchema,
} as const;
