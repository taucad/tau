/**
 * OpenCascade kernel Zod schemas — single source of truth.
 *
 * Consumed by `opencascade.kernel.ts` for plugin type inference and runtime validation.
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
    .default('off')
    .describe(
      'OC API call tracing mode. "off" (default) avoids proxy overhead, "summary" emits aggregated stats, and "per-call" emits individual spans.',
    ),
  previewTriangleBudget: z
    .number()
    .int()
    .positive()
    .optional()
    .default(occtTriangleBudgets.preview)
    .describe(
      'Triangles a preview may carry before it is coarsened and a TESSELLATION_DOWNGRADED warning is reported. Defaults to the policy preview budget; a host on a memory-constrained device passes a smaller one.',
    ),
});

/**
 * OpenCascade render option schema: `tessellation` is a quality preset (default `medium`) or explicit
 * tolerances in millimetres and degrees, never both.
 * @public
 */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- `no-barrel-files` forbids the re-export form outside index.ts.
export const opencascadeRenderSchema = occtQualityRenderOptionSchema;

/**
 * OpenCascade per-format export schemas.
 *
 * Mesh exports take a quality preset (default `high`) or explicit tolerances, never both.
 * STEP uses XCAF for color/material preservation and exposes coordinate-system intent.
 * @public
 */
export const opencascadeExportSchemas = {
  stl: occtQualityStlExportSchema,
  step: coordinateSystemSchema,
  glb: occtQualityGltfExportSchema,
} as const satisfies Record<string, z.ZodType>;
