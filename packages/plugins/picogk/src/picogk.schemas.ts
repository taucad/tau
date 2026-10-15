import { isAbsolute } from 'node:path';

import { gltfExportConventionSchema } from '@taucad/runtime/kernel';
import { z } from 'zod';

const absolutePath = z.string().min(1).refine(isAbsolute, 'Expected an absolute path');
const sha256 = z.string().regex(/^[\da-f]{64}$/iu, 'Expected a SHA-256 digest');

/** Host-owned resources required by the sandboxed native PicoGK kernel. @public */
export const picogkOptionsSchema = z.object({
  workerExecutable: absolutePath,
  workerSha256: sha256,
  resourceFiles: z.array(z.object({ path: absolutePath, sha256, label: z.string().min(1) })).min(1),
  /**
   * Read-only root the sandbox lets the worker read; the executable and every resource must live inside it. Absent,
   * the executable's directory. A prepared closure passes its root, so the Microsoft `dotnet` muxer and the Tau
   * layer sit side by side under one readable root.
   */
  runtimePath: absolutePath.optional(),
  /**
   * Arguments placed before the worker's own: the absolute path of the framework-dependent worker assembly when
   * `workerExecutable` is the `dotnet` muxer.
   */
  workerArguments: z.array(z.string().min(1)).optional(),
  /** Milliseconds. Zero waits for completion or cancellation. */
  requestTimeout: z.number().int().nonnegative().default(0),
  /** Optional host policy; by default only the representable byte length is bounded. */
  maxArtifactBytes: z.number().int().positive().default(Number.MAX_SAFE_INTEGER),
});

/** Direct export formats implemented by the PicoGK kernel. @public */
export const picogkExportSchemas = {
  glb: gltfExportConventionSchema,
  gltf: gltfExportConventionSchema,
} as const satisfies Record<string, z.ZodType>;
