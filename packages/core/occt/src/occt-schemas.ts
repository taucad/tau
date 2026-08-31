import { coordinateSystemSchema, gltfExportConventionSchema } from '@taucad/runtime/kernel';
import { z } from 'zod';

/** Shared OCCT render tessellation schema with preview defaults. @public */
export const occtRenderOptionSchema = z.object({
  tessellation: z
    .object({
      linearTolerance: z.number().positive().default(0.02).describe('Linear tolerance (distance) for tessellation'),
      angularTolerance: z.number().positive().default(20).describe('Angular tolerance (degrees) for tessellation'),
    })
    .default({ linearTolerance: 0.02, angularTolerance: 20 })
    .describe('Tessellation quality for preview rendering'),
});

/** Shared OCCT STL export schema with fine tessellation defaults. @public */
export const occtStlExportSchema = z
  .object({ binary: z.boolean().default(true).describe('Binary STL format') })
  .extend({
    tessellation: z
      .object({
        linearTolerance: z.number().positive().default(0.01).describe('Linear tolerance (distance) for tessellation'),
        angularTolerance: z.number().positive().default(20).describe('Angular tolerance (degrees) for tessellation'),
      })
      .default({ linearTolerance: 0.01, angularTolerance: 20 })
      .describe('Tessellation quality for mesh-based exports'),
  })
  .extend(coordinateSystemSchema.shape);

/** Shared OCCT glTF export schema with fine tessellation defaults. @public */
export const occtGltfExportSchema = occtStlExportSchema
  .omit({ binary: true, coordinateSystem: true })
  .extend(gltfExportConventionSchema.shape);
