import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionFileMode, RevisionId } from '@taucad/filesystem/revisions';
import { revisionBranchName } from '#revision-authority.js';
import type { RevisionProvenance, RevisionSummary } from '#revision-authority.js';
import { RevisionPortError } from '#revision-port.js';
import type { RevisionPort } from '#revision-port.js';
import { remoteTrackingRef } from '#remotes.js';
import { assertMaterializableRevisionTree } from '#portable-tree.js';

const headRefPrefix = 'refs/heads/';

/** Exact, nonsecret descriptor for adopting one remote Git branch as a Tau project. @public */
export type RemoteBootstrapInput = Readonly<{
  port: RevisionPort;
  remote: Readonly<{ name: string; url: string; provider?: 'github'; repositoryId?: string; fetchOnly?: boolean }>;
  /** Both absent for a verified empty repository. */
  sourceRef?: string;
  sourceHead?: RevisionId;
  targetBranch: string;
  author: Readonly<{ name: string; email: string }>;
  maximumFiles?: number;
  maximumBytes?: number;
  signal?: AbortSignal;
  /** Exact reviewed final tree. When it differs, bootstrap records one child of the imported head. */
  setup?: Readonly<{
    files: ReadonlyArray<
      Readonly<{
        path: string;
        content?: Uint8Array<ArrayBuffer>;
        mode?: RevisionFileMode;
      }>
    >;
    provenance: RevisionProvenance;
    summary: RevisionSummary;
  }>;
}>;

/** Verified local result of one exact-ref remote bootstrap. @public */
export type RemoteBootstrapResult = Readonly<{
  head: RevisionId;
  tree: ImmutableRevisionTree;
}>;

/**
 * Fetch and adopt one pinned remote branch without minting unrelated history.
 *
 * The caller persists the returned tree and the port's control plane together;
 * this function owns the graph invariant: the local target is either the
 * reviewed remote commit or nothing.
 *
 * @param input - Port, exact source pin, target branch, and resource bounds.
 * @returns The verified imported head and tree.
 * @public
 */
