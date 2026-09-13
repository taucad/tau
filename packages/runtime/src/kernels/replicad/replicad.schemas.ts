/**
 * Replicad kernel Zod schemas — single source of truth.
 *
 * Consumed by `replicad.plugin.ts` (type inference) and `replicad.kernel.ts` (runtime validation).
 *
 * OCCT tessellation and mesh export fragments are duplicated here (same defaults as the OpenCascade
 * kernel) so each kernel’s plugin and schema module stay self-contained.
 *
 * @public
 */

import { z } from 'zod';
import { coordinateSystemSchema } from '#types/export-option-schemas.js';

/** OCCT tessellation fragment for render options (coarse defaults for preview). */
const occtRenderOptionSchema = z.object({
  tessellation: z
    .object({
      linearTolerance: z.number().positive().default(0.1).describe('Linear tolerance (distance) for tessellation'),
      angularTolerance: z.number().positive().default(30).describe('Angular tolerance (degrees) for tessellation'),
    })
    .default({ linearTolerance: 0.1, angularTolerance: 30 })
    .describe('Tessellation quality for preview rendering'),
});

/** OCCT tessellation fragment for export options (fine defaults for export). */
const occtExportTessellationSchema = z.object({
  tessellation: z
    .object({
      linearTolerance: z.number().positive().default(0.01).describe('Linear tolerance (distance) for tessellation'),
      angularTolerance: z.number().positive().default(30).describe('Angular tolerance (degrees) for tessellation'),
    })
    .default({ linearTolerance: 0.01, angularTolerance: 30 })
    .describe('Tessellation quality for mesh-based exports'),
});

/** Zod schema for OCCT-based STL export options. */
const occtStlExportSchema = z
  .object({ binary: z.boolean().default(true).describe('Binary STL format') })
  .extend(occtExportTessellationSchema.shape)
  .extend(coordinateSystemSchema.shape);

/** Zod schema for OCCT-based GLB export options. */
const occtGlbExportSchema = occtExportTessellationSchema.extend(coordinateSystemSchema.shape);

/** Zod schema for OCCT-based GLTF export options. */
const occtGltfExportSchema = occtExportTessellationSchema.extend(coordinateSystemSchema.shape);

/**
 * Custom WASM configuration for injecting non-standard builds at runtime.
 * @public
 */
export const replicadWasmConfigSchema = z.object({
  wasmUrl: z.string(),
  wasmBindingsUrl: z.string(),
});

/**
 * Replicad kernel initialization options schema.
 * @public
 */
export const replicadOptionsSchema = z.object({
  wasm: z
    .union([z.enum(['auto', 'single', 'multi']), replicadWasmConfigSchema])
    .optional()
    .default('auto'),
  ocTracing: z.enum(['off', 'summary', 'per-call']).optional().default('summary'),
  withBrepEdges: z.boolean().optional().default(false),
  withSourceMapping: z.boolean().optional().default(false),
});

/**
 * Replicad render option schema (coarse tessellation for preview).
 * @public
 */
export const replicadRenderSchema = occtRenderOptionSchema;

/**
 * Replicad per-format export schemas.
 *
 * STEP uses `coordinateSystemSchema` because replicad transforms shapes for STEP.
 * @public
 */
export const replicadExportSchemas = {
  stl: occtStlExportSchema,
  step: coordinateSystemSchema,
  glb: occtGlbExportSchema,
  gltf: occtGltfExportSchema,
} as const satisfies Record<string, z.ZodType>;
