/**
 * OpenCascade kernel Zod schemas — single source of truth.
 *
 * Consumed by `opencascade.kernel.ts` for plugin type inference and runtime validation.
 *
 * OCCT tessellation and mesh export fragments are duplicated here (same defaults as the Replicad
 * kernel) so each kernel’s plugin and schema module stay self-contained.
 *
 * @public
 */

import { z } from 'zod';
import { coordinateSystemSchema, unitSchema } from '#types/export-option-schemas.js';

/** OCCT tessellation fragment for render options. */
const occtRenderOptionSchema = z.object({
  tessellation: z
    .object({
      linearTolerance: z.number().positive().default(0.01).describe('Linear tolerance (distance) for tessellation'),
      angularTolerance: z.number().positive().default(20).describe('Angular tolerance (degrees) for tessellation'),
    })
    .default({ linearTolerance: 0.01, angularTolerance: 20 })
    .describe('Tessellation quality for preview rendering'),
});

/** OCCT tessellation fragment for export options (fine defaults for export). */
const occtExportTessellationSchema = z.object({
  tessellation: z
    .object({
      linearTolerance: z.number().positive().default(0.01).describe('Linear tolerance (distance) for tessellation'),
      angularTolerance: z.number().positive().default(20).describe('Angular tolerance (degrees) for tessellation'),
    })
    .default({ linearTolerance: 0.01, angularTolerance: 20 })
    .describe('Tessellation quality for mesh-based exports'),
});

/** Zod schema for OCCT-based STL export options. */
const occtStlExportSchema = z
  .object({ binary: z.boolean().default(true).describe('Binary STL format') })
  .extend(occtExportTessellationSchema.shape)
  .extend(coordinateSystemSchema.shape);

/** Zod schema for OCCT-based GLB export options. */
const occtGlbExportSchema = occtExportTessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape);

/** Zod schema for OCCT-based GLTF export options. */
const occtGltfExportSchema = occtExportTessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape);

/**
 * OpenCascade kernel initialization options schema.
 * @public
 */
export const opencascadeOptionsSchema = z.object({
  wasm: z
    .union([
      z.literal('auto'),
      z.literal('full'),
      z.literal('multi'),
      z.object({ wasmUrl: z.string(), wasmBindingsUrl: z.string() }),
    ])
    .optional()
    .default('full')
    .describe(
      'WASM build variant. "full" (default) single-threaded; "multi" pthread build (requires SharedArrayBuffer + cross-origin isolation); "auto" picks multi when supported, else full; or a custom WASM/JS URL pair.',
    ),
  ocTracing: z
    .enum(['off', 'summary', 'per-call'])
    .optional()
    .default('summary')
    .describe(
      'OC API call tracing mode. "summary" (default) emits aggregated stats, "per-call" emits individual spans, "off" disables tracing.',
    ),
});

/**
 * OpenCascade render option schema.
 * @public
 */
export const opencascadeRenderSchema = occtRenderOptionSchema;

/**
 * OpenCascade per-format export schemas.
 *
 * STEP uses XCAF for color/material preservation and exposes coordinate-system intent.
 * @public
 */
export const opencascadeExportSchemas = {
  stl: occtStlExportSchema,
  step: coordinateSystemSchema,
  glb: occtGlbExportSchema,
  gltf: occtGltfExportSchema,
} as const satisfies Record<string, z.ZodType>;