export async function bootstrapRemoteRevisionStore(input: RemoteBootstrapInput): Promise<RemoteBootstrapResult> {
  if ((input.sourceRef === undefined) !== (input.sourceHead === undefined)) {
    throw new TypeError('sourceRef and sourceHead must either both be present or both be absent.');
  }
  if (input.sourceRef !== undefined && !input.sourceRef.startsWith(headRefPrefix)) {
    throw new TypeError('sourceRef must be a full Git branch ref.');
  }
  if (input.sourceRef !== undefined) {
    revisionBranchName(input.sourceRef.slice(headRefPrefix.length));
  }
  const targetBranch = revisionBranchName(input.targetBranch);
  const maximumFiles = input.maximumFiles ?? 100_000;
  const maximumBytes = input.maximumBytes ?? 1024 * 1024 * 1024;
  if (
    !Number.isSafeInteger(maximumFiles) ||
    maximumFiles < 1 ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1
  ) {
    throw new RangeError('Remote bootstrap limits must be positive safe integers.');
  }

  input.signal?.throwIfAborted();
  await input.port.init({ author: input.author, createSetupFiles: false });
  await input.port.setRemote(input.remote);
  const advertised = await input.port.listRemoteRefs(input.remote.name);
  const advertisedTarget = advertised.find((ref) => ref.name === `${headRefPrefix}${targetBranch}`)?.head;
  const expectedTarget = input.sourceRef === `${headRefPrefix}${targetBranch}` ? input.sourceHead : undefined;
  if (advertisedTarget !== expectedTarget) {
    throw new RevisionPortError('REMOTE_REF_CONFLICT', `Remote branch ${targetBranch} already names another revision.`);
  }
  let importedTree = new ImmutableRevisionTree([]);
  if (input.sourceRef === undefined || input.sourceHead === undefined) {
    if (advertised.some((ref) => ref.name.startsWith(headRefPrefix))) {
      throw new RevisionPortError(
        'REMOTE_REF_CONFLICT',
        'The repository is no longer empty. Review it again before importing.',
      );
    }
    if (input.setup === undefined) {
      throw new TypeError('An empty repository bootstrap requires reviewed setup files.');
    }
  } else {
    const source = advertised.find((ref) => ref.name === input.sourceRef);
    if (source?.head !== input.sourceHead) {
      throw new RevisionPortError(
        'REMOTE_REF_CONFLICT',
        'The selected GitHub branch changed. Review it again before importing.',
      );
    }
    await input.port.fetch({
      remote: input.remote.name,
      refs: [input.sourceRef],
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const fetched = await input.port.readRef(remoteTrackingRef(input.remote.name, input.sourceRef));
    if (fetched !== input.sourceHead) {
      throw new RevisionPortError(
        'REMOTE_REF_CONFLICT',
        'The fetched GitHub branch does not match the reviewed commit.',
      );
    }
    const fetchedTree = await input.port.readTree(input.sourceHead);
    if (fetchedTree === undefined) {
      throw new RevisionPortError('UNKNOWN_REVISION', 'The selected GitHub commit was not fetched.');
    }
    importedTree = fetchedTree;
  }
  const setupEntries = new Map(
    importedTree.entries().map((entry) => [entry.path, [entry.path, entry.content, entry.mode] as const]),
  );
  for (const file of input.setup?.files ?? []) {
    if (file.content === undefined) {
      setupEntries.delete(file.path);
    } else {
      setupEntries.set(file.path, [file.path, file.content, file.mode ?? '100644']);
    }
  }
  const tree = input.setup === undefined ? importedTree : new ImmutableRevisionTree(setupEntries.values());
  const entries = tree.entries();
  if (entries.length > maximumFiles) {
    throw new RangeError(`Repository contains more than ${String(maximumFiles)} files.`);
  }
  assertMaterializableRevisionTree(tree);
  let bytes = 0;
  for (const entry of entries) {
    bytes += entry.content.byteLength;
    if (bytes > maximumBytes) {
      throw new RangeError(`Repository content exceeds ${String(maximumBytes)} bytes.`);
    }
  }
  const existing = await input.port.readRef(targetBranch);
  if (existing !== undefined && existing !== input.sourceHead) {
    throw new RevisionPortError('REMOTE_REF_CONFLICT', `Local branch ${targetBranch} already names another revision.`);
  }
  if (existing === undefined && input.sourceHead !== undefined) {
    const update = await input.port.updateRef({ name: targetBranch, expectedHead: undefined, head: input.sourceHead });
    if (update.status !== 'updated') {
      throw new RevisionPortError('REMOTE_REF_CONFLICT', 'The target branch changed during import.');
    }
  }
  let head = input.sourceHead;
  const importedEntries = importedTree.entries();
  const { setup } = input;
  if (
    setup !== undefined &&
    (entries.length !== importedEntries.length ||
      entries.some((entry, index) => {
        const { [index]: imported } = importedEntries;
        return (
          imported === undefined ||
          entry.path !== imported.path ||
          entry.mode !== imported.mode ||
          entry.content.length !== imported.content.length ||
          entry.content.some((byte, byteIndex) => byte !== imported.content.at(byteIndex))
        );
      }))
  ) {
    const receipt = await input.port.writeRevision({
      parents: input.sourceHead === undefined ? [] : [input.sourceHead],
      tree,
      provenance: setup.provenance,
      summary: setup.summary,
    });
    head = revisionId(receipt.commitId);
    const update = await input.port.updateRef({ name: targetBranch, expectedHead: input.sourceHead, head });
    if (update.status !== 'updated') {
      throw new RevisionPortError('REMOTE_REF_CONFLICT', 'The target branch changed while applying reviewed setup.');
    }
  }
  if (head === undefined) {
    throw new RevisionPortError('UNKNOWN_REVISION', 'The empty repository setup did not create a revision.');
  }
  await input.port.setHead(targetBranch);
  return Object.freeze({ head, tree });
}
