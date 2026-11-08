/**
 * A linked GitHub import, in the file-manager worker (charter D12, I6).
 *
 * A linked import brings the repository's objects, not an archive: the
 * project is the reviewed branch, with its history. The page reviews the
 * repository and mints the remote's credential; everything else happens
 * here, under the authority, and no byte of it reaches the page:
 *
 * 1. the staging is claimed with the source's pin (the reviewed commit);
 * 2. the revisions authority fetches the pinned branch into the staging's
 *    control directory ({@link importControlDirectory}) and records the
 *    reviewed setup there ({@link bootstrapRemoteRevisionStore}), so `.git` is
 *    written once, by the authority, and never through the mutation pipeline;
 * 3. the fetched tree is staged like any import: each file written once, read
 *    back and measured once on the compute worker (EQ6), into the ledger;
 * 4. the commit moves the control directory into the project as `.git` and
 *    the staged files beside it, and writes `tau.json` last.
 *
 * A failure anywhere leaves a staging the session discards (or a sweep
 * removes), `.git` with it.
 *
 * @module
 */

import { importControlDirectory, planImport, stageImport } from '@taucad/filesystem/importer';
import type {
  ImportDecoder,
  ImportMeasurer,
  ImportPlan,
  ImportSource,
  ImportSourcePin,
  ImportStagingPort,
  ImportStagingProgress,
  StagedImport,
} from '@taucad/filesystem/importer';
import type { FileSystemProvider, PathPolicy } from '@taucad/filesystem';
import {
  bootstrapRemoteRevisionStore,
  createGitRemoteTransport,
  createIsomorphicGitRevisionPort,
  createRevisionHttpClient,
} from '@taucad/revisions';
import type { ComputeWorker, RevisionPort } from '@taucad/revisions';
import { revisionId } from '@taucad/revisions/algorithms';

type BootstrapInput = Parameters<typeof bootstrapRemoteRevisionStore>[0];

/**
 * What the page asks of a linked import: the reviewed repository and branch,
 * the setup it reviewed, and the remote's own credential, which only the
 * fetch uses. Plain data, cloned to the worker.
 *
 * @public
 */
export type LinkedImportRequest = Readonly<{
  /** The project's name, for the staging's pin. */
  name: string;
  /** The Tau API, whose git proxy reaches the remote. */
  apiBaseUrl: string;
  /** The remote's origin and repository, which the credential is held to. */
  origin: string;
  repositoryUrl: string;
  /** The whole `Authorization` header for the remote. */
  authorization: string;
  remote: BootstrapInput['remote'];
  sourceRef?: string;
  sourceHead?: string;
  targetBranch: string;
  author: BootstrapInput['author'];
  setup: NonNullable<BootstrapInput['setup']>;
  maximumFiles?: number;
  maximumBytes?: number;
}>;

/** The largest `upload-pack` answer a linked import accepts. @public */
export const linkedImportMaximumPackBytes = 128 * 1024 * 1024;

/** The largest worktree (and any other answer) a linked import accepts. @public */
export const linkedImportMaximumBytes = 256 * 1024 * 1024;

/**
 * The pin a linked import stages under: the repository, the target branch and
 * the reviewed commit, so a resumed staging is the same import and anything
 * else starts over. Sizes are not known before the fetch, and the commit
 * already names every byte.
 *
 * @param request - The linked import.
 * @returns The pin.
 * @public
 */
export const linkedImportPin = (request: LinkedImportRequest): ImportSourcePin => ({
  kind: 'linked',
  name: request.name,
  size: 0,
  entries: 0,
  revision: request.sourceHead ?? 'empty',
  identity: `${request.remote.repositoryId ?? request.remote.url}:${request.targetBranch}`,
});

/**
 * A fetched revision's tree as an import source: every file, with its mode.
 *
 * @param tree - The bootstrap's tree.
 * @param pin - The linked import's pin.
 * @returns The source.
 * @public
 */
