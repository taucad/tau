import { occtQualityGltfExportSchema, occtQualityRenderOptionSchema } from '@taucad/occt-core';
import { pythonKernelOptionsSchema } from '@taucad/python-kernel-core';
import { z } from 'zod';

/**
 * Host-owned resources required by the sandboxed native Python kernel: the interpreter, the worker and its support
 * modules (`native_materials.py`, `mechanisms.py` and the four `tau_kernel` modules) with their digests. @public
 */
export const build123dOptionsSchema = pythonKernelOptionsSchema({
  supportModules: ['native_materials.py', 'mechanisms.py'],
});

/**
 * Build123d display tessellation options: a quality preset derived from the shape's bounding-box diagonal, or explicit
 * tolerances in millimetres and degrees, never both. Previews default to `medium`. @public
 */
export const build123dRenderSchema = z.object({ tessellation: occtQualityRenderOptionSchema.shape.tessellation });

/** Build123d native export options; mesh exports default to the `high` preset. @public */
export const build123dExportSchemas = {
  glb: occtQualityGltfExportSchema,
  step: z.object({}),
} as const satisfies Record<string, z.ZodType>;
