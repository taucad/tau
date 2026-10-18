import {
  occtQualityGltfExportSchema,
  occtQualityRenderOptionSchema,
  occtQualityStlExportSchema,
} from '@taucad/occt-core';
import { pythonClosureSchema, pythonKernelOptionsSchema } from '@taucad/python-kernel-core';
import { coordinateSystemSchema } from '@taucad/runtime/kernel';
import { z } from 'zod';

const supportModules = ['smlibpy_materials.py', 'smlibpy_mechanisms.py'];

/**
 * The files the sandboxed native Python kernel launches from: the interpreter, the worker and its support modules
 * (`smlibpy_materials.py`, `smlibpy_mechanisms.py` and the four `tau_kernel` modules) with their digests. @public
 */
export const smlibpyClosureSchema = pythonClosureSchema({ supportModules });

/**
 * SMLibPy's options: an optional explicit closure (otherwise the kernel binds to its sealed closure when it
 * initializes) and the host's bounds. `smlibpy()` with no options is a complete listing. @public
 */
export const smlibpyOptionsSchema = pythonKernelOptionsSchema({ supportModules });

/**
 * SMLibPy display tessellation options: a quality preset derived from the shapes' bounding-box diagonal, or explicit
 * tolerances in millimetres and degrees, never both. Previews default to `medium`. @public
 */
export const smlibpyRenderSchema = z.object({ tessellation: occtQualityRenderOptionSchema.shape.tessellation });

/**
 * SMLibPy export options. Mesh exports take a quality preset (default `high`) or explicit tolerances, never both;
 * STEP takes the coordinate system its exact B-rep is written in. @public
 */
export const smlibpyExportSchemas = {
  glb: occtQualityGltfExportSchema,
  gltf: occtQualityGltfExportSchema,
  step: coordinateSystemSchema,
  stl: occtQualityStlExportSchema,
} as const satisfies Record<string, z.ZodType>;
