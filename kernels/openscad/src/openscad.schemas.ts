/**
 * OpenSCAD kernel Zod schemas — single source of truth.
 *
 * Consumed by `openscad.kernel.ts` for factory type inference and runtime validation.
 *
 * @public
 */

import { z } from 'zod';
import { coordinateSystemSchema, unitSchema } from '@taucad/runtime/kernel';

/**
 * OpenSCAD-native tessellation schema fragment for exports.
 *
 * Maps human-readable property names to OpenSCAD's `$fn`/`$fa`/`$fs` special variables.
 * @public
 */
export const openscadTessellationSchema = z.object({
  tessellation: z
    .object({
      segments: z
        .number()
        .int()
        .min(3)
        .default(32)
        .describe('Number of segments for circles and curved surfaces (OpenSCAD $fn)'),
      minimumAngle: z
        .number()
        .positive()
        .default(12)
        .describe('Minimum angle per segment in degrees — lower values produce smoother curves (OpenSCAD $fa)'),
      minimumSize: z
        .number()
        .positive()
        .default(2)
        .describe('Minimum segment length in model units — lower values capture finer detail (OpenSCAD $fs)'),
    })
    .default({ segments: 32, minimumAngle: 12, minimumSize: 2 })
    .describe('Mesh resolution for curved surfaces'),
});

/**
 * Inferred type for OpenSCAD tessellation options.
 * @public
 */
export type OpenScadTessellationOptions = z.infer<typeof openscadTessellationSchema>;

/**
 * OpenSCAD render option schema with official defaults ($fn=0 lets $fa/$fs control resolution).
 * Coarser than export defaults for faster preview rendering.
 * @public
 */
export const openscadRenderSchema = z.object({
  tessellation: z
    .object({
      segments: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Number of segments for circles and curved surfaces (OpenSCAD $fn). 0 = use $fa/$fs'),
      minimumAngle: z
        .number()
        .positive()
        .default(12)
        .describe('Minimum angle per segment in degrees — lower values produce smoother curves (OpenSCAD $fa)'),
      minimumSize: z
        .number()
        .positive()
        .default(2)
        .describe('Minimum segment length in model units — lower values capture finer detail (OpenSCAD $fs)'),
    })
    .default({ segments: 0, minimumAngle: 12, minimumSize: 2 })
    .describe('Mesh resolution for curved surfaces (preview)'),
});

/**
 * OpenSCAD per-format export schemas.
 * @public
 */
export const openscadExportSchemas = {
  glb: openscadTessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape),
  gltf: openscadTessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape),
} as const satisfies Record<string, z.ZodType>;
