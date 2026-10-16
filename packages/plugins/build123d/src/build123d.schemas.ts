import { isAbsolute } from 'node:path';

import { occtQualityGltfExportSchema, occtQualityRenderOptionSchema } from '@taucad/occt-core';
import { z } from 'zod';

const absolutePath = z.string().min(1).refine(isAbsolute, 'Expected an absolute path');
const sha256 = z.string().regex(/^[\da-f]{64}$/i, 'Expected a SHA-256 digest');

/** Host-owned resources required by the sandboxed native Python kernel. @public */
export const build123dOptionsSchema = z.object({
  pythonExecutable: absolutePath,
  workerPath: absolutePath,
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
  /**
   * The closure root the sandbox may read, when the interpreter and the worker scripts share one (a closure the
   * preparation host sealed). Absent, it is the interpreter's prefix, which must then hold the worker too.
   */
  runtimePath: absolutePath.optional(),
  /** Milliseconds. Zero waits for completion or cancellation. */
  requestTimeout: z.number().int().nonnegative().default(0),
  /** Optional host policy; by default only the representable byte length is bounded. */
  maxArtifactBytes: z.number().int().positive().default(Number.MAX_SAFE_INTEGER),
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
