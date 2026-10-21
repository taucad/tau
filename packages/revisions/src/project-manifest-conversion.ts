/** Prepare current checkout bytes without exposing prerelease declarations to observers. */
import { convertLegacyProjectManifestBytes, serializeProjectManifest } from '@taucad/project-core';
import {
  createProjectIdentityActor,
  parseProjectIdentityBytes,
  projectIdentityPath,
  serializeProjectIdentity,
} from '@taucad/project-core/identity';
import type {
  InitializeProjectIdentityInput,
  ProjectIdentityLocation,
  ProjectIdentityRecord,
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

/** Prepared bytes and the exact local identity that must survive materialization. */
export type PreparedProjectManifest = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  identityBytes: Uint8Array<ArrayBuffer>;
}>;

/**
 * Establish identity through the shared machine before the apply transaction writes authored bytes.
 * @param input - Host filesystem, established identity, historical bytes and cancellation.
 * @returns The ID-free target and identity witness; historical and current manifest bytes are untouched.
 */
export const prepareProjectManifest = async (
  input: Readonly<{
    filesystem: RevisionFileSystem;
    projectId: string;
    expected: Uint8Array<ArrayBuffer>;
    signal?: AbortSignal;
  }>,
): Promise<PreparedProjectManifest | undefined> => {
  const legacy = convertLegacyProjectManifestBytes(input.expected);
  if (!legacy.success) {
    return;
  }
  validateLegacyProjectIdentity(input.expected, input.projectId);
  const { filesystem } = input;
  const readIdentityBytes = async (): Promise<Uint8Array<ArrayBuffer>> => {
    const stat = await filesystem.stat(projectIdentityPath);
    if (stat.size > 1024) {
      throw new Error('Project identity record exceeds 1024 bytes.');
    }
    return filesystem.readFile(projectIdentityPath);
  };
  const readIdentity = async (): Promise<ProjectIdentityRecord | undefined> => {
    try {
      return parseProjectIdentityBytes(await readIdentityBytes());
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
  };
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
        run: async ({ input: request, signal }) => {
          signal.throwIfAborted();
          input.signal?.throwIfAborted();
          const result = await filesystem.writeFileChecked({
            path: projectIdentityPath,
            data: serializeProjectIdentity({ version: 1, projectId: request.projectId }),
            preconditions: [{ path: projectIdentityPath, expected: null }],
          });
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
  input.signal?.throwIfAborted();
  identity.start();
  try {
    const result = await toPromise(identity);
    input.signal?.throwIfAborted();
    if (result.status !== 'resolved' || result.projectId !== input.projectId) {
      throw new RevisionPortError(
        'CHECKOUT_CONFLICT',
        'Project identity could not be preserved before materialization.',
      );
    }
    const identityBytes = await readIdentityBytes();
    input.signal?.throwIfAborted();
    if (parseProjectIdentityBytes(identityBytes).projectId !== input.projectId) {
      throw new RevisionPortError('CHECKOUT_CONFLICT', 'Project identity changed before materialization.');
    }
    return { bytes: serializeProjectManifest(legacy.data.manifest), identityBytes };
  } finally {
    identity.stop();
  }
};

/**
 * Prove the prepared declaration and identity still agree before publishing the new graph head.
 * @param filesystem - The same authority-fenced checkout.
 * @param prepared - The target and identity bytes retained before apply.
 * @param signal - Cancellation owned by the materialization actor.
 */
export const verifyPreparedProjectManifest = async (
  filesystem: RevisionFileSystem,
  prepared: PreparedProjectManifest,
  signal?: AbortSignal,
): Promise<void> => {
  signal?.throwIfAborted();
  const result = await filesystem.writeFileChecked({
    path: 'tau.json',
    data: prepared.bytes,
    preconditions: [
      { path: 'tau.json', expected: prepared.bytes },
      { path: projectIdentityPath, expected: prepared.identityBytes },
    ],
  });
  signal?.throwIfAborted();
  if (result.status !== 'unchanged') {
    throw new RevisionPortError('CHECKOUT_CONFLICT', 'The manifest or identity changed during materialization.');
  }
};
