import { isAbsolute } from 'node:path';

import { gltfExportConventionSchema } from '@taucad/runtime/kernel';
import { z } from 'zod';

const absolutePath = z.string().min(1).refine(isAbsolute, 'Expected an absolute path');
const sha256 = z.string().regex(/^[\da-f]{64}$/iu, 'Expected a SHA-256 digest');

/** Trusted host-owned resources required by the native PicoGK kernel. @public */
export const picogkOptionsSchema = z.object({
  workerExecutable: absolutePath,
  workerSha256: sha256,
  trustFile: absolutePath,
  resourceFiles: z.array(z.object({ path: absolutePath, sha256, label: z.string().min(1) })).min(1),
  requestTimeout: z.number().int().positive().default(120_000),
  maxArtifactBytes: z
    .number()
    .int()
    .positive()
    .default(512 * 1024 * 1024),
});

/** Progressive hosted-viewer capture options accepted by PicoGK models. @public */
export const picogkRenderSchema = z.object({
  capture: z
    .object({
      mode: z.enum(['explicit', 'update', 'operation']).default('update'),
      minimumIntervalMilliseconds: z.number().int().min(0).max(10_000).default(16),
      maximumPendingCommands: z.number().int().min(1).max(4096).default(256),
    })
    .default({ mode: 'update', minimumIntervalMilliseconds: 16, maximumPendingCommands: 256 }),
});

/** Direct export formats implemented by the PicoGK kernel. @public */
export const picogkExportSchemas = {
  glb: gltfExportConventionSchema,
} as const satisfies Record<string, z.ZodType>;
