import { isAbsolute } from 'node:path';

import { z } from 'zod';

import { picogkProtocolVersion } from '#picogk.protocol.js';
import type { picogkOptionsSchema } from '#picogk.schemas.js';

const sha256 = z.string().regex(/^[\da-f]{64}$/u);
const relativeResourcePath = z
  .string()
  .min(1)
  .refine((path) => !isAbsolute(path) && !path.split(/[\\/]/u).includes('..'));

/** Build/launch contract for a prepared PicoGK worker payload. @public */
export const picogkRuntimeManifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    target: z.string().min(1),
    rid: z.string().min(1),
    dotnetSdkVersion: z.string().min(1),
    dotnetRuntimeVersion: z.string().min(1),
    roslynVersion: z.string().min(1),
    picoGkCommit: z.string().min(1),
    picoGkArchiveSha256: sha256,
    picoGkHostedPatchSha256: sha256,
    hostApiVersion: z.literal(2),
    protocolVersion: z.literal(picogkProtocolVersion),
    sceneArtifactVersion: z.literal(4),
    topologySchemaVersion: z.literal(1),
    sourceFilesSha256: sha256,
    workerPath: relativeResourcePath,
    workerSha256: sha256,
    resourceFiles: z
      .array(
        z.object({
          path: relativeResourcePath,
          sha256,
          label: z.string().min(1),
        }),
      )
      .min(1),
  })
  .strict();

/** Prepared PicoGK worker manifest. @public */
export type PicogkRuntimeManifest = z.infer<typeof picogkRuntimeManifestSchema>;

/** Fully resolved native options accepted by the PicoGK kernel. @public */
export type PicogkKernelOptions = z.infer<typeof picogkOptionsSchema>;
