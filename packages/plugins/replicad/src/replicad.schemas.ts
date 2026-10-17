/**
 * Replicad kernel Zod schemas — single source of truth.
 *
 * Consumed by `replicad.kernel.ts` for plugin type inference and runtime validation.
 *
 * Shared OCCT tessellation and mesh export fragments come from `@taucad/occt-core`.
 *
 * @public
 */

import { z } from 'zod';
import { coordinateSystemSchema } from '@taucad/runtime/kernel';
import {
  occtQualityGltfExportSchema,
  occtQualityRenderOptionSchema,
  occtQualityStlExportSchema,
  occtTriangleBudgets,
} from '@taucad/occt-core';

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
  ocTracing: z.enum(['off', 'summary', 'per-call']).optional().default('off'),
  libraryTracing: z.enum(['off', 'summary', 'per-call']).optional().default('off'),
  withSourceMapping: z.boolean().optional().default(false),
  tessellationInstancing: z.boolean().optional().default(true),
  /**
   * Semantic compute reuse switch. Omitted keeps today's behaviour (on when the
   * implementation assets identify a producer); `false` is a real off arm that
   * installs no proxy and constructs no recipe.
   */
  computeReuse: z.boolean().optional(),
  /**
   * Triangles a preview may carry before it is coarsened and a `TESSELLATION_DOWNGRADED` warning is reported.
   * Defaults to the policy preview budget; a host on a memory-constrained device passes a smaller one.
   */
  previewTriangleBudget: z.number().int().positive().optional().default(occtTriangleBudgets.preview),
});

/**
 * Replicad render option schema: `tessellation` is a quality preset (default `medium`) or explicit
 * tolerances in millimetres and degrees, never both.
 * @public
 */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- `no-barrel-files` forbids the re-export form outside index.ts.
export const replicadRenderSchema = occtQualityRenderOptionSchema;

/**
 * Replicad per-format export schemas.
 *
 * Mesh exports take a quality preset (default `high`) or explicit tolerances, never both.
 * STEP uses `coordinateSystemSchema` because replicad transforms shapes for STEP.
 * @public
 */
export const replicadExportSchemas = {
  stl: occtQualityStlExportSchema,
  step: coordinateSystemSchema,
  glb: occtQualityGltfExportSchema,
  gltf: occtQualityGltfExportSchema,
} as const satisfies Record<string, z.ZodType>;
