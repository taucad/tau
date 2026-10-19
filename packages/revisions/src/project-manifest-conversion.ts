/** Convert only current checked-out prerelease bytes; historical objects remain byte-exact. */
import { convertLegacyProjectManifestBytes, serializeProjectManifest } from '@taucad/project-core';
import {
  createProjectIdentityActor,
  createProjectManifestConversionActor,
  parseProjectIdentityBytes,
  projectIdentityPath,
  serializeProjectIdentity,
} from '@taucad/project-core/identity';
import type {
  InitializeProjectIdentityInput,
  ProjectIdentityLocation,
  ProjectIdentityRecord,
  ProjectIdentityResult,
  ProjectManifestConversionInput,
  ProjectManifestReplacementResult,
} from '@taucad/project-core/identity';
import { createAsyncLogic, toPromise } from 'xstate';
import { RevisionPortError } from '#revision-port.js';
import type { RevisionFileSystem } from '#revision-effects.types.js';

/**
 * Refuse identity contradictions before applying an imported or restored tree.
 * @param bytes - Original incoming manifest bytes.
 * @param projectId - The established checkout identity.
 */
export const validateLegacyProjectIdentity = (bytes: Uint8Array<ArrayBuffer> | undefined, projectId: string): void => {
  if (bytes === undefined) {
    return;
  }
  const legacy = convertLegacyProjectManifestBytes(bytes);
  if (legacy.success && legacy.data.projectId !== projectId) {
    throw new RevisionPortError('CHECKOUT_CONFLICT', 'The incoming project identity does not match this project.');
  }
};

/**
 * Run the shared conversion lifecycle over a host-supplied checked-write filesystem.
 * @param input - Checked filesystem, established identity, original bytes and cancellation.
 * @returns Converted current bytes for recovery, or absence when conversion is unnecessary.
 */
export const convertCheckedOutProjectManifest = async (
  input: Readonly<{
    filesystem: RevisionFileSystem;
    projectId: string;
    expected: Uint8Array<ArrayBuffer>;
    signal?: AbortSignal;
  }>,
): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  const legacy = convertLegacyProjectManifestBytes(input.expected);
  if (!legacy.success) {
    return;
  }
  validateLegacyProjectIdentity(input.expected, input.projectId);
  const { filesystem } = input;
  const convertedBytes = serializeProjectManifest(legacy.data.manifest);
  input.signal?.throwIfAborted();
  const readIdentity = async (): Promise<ProjectIdentityRecord | undefined> => {
    try {
      const stat = await filesystem.stat(projectIdentityPath);
      if (stat.size > 1024) {
        throw new Error('Project identity record exceeds 1024 bytes.');
      }
      return parseProjectIdentityBytes(await filesystem.readFile(projectIdentityPath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  };
  const conversion = createProjectManifestConversionActor({
    input: { projectId: input.projectId },
    actors: {
      establishIdentity: createAsyncLogic<ProjectIdentityResult, ProjectManifestConversionInput>({
        run: async ({ signal }) => {
          input.signal?.throwIfAborted();
          const identity = createProjectIdentityActor({
            input: { locationKey: 'current-checkout', mode: 'ensure', preferredProjectId: input.projectId },
            actors: {
              readIdentity: createAsyncLogic<ProjectIdentityRecord | undefined, ProjectIdentityLocation>({
                run: async () => readIdentity(),
              }),
              mintIdentity: createAsyncLogic<string, ProjectIdentityLocation>({
                run: async () => {
                  throw new Error('A checkout conversion cannot mint a new project identity.');
                },
              }),
              initializeIdentity: createAsyncLogic<ProjectIdentityRecord, InitializeProjectIdentityInput>({
                run: async ({ input: request, signal: initializing }) => {
                  initializing.throwIfAborted();
                  const result = await filesystem.writeFileChecked({
                    path: projectIdentityPath,
                    data: serializeProjectIdentity({ version: 1, projectId: request.projectId }),
                    preconditions: [{ path: projectIdentityPath, expected: null }],
                  });
                  initializing.throwIfAborted();
                  const record =
                    result.status === 'conflict' ? await readIdentity() : parseProjectIdentityBytes(result.content);
                  if (record === undefined) {
                    throw new Error('Project identity disappeared during conversion.');
                  }
                  return record;
                },
              }),
            },
          });
          signal.throwIfAborted();
          identity.start();
          try {
            const result = await toPromise(identity);
            signal.throwIfAborted();
            return result;
          } finally {
            identity.stop();
          }
        },
      }),
      replaceManifest: createAsyncLogic<ProjectManifestReplacementResult, ProjectManifestConversionInput>({
        run: async ({ signal }) => {
          signal.throwIfAborted();
          input.signal?.throwIfAborted();
          const identityStat = await filesystem.stat(projectIdentityPath);
          if (identityStat.size > 1024) {
            return 'conflict';
          }
          const identityBytes = await filesystem.readFile(projectIdentityPath);
          if (parseProjectIdentityBytes(identityBytes).projectId !== input.projectId) {
            return 'conflict';
          }
          signal.throwIfAborted();
          input.signal?.throwIfAborted();
          const result = await filesystem.writeFileChecked({
            path: 'tau.json',
            data: convertedBytes,
            preconditions: [
              { path: 'tau.json', expected: input.expected },
              { path: projectIdentityPath, expected: identityBytes },
            ],
          });
          return result.status === 'applied' ? 'converted' : result.status;
        },
      }),
    },
  });
  conversion.start();
  try {
    const result = await toPromise(conversion);
    if (result.status !== 'converted' && result.status !== 'unchanged') {
      throw new RevisionPortError(
        'CHECKOUT_CONFLICT',
        result.status === 'failed'
          ? result.message
          : 'The manifest changed while its identity was being preserved. Reopen the project to retry.',
      );
    }
    return convertedBytes;
  } finally {
    conversion.stop();
  }
};
