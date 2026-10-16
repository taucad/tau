import { coordinateSystemSchema, gltfExportConventionSchema, quantity, quantityKinds } from '@taucad/runtime/kernel';
import { z } from 'zod';

// A chordal deviation in the kernel's model millimetres.
const linearTolerance = () => quantity({ unit: 'mm', quantityKind: quantityKinds.length, space: 'linear' }).positive();
// OCCT-core's mesher angle, in degrees; replicad and opencascade convert to radians before meshing.
const angularTolerance = () =>
  quantity({ unit: 'deg', quantityKind: quantityKinds.planeAngle, space: 'linear' }).positive();

/**
 * Tessellation quality presets, coarsest first. Each derives absolute tolerances from the shape's size.
 * @public
 */
export const occtTessellationQualities = ['low', 'medium', 'high', 'extra-high'] as const;

/** A tessellation quality preset name. @public */
export type OcctTessellationQuality = (typeof occtTessellationQualities)[number];

const tessellationFormsMessage =
  "tessellation is a preset ('low' | 'medium' | 'high' | 'extra-high') or an explicit object " +
  '{ linearTolerance?, angularTolerance? } with at least one field, never both';

/**
 * Explicit OCCT tolerances: an absolute chordal deviation in millimetres and an angle in degrees.
 * At least one field is required and no other key is accepted, so a preset cannot ride along.
 * @public
 */
export const occtExplicitTessellationSchema = z
  .strictObject(
    {
      linearTolerance: linearTolerance()
        .optional()
        .meta({ examples: [0.02] })
        .describe('Linear tolerance (distance) for tessellation'),
      angularTolerance: angularTolerance()
        .optional()
        .meta({ examples: [20] })
        .describe('Angular tolerance (degrees) for tessellation'),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? `explicit tolerances accept only linearTolerance and angularTolerance; ${tessellationFormsMessage}`
          : undefined,
    },
  )
  .refine((value) => value.linearTolerance !== undefined || value.angularTolerance !== undefined, {
    message: `explicit tolerances need linearTolerance or angularTolerance; ${tessellationFormsMessage}`,
  })
  .meta({ title: 'Explicit', minProperties: 1 })
  .describe('Explicit tolerances in millimetres and degrees');

/** Explicit OCCT tolerances as parsed. @public */
export type OcctExplicitTessellation = z.output<typeof occtExplicitTessellationSchema>;

/**
 * A tessellation preset or explicit tolerances, never both. JSON Schema `oneOf`.
 * @public
 */
export const occtTessellationSchema = z.xor(
  [
    z
      .enum(occtTessellationQualities, {
        error: () => `expected a preset 'low' | 'medium' | 'high' | 'extra-high'; ${tessellationFormsMessage}`,
      })
      .meta({ title: 'Preset' })
      .describe('Quality preset derived from the shape bounding-box diagonal'),
    occtExplicitTessellationSchema,
  ],
  { error: () => tessellationFormsMessage },
);

/** A tessellation preset name or explicit OCCT tolerances. @public */
export type OcctTessellation = z.output<typeof occtTessellationSchema>;

/**
 * OCCT render options whose tessellation is a preset or explicit tolerances; previews default to `medium`.
 * @public
 */
export const occtQualityRenderOptionSchema = z.object({
  tessellation: occtTessellationSchema.default('medium').describe('Tessellation quality for preview rendering'),
});

/**
 * OCCT STL export options whose tessellation is a preset or explicit tolerances; exports default to `high`.
 * @public
 */
export const occtQualityStlExportSchema = z
  .object({ binary: z.boolean().default(true).describe('Binary STL format') })
  .extend({
    tessellation: occtTessellationSchema.default('high').describe('Tessellation quality for mesh-based exports'),
  })
  .extend(coordinateSystemSchema.shape);

/**
 * OCCT glTF export options whose tessellation is a preset or explicit tolerances; exports default to `high`.
 * @public
 */
export const occtQualityGltfExportSchema = occtQualityStlExportSchema
  .omit({ binary: true, coordinateSystem: true })
  .extend(gltfExportConventionSchema.shape);
