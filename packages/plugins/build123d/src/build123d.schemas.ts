import { occtQualityGltfExportSchema, occtQualityRenderOptionSchema } from '@taucad/occt-core';
import { pythonClosureSchema, pythonKernelOptionsSchema } from '@taucad/python-kernel-core';
import { z } from 'zod';

const supportModules = ['native_materials.py', 'mechanisms.py'];

/**
 * The files the sandboxed native Python kernel launches from: the interpreter, the worker and its support modules
 * (`native_materials.py`, `mechanisms.py` and the four `tau_kernel` modules) with their digests. @public
 */
export const build123dClosureSchema = pythonClosureSchema({ supportModules });

/**
 * Build123d's options: an optional explicit closure (otherwise the kernel binds to its sealed closure when it
 * initializes) and the host's bounds. `build123d()` with no options is a complete listing. @public
 */
export const build123dOptionsSchema = pythonKernelOptionsSchema({ supportModules });

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
