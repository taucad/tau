import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { z } from 'zod';

import { picogkOptionsSchema } from '#picogk.schemas.js';

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
    hostApiVersion: z.literal(1),
    protocolVersion: z.literal(3),
    sceneArtifactVersion: z.literal(3),
    topologySchemaVersion: z.literal(1),
    sourceFilesSha256: sha256,
    workerPath: relativeResourcePath,
    workerSha256: sha256,
    resourceFiles: z.array(z.object({ path: relativeResourcePath, sha256, label: z.string().min(1) })).min(1),
  })
  .strict();

/** Prepared PicoGK worker manifest. @public */
export type PicogkRuntimeManifest = z.infer<typeof picogkRuntimeManifestSchema>;

/** Fully resolved native options accepted by the PicoGK kernel. @public */
export type PicogkKernelOptions = z.infer<typeof picogkOptionsSchema>;

/**
 * Locate one host-owned, target-specific PicoGK worker payload.
 *
 * @param options - Prepared resource root, trust marker, and optional host target.
 * @returns Absolute, integrity-pinned PicoGK kernel options.
 * @public
 */
export const loadPicogkKernelOptions = (options: {
  readonly resourceRoot: string;
  readonly trustFile: string;
  readonly target?: string;
}): PicogkKernelOptions => {
  const target = options.target ?? `${process.platform}-${process.arch}`;
  const targetRoot = resolve(options.resourceRoot, target);
  const manifest = picogkRuntimeManifestSchema.parse(
    JSON.parse(readFileSync(join(targetRoot, 'tau-runtime-manifest.json'), 'utf8')),
  );
  if (manifest.target !== target) {
    throw new Error(`PicoGK resource target mismatch: ${manifest.target}`);
  }
  return picogkOptionsSchema.parse({
    workerExecutable: join(targetRoot, manifest.workerPath),
    workerSha256: manifest.workerSha256,
    trustFile: options.trustFile,
    resourceFiles: manifest.resourceFiles.map(({ path, ...resource }) => ({
      ...resource,
      path: join(targetRoot, path),
    })),
  });
};
