/** Native persistence actors for the shared project identity and prerelease conversion machines. */
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import {
  convertLegacyProjectManifestBytes,
  parseProjectManifestBytes,
  projectManifestMaxBytes,
  serializeProjectManifest,
} from '@taucad/project-core';
import {
  createProjectIdentityActor,
  createProjectManifestConversionActor,
  parseProjectIdentityBytes,
  projectIdentityPath,
  serializeProjectIdentity,
} from '@taucad/project-core/identity';
import type {
  ProjectIdentityRecord,
  ProjectIdentityLocation,
  InitializeProjectIdentityInput,
  ProjectIdentityResult,
  ProjectManifestConversionInput,
  ProjectManifestReplacementResult,
} from '@taucad/project-core/identity';
import { createAsyncLogic, toPromise } from 'xstate';
import { generatePrefixedId } from '@taucad/utils/id';

import { defaultConfigDirectory } from '#credential-store.js';

const identityLimit = 1024;

/**
 * Read a regular file with a hard allocation bound; missing files alone return undefined.
 * @param path - Canonical-root metadata path.
 * @param maximum - Hard read bound in bytes.
 * @returns Complete metadata bytes, or absence.
 */
const readBounded = async (path: string, maximum: number): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  let file;
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) {
      throw new Error(`Project metadata must not be a symbolic link: ${path}`);
    }
    // oxlint-disable-next-line eslint/no-bitwise -- combine native open flags to refuse symlink races.
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  try {
    const metadata = await file.stat();
    if (!metadata.isFile()) {
      throw new Error(`Project metadata must be a regular file: ${path}`);
    }
    if (metadata.size > maximum) {
      throw new Error(`Project metadata exceeds ${String(maximum)} bytes: ${path}`);
    }
    const buffer = new Uint8Array(Math.min(maximum, metadata.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      // oxlint-disable-next-line no-await-in-loop -- a bounded read must handle partial filesystem reads.
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }
    if (offset === buffer.length) {
      throw new Error(`Project metadata changed while reading: ${path}`);
    }
    if (offset > maximum) {
      throw new Error(`Project metadata exceeds ${String(maximum)} bytes: ${path}`);
    }
    return buffer.slice(0, offset);
  } finally {
    await file.close();
  }
};

/**
 * A hard link publishes a complete record atomically and cannot replace a concurrent winner.
 * @param root - Canonical project directory.
 * @param projectId - Candidate identity supplied by the shared machine.
 * @returns The complete winning durable identity record.
 */
const initializeIdentity = async (root: string, projectId: string): Promise<ProjectIdentityRecord> => {
  const directory = join(root, '.tau');
  await mkdir(directory, { recursive: true });
  if ((await realpath(directory)) !== directory) {
    throw new Error('Project identity metadata must remain inside the project directory.');
  }
  const temporary = join(directory, `.project.${randomUUID()}.tmp`);
  const target = join(root, projectIdentityPath);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(serializeProjectIdentity({ version: 1, projectId }));
      await file.sync();
    } finally {
      await file.close();
    }
    await link(temporary, target).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    });
    const directoryHandle = await open(directory, 'r');
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    const bytes = await readBounded(target, identityLimit);
    if (bytes === undefined) {
      throw new Error('Project identity disappeared during initialization.');
    }
    return parseProjectIdentityBytes(bytes);
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    });
  }
};

/** Native checked-write authority held for one project operation lifetime. */
export type NodeProjectFileSystem = Readonly<{
  open: (root: string) => NodeFsProviderClient;
  admitMutation: () => Promise<void>;
  close: () => Promise<void>;
}>;

/**
 * Open a confined native authority for standalone revision commands.
 * @param workspaceRoot - The explicitly admitted project directory.
 * @returns Checked filesystem access and its lifetime cleanup.
 */
export const openNodeProjectFileSystem = async (workspaceRoot: string): Promise<NodeProjectFileSystem> => {
  const canonical = await realpath(workspaceRoot);
  const authorityRoot = join(
    defaultConfigDirectory(),
    'filesystem-authority',
    createHash('sha256').update(canonical).digest('hex'),
  );
  await mkdir(authorityRoot, { recursive: true, mode: 0o700 });
  const authority = new NodeFsAuthorityHost({
    authorityDirectory: () => authorityRoot,
    authorityIdentity: () => canonical,
  });
  const ports = new MessageChannel();
  const channel = new NodeFsChannel(toNodeFsPort(ports.port2));
  const admitted = new Set([canonical]);
  const stop = serveNodeFsProvider(toNodeFsPort(ports.port1), {
    authority,
    allowRoot: (root) => admitted.has(root),
    policy: tauPathPolicy,
  });
  return {
    open: (root) => {
      admitted.add(root);
      return new NodeFsProviderClient(channel, root);
    },
    admitMutation: async () => authority.run({ root: canonical, paths: [] }, async () => undefined),
    close: async () => {
      channel.close();
      await stop();
    },
  };
};

