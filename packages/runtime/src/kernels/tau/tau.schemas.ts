/**
 * Tau converter kernel Zod schemas — single source of truth.
 *
 * Consumed by `tau.kernel.ts` for plugin type inference and runtime validation.
 *
 * @public
 */

import { z } from 'zod';

/**
 * Tau per-format export schemas.
 * Empty — Tau is a converter pass-through.
 * @public
 */
export const tauExportSchemas = {
  glb: z.object({}),
  gltf: z.object({}),
} as const satisfies Record<string, z.ZodType>;
