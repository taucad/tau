import { coordinateSystemSchema, gltfExportConventionSchema, quantity, quantityKinds } from '@taucad/runtime/kernel';
import { z } from 'zod';

// A chordal deviation in the kernel's model millimetres.
const linearTolerance = () => quantity({ unit: 'mm', quantityKind: quantityKinds.length, space: 'linear' }).positive();
// OCCT-core's mesher angle, in degrees; replicad and opencascade convert to radians before meshing.
const angularTolerance = () =>
  quantity({ unit: 'deg', quantityKind: quantityKinds.planeAngle, space: 'linear' }).positive();

/** Shared OCCT render tessellation schema with preview defaults. @public */
export const occtRenderOptionSchema = z.object({
  tessellation: z
    .object({
      linearTolerance: linearTolerance().default(0.02).describe('Linear tolerance (distance) for tessellation'),
      angularTolerance: angularTolerance().default(20).describe('Angular tolerance (degrees) for tessellation'),
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
        linearTolerance: linearTolerance().default(0.01).describe('Linear tolerance (distance) for tessellation'),
        angularTolerance: angularTolerance().default(20).describe('Angular tolerance (degrees) for tessellation'),
      })
      .default({ linearTolerance: 0.01, angularTolerance: 20 })
      .describe('Tessellation quality for mesh-based exports'),
  })
  .extend(coordinateSystemSchema.shape);

/** Shared OCCT glTF export schema with fine tessellation defaults. @public */
export const occtGltfExportSchema = occtStlExportSchema
  .omit({ binary: true, coordinateSystem: true })
  .extend(gltfExportConventionSchema.shape);