/** Inputs for explicit native admission; bootstrap permits an intentionally empty served directory. */
export type NodeProjectIdentityInput = Readonly<{
  workspaceRoot: string;
  projectId?: string;
  bootstrap?: boolean;
  filesystem?: Pick<NodeFsProviderClient, 'writeFileChecked'>;
}>;

/**
 * Resolve durable native identity and convert only the exact validated prerelease declaration.
 * @param input - Admission intent, trusted identity and optional existing native authority.
 * @returns Stable identity, or absence during ordinary discovery.
 */
export const resolveNodeProjectIdentity = async (input: NodeProjectIdentityInput): Promise<string | undefined> => {
  const root = await realpath(input.workspaceRoot);
  const metadataDirectory = join(root, '.tau');
  const metadata = await lstat(metadataDirectory).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  if (metadata?.isSymbolicLink() === true) {
    throw new Error('Project identity directory must not be a symbolic link.');
  }
  const [identityBytes, manifestBytes] = await Promise.all([
    readBounded(join(root, projectIdentityPath), identityLimit),
    readBounded(join(root, 'tau.json'), projectManifestMaxBytes),
  ]);
  if (manifestBytes === undefined && input.bootstrap !== true) {
    return undefined;
  }
  const record = identityBytes === undefined ? undefined : parseProjectIdentityBytes(identityBytes);
  const manifest = manifestBytes === undefined ? undefined : parseProjectManifestBytes(manifestBytes);
  const legacy =
    manifestBytes === undefined || manifest?.success === true
      ? undefined
      : convertLegacyProjectManifestBytes(manifestBytes);
  if (record === undefined && manifestBytes !== undefined && manifest?.success !== true && legacy?.success !== true) {
    throw new Error('Project manifest is invalid; fix it before establishing project identity.');
  }
  if (record === undefined && manifest?.success !== true && legacy?.success !== true && input.bootstrap !== true) {
    return undefined;
  }
  if (legacy?.success === true && input.projectId !== undefined && legacy.data.projectId !== input.projectId) {
    throw new Error(`Project identity conflict: expected ${input.projectId}, found ${legacy.data.projectId}.`);
  }
  const preferredProjectId = input.projectId ?? (legacy?.success === true ? legacy.data.projectId : undefined);
  const identity = createProjectIdentityActor({
    input: {
      locationKey: root,
      mode: 'ensure',
      initialIdentity: { record },
      ...(preferredProjectId === undefined ? {} : { preferredProjectId }),
    },
    actors: {
      readIdentity: createAsyncLogic<ProjectIdentityRecord | undefined, ProjectIdentityLocation>({
        run: async () => record,
      }),
      mintIdentity: createAsyncLogic<string, ProjectIdentityLocation>({ run: async () => generatePrefixedId('proj') }),
      initializeIdentity: createAsyncLogic<ProjectIdentityRecord, InitializeProjectIdentityInput>({
        run: async ({ input: request, signal }) => {
          signal.throwIfAborted();
          const result = await initializeIdentity(root, request.projectId);
          signal.throwIfAborted();
          return result;
        },
      }),
    },
  });
  identity.start();
  const result = await toPromise(identity);
  if (result.status !== 'resolved') {
    throw new Error(
      result.status === 'conflict'
        ? `Project identity conflict: expected ${result.expectedProjectId}, found ${result.actualProjectId}.`
        : result.status === 'failed'
          ? result.message
          : 'Project identity could not be established.',
    );
  }
  if (legacy?.success === true && manifestBytes !== undefined) {
    const owned = input.filesystem === undefined ? await openNodeProjectFileSystem(root) : undefined;
    const filesystem = input.filesystem ?? owned!.open(root);
    const conversion = createProjectManifestConversionActor({
      input: { projectId: result.projectId },
      actors: {
        establishIdentity: createAsyncLogic<ProjectIdentityResult, ProjectManifestConversionInput>({
          run: async () => result,
        }),
        replaceManifest: createAsyncLogic<ProjectManifestReplacementResult, ProjectManifestConversionInput>({
          run: async ({ signal }) => {
            signal.throwIfAborted();
            const identityBytes = await readBounded(join(root, projectIdentityPath), identityLimit);
            if (
              identityBytes === undefined ||
              parseProjectIdentityBytes(identityBytes).projectId !== result.projectId
            ) {
              return 'conflict';
            }
            const written = await filesystem.writeFileChecked({
              path: 'tau.json',
              data: serializeProjectManifest(legacy.data.manifest),
              preconditions: [
                { path: 'tau.json', expected: manifestBytes },
                { path: projectIdentityPath, expected: identityBytes },
              ],
            });
            signal.throwIfAborted();
            return written.status === 'applied' ? 'converted' : written.status;
          },
        }),
      },
    });
    try {
      conversion.start();
      const converted = await toPromise(conversion);
      if (converted.status !== 'converted' && converted.status !== 'unchanged') {
        throw new Error('Project manifest changed during identity conversion; reopen the project to retry.');
      }
    } finally {
      conversion.stop();
      await owned?.close();
    }
  }
  return result.projectId;
};
