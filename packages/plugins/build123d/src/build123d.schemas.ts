import { isAbsolute } from 'node:path';

import { gltfExportConventionSchema } from '@taucad/runtime/kernel';
import { z } from 'zod';

const absolutePath = z.string().min(1).refine(isAbsolute, 'Expected an absolute path');
const sha256 = z.string().regex(/^[\da-f]{64}$/i, 'Expected a SHA-256 digest');

/** Trusted host-owned resources required by the native Python kernel. @public */
export const build123dOptionsSchema = z.object({
  pythonExecutable: absolutePath,
  workerPath: absolutePath,
  trustFile: absolutePath,
  pythonSha256: sha256,
  workerSha256: sha256,
  supportFiles: z
    .array(z.object({ path: absolutePath, sha256 }))
    .length(2)
    .superRefine((files, context) => {
      const names = new Set(
        files.map(({ path }) => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)),
      );
      if (!names.has('analyzer.py') || !names.has('glb.py')) {
        context.addIssue({ code: 'custom', message: 'Support files must contain analyzer.py and glb.py' });
      }
    }),
  requestTimeout: z.number().int().positive().default(120_000),
  maxArtifactBytes: z
    .number()
    .int()
    .positive()
    .default(512 * 1024 * 1024),
});

const tessellation = z
  .object({
    linearTolerance: z.number().positive().default(0.05),
    angularTolerance: z.number().positive().max(Math.PI).default(0.1),
  })
  .default({ linearTolerance: 0.05, angularTolerance: 0.1 });

/** Build123d display tessellation options. @public */
export const build123dRenderSchema = z.object({ tessellation });

/** Build123d native export options. @public */
export const build123dExportSchemas = {
  glb: z.object({ tessellation }).extend(gltfExportConventionSchema.shape),
  step: z.object({}),
} as const satisfies Record<string, z.ZodType>;
