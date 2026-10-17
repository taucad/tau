/**
 * SMLib kernel Zod schemas — single source of truth.
 *
 * Consumed by `smlib.kernel.ts` for plugin type inference and runtime validation. The
 * tessellation fragments are the shared chordal/angular tolerance contract Tau's BRep kernels
 * use: SMLib meshes with the same two tolerances (millimetres and degrees) OpenCASCADE does.
 *
 * @public
 */

import { z } from 'zod';
import { coordinateSystemSchema } from '@taucad/runtime/kernel';
import {
  occtQualityGltfExportSchema,
  occtQualityRenderOptionSchema,
  occtQualityStlExportSchema,
} from '@taucad/occt-core';

/**
 * SMLib kernel initialization options schema.
 * @public
 */
export const smlibOptionsSchema = z.object({
  /** SMLib library call tracing mode for user code. */
  libraryTracing: z.enum(['off', 'summary', 'per-call']).optional().default('off'),
});

/**
 * SMLib render option schema: `tessellation` is a quality preset (default `medium`) or explicit
 * tolerances in millimetres and degrees, never both.
 * @public
 */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- `no-barrel-files` forbids the re-export form outside index.ts.
export const smlibRenderSchema = occtQualityRenderOptionSchema;

/**
 * SMLib per-format export schemas.
 *
 * Mesh exports take a quality preset (default `high`) or explicit tolerances, never both. STEP
 * takes the coordinate system its exact B-rep is written in.
 * @public
 */
export const smlibExportSchemas = {
  stl: occtQualityStlExportSchema,
  step: coordinateSystemSchema,
  glb: occtQualityGltfExportSchema,
  gltf: occtQualityGltfExportSchema,
} as const satisfies Record<string, z.ZodType>;
