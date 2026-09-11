import { readFile, stat } from 'node:fs/promises';

import type { JobArtifactManifest, JobJsonValue, JobProviderRuntime } from '@taucad/jobs';

const encoder = new TextEncoder();
const artifactFileLimit = 256 * 1024 * 1024;

/**
 * @internal
 * @param runtime - Attempt artifact writer.
 * @param input - JSON artifact metadata and value.
 * @returns The persisted content-addressed manifest.
 */
export const writeJsonArtifact = async (
  runtime: JobProviderRuntime,
  input: { readonly role: string; readonly logicalPath: string; readonly value: JobJsonValue },
): Promise<JobArtifactManifest> =>
  runtime.writeArtifact({
    role: input.role,
    logicalPath: input.logicalPath,
    mediaType: 'application/json',
    bytes: encoder.encode(`${JSON.stringify(input.value, undefined, 2)}\n`),
  });

/**
 * @internal
 * @param runtime - Attempt artifact writer.
 * @param input - Text artifact metadata and content.
 * @returns The persisted content-addressed manifest.
 */
export const writeTextArtifact = async (
  runtime: JobProviderRuntime,
  input: {
    readonly role: string;
    readonly logicalPath: string;
    readonly mediaType: string;
    readonly text: string;
  },
): Promise<JobArtifactManifest> =>
  runtime.writeArtifact({
    role: input.role,
    logicalPath: input.logicalPath,
    mediaType: input.mediaType,
    bytes: encoder.encode(input.text),
  });

/**
 * @internal
 * @param runtime - Attempt artifact writer.
 * @param input - File artifact metadata and physical attempt path.
 * @returns The persisted content-addressed manifest.
 */
export const writeFileArtifact = async (
  runtime: JobProviderRuntime,
  input: { readonly role: string; readonly logicalPath: string; readonly mediaType: string; readonly path: string },
): Promise<JobArtifactManifest> => {
  const metadata = await stat(input.path);
  if (metadata.size > artifactFileLimit) {
    throw new Error(`Solver artifact ${JSON.stringify(input.logicalPath)} exceeds the 256 MiB output limit.`);
  }
  const bytes = await readFile(input.path);
  return runtime.writeArtifact({
    role: input.role,
    logicalPath: input.logicalPath,
    mediaType: input.mediaType,
    bytes: Uint8Array.from(bytes),
  });
};
