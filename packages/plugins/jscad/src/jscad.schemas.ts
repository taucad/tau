/**
 * JSCAD kernel Zod schemas — single source of truth.
 *
 * Consumed by `jscad.kernel.ts` for plugin type inference and runtime validation.
 *
 * @public
 */

import type { z } from 'zod';
import { coordinateSystemSchema, unitSchema } from '@taucad/runtime/kernel';

/**
 * JSCAD per-format export schemas.
 * @public
 */
export const jscadExportSchemas = {
  glb: coordinateSystemSchema.extend(unitSchema.shape),
} as const satisfies Record<string, z.ZodType>;
