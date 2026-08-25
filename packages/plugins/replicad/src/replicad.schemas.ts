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
import { occtGltfExportSchema, occtRenderOptionSchema, occtStlExportSchema } from '@taucad/occt-core';

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
});

/**
 * Replicad render option schema.
 * @public
 */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- `no-barrel-files` forbids the re-export form outside index.ts.
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
  glb: occtGltfExportSchema,
  gltf: occtGltfExportSchema,
} as const satisfies Record<string, z.ZodType>;