export const revisionTreeImportSource = (
  tree: Awaited<ReturnType<typeof bootstrapRemoteRevisionStore>>['tree'],
  pin: ImportSourcePin,
): ImportSource => ({
  kind: 'linked',
  name: pin.name,
  ...(pin.revision === undefined ? {} : { revision: pin.revision }),
  stripSharedFolders: false,
  async *list(control) {
    for (const entry of tree.entries()) {
      control.signal?.throwIfAborted();
      control.listed(entry.path);
      yield {
        source: entry.path,
        size: entry.content.byteLength,
        mode: entry.mode,
        request: { blob: new Blob([entry.content]) },
      };
    }
  },
});

/**
 * The revisions port a linked import fetches through: over the storage
 * root's own provider, its store in the staging's control directory, with a
 * transport that carries the remote's credential to that remote alone.
 *
 * @param input - The provider, the operation, the request, and the compute worker.
 * @returns The port.
 * @public
 */
export const linkedImportPort = (
  input: Readonly<{
    provider: FileSystemProvider;
    operationId: string;
    request: LinkedImportRequest;
    compute?: ComputeWorker;
  }>,
): RevisionPort => {
  const { request } = input;
  const held = {
    apiBaseUrl: request.apiBaseUrl,
    origin: request.origin,
    repositoryUrl: request.repositoryUrl,
    authorization: request.authorization,
  } as const;
  return createIsomorphicGitRevisionPort({
    filesystem: input.provider,
    gitDirectory: importControlDirectory(input.operationId),
    ...(input.compute === undefined ? {} : { compute: input.compute }),
    http: createRevisionHttpClient({
      credentials: 'include',
      maximumResponseBytes: (url) =>
        url.endsWith('/git-upload-pack') ? linkedImportMaximumPackBytes : linkedImportMaximumBytes,
      ...createGitRemoteTransport(() => held),
    }),
  });
};

const emptyPlan = (pin: ImportSourcePin): ImportPlan => ({
  name: pin.name,
  pin,
  entries: [],
  bytes: 0,
  skipped: { excluded: 0, reserved: 0, symlinks: 0 },
});

/**
 * Stage a linked import: claim the staging, fetch the reviewed branch into
 * its control directory under the authority, then stage the fetched tree.
 *
 * @param input - The staging port, the operation, the request, the project
 *   directory asked for, the decode and read-back measure, the path policy,
 *   the revisions port to fetch through, and a signal and progress callback.
 * @returns The staged import.
 * @public
 */
export const stageLinkedImport = async (
  input: Readonly<{
    port: ImportStagingPort;
    operationId: string;
    request: LinkedImportRequest;
    target: string;
    decode: ImportDecoder;
    measure?: ImportMeasurer;
    policy: PathPolicy;
    revisions: RevisionPort;
    bootstrap?: typeof bootstrapRemoteRevisionStore;
    signal?: AbortSignal;
    onProgress?: (progress: ImportStagingProgress) => void;
  }>,
): Promise<StagedImport> => {
  const { port, operationId, request, signal } = input;
  const pin = linkedImportPin(request);
  const staging = {
    port,
    operationId,
    decode: input.decode,
    ...(input.measure === undefined ? {} : { measure: input.measure }),
    target: input.target,
    ...(signal === undefined ? {} : { signal }),
  };
  /* The staging (and its in-place folder, where a move would copy) is claimed under the pin before the fetch writes into it. */
  await stageImport({ ...staging, plan: emptyPlan(pin) });
  const bootstrap = input.bootstrap ?? bootstrapRemoteRevisionStore;
  const { tree } = await bootstrap({
    port: input.revisions,
    remote: request.remote,
    ...(request.sourceRef === undefined || request.sourceHead === undefined
      ? {}
      : { sourceRef: request.sourceRef, sourceHead: revisionId(request.sourceHead) }),
    targetBranch: request.targetBranch,
    author: request.author,
    maximumFiles: request.maximumFiles ?? 100_000,
    maximumBytes: request.maximumBytes ?? linkedImportMaximumBytes,
    setup: request.setup,
    ...(signal === undefined ? {} : { signal }),
  });
  const planned = await planImport(revisionTreeImportSource(tree, pin), {
    policy: input.policy,
    ...(signal === undefined ? {} : { signal }),
  });
  return stageImport({
    ...staging,
    plan: { ...planned, pin },
    ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
  });
};
