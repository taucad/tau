import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import { z } from 'zod';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import { ResourceQueue } from '#resource-queue.js';
import { revisionMetadataSchema } from '#revision-metadata.js';
import { ImmutableRevisionTree, revisionId } from '#revision-tree.js';
import { revisionBranchName } from '#revision-authority.js';
import type {
  BranchHeadUpdateResult,
  Revision,
  RevisionBranchName,
  RevisionProvenance,
  RevisionSummary,
  UpdateBranchHeadInput,
} from '#revision-authority.js';
import type { FileSystemProvider } from '#types.js';

/** Durable storage evidence for one revision. @public */
export type RevisionPersistenceReceipt =
  | Readonly<{ type: 'browser' }>
  | Readonly<{
      type: 'native-git';
      commitId: string;
      objectFormat: 'sha1' | 'sha256';
    }>;

/** One revision and the storage evidence recovered with it. @public */
export type RevisionPersistenceEntry = Readonly<{
  revision: Revision;
  persistence: RevisionPersistenceReceipt;
}>;

/** One durable branch head recovered on authority startup. @public */
export type PersistedRevisionBranchHead = Readonly<{
  branch: RevisionBranchName;
  head: Revision['id'];
}>;

/** Complete durable revision graph loaded by a persistence port. @public */
export type RevisionPersistenceSnapshot = Readonly<{
  revisions: readonly RevisionPersistenceEntry[];
  branchHeads: readonly PersistedRevisionBranchHead[];
}>;

/** Authoritative durable boundary for immutable revisions and expected-old refs. @public */
export type RevisionPersistencePort = Readonly<{
  load(): Promise<RevisionPersistenceSnapshot>;
  storeRevision(revision: Revision): Promise<RevisionPersistenceReceipt>;
  updateBranchHead(input: UpdateBranchHeadInput): Promise<BranchHeadUpdateResult>;
}>;

/** Provider-backed browser persistence options. @public */
export type BrowserRevisionPersistenceOptions = Readonly<{
  filesystem: FileSystemProvider;
  storageDirectory?: string;
  resourceQueue?: ResourceQueue;
}>;

type PersistedRevisionMetadata = Readonly<{
  version: 1;
  id: string;
  parents: readonly string[];
  provenance: RevisionProvenance;
  summary: RevisionSummary;
}>;

type PersistedBranchHead = Readonly<{
  version: 1;
  branch: string;
  head: string;
}>;

const defaultStorageDirectory = '.tau/revisions';
const browserReceipt: RevisionPersistenceReceipt = Object.freeze({ type: 'browser' });
const browserRevisionPersistenceQueue = new ResourceQueue();
const snapshotAttemptLimit = 3;
let browserRevisionPersistenceCoordinator: CrossTabCoordinator | undefined;

const persistedBranchHeadSchema = z.object({
  version: z.literal(1),
  branch: z.string(),
  head: z.string(),
});

const withCrossContextLock = async <T>(path: string, operation: () => Promise<T>): Promise<T> => {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    return operation();
  }
  browserRevisionPersistenceCoordinator ??= new CrossTabCoordinator();
  return browserRevisionPersistenceCoordinator.withLocks([path], operation);
};

const parseRevisionMetadata = (value: unknown): PersistedRevisionMetadata => {
  const result = revisionMetadataSchema.safeParse(value);
  if (!result.success || result.data.id === undefined) {
    throw new TypeError('Persisted revision metadata is invalid.');
  }
  const { version, id, parents, provenance, summary } = result.data;
  const { source, actorId, runId, createdAt } = provenance;
  const { generated, edited } = summary;
  return {
    version,
    id: revisionId(id),
    parents: parents.map((parent) => revisionId(parent)),
    provenance: {
      source,
      actorId,
      ...(runId === undefined ? {} : { runId }),
      createdAt,
    },
    summary: { generated, ...(edited === undefined ? {} : { edited }) },
  };
};

const parseBranchHead = (value: unknown): PersistedRevisionBranchHead => {
  const result = persistedBranchHeadSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError('Persisted revision branch head is invalid.');
  }
  return { branch: revisionBranchName(result.data.branch), head: revisionId(result.data.head) };
};

const metadataFor = (revision: Revision): PersistedRevisionMetadata => ({
  version: 1,
  id: revision.id,
  parents: [...revision.parents],
  provenance: {
    source: revision.provenance.source,
    actorId: revision.provenance.actorId,
    ...(revision.provenance.runId === undefined ? {} : { runId: revision.provenance.runId }),
    createdAt: revision.provenance.createdAt,
  },
  summary: {
    generated: revision.summary.generated,
    ...(revision.summary.edited === undefined ? {} : { edited: revision.summary.edited }),
  },
});

const sameBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

const sameRevision = (left: Revision, right: Revision): boolean => {
  if (JSON.stringify(metadataFor(left)) !== JSON.stringify(metadataFor(right))) {
    return false;
  }
  const leftEntries = left.tree.entries();
  const rightEntries = right.tree.entries();
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every((entry, index) => {
      const rightEntry = rightEntries[index];
      return entry.path === rightEntry?.path && sameBytes(entry.content, rightEntry.content);
    })
  );
};

const readTree = async (filesystem: FileSystemProvider, directory: string): Promise<ImmutableRevisionTree> => {
  const entries: Array<readonly [string, Uint8Array<ArrayBuffer>]> = [];
  const visit = async (relativePath: string): Promise<void> => {
    const path = relativePath === '' ? directory : joinRelativePath(directory, relativePath);
    const childNames = await filesystem.readdir(path);
    const children = childNames.toSorted();
    for (const child of children) {
      const childRelativePath = joinRelativePath(relativePath, child);
      const childPath = joinRelativePath(directory, childRelativePath);
      // oxlint-disable-next-line no-await-in-loop -- provider tree traversal must classify each child before descending.
      const stat = await filesystem.stat(childPath);
      if (stat.type === 'dir') {
        // oxlint-disable-next-line no-await-in-loop -- recursive traversal preserves deterministic provider pressure.
        await visit(childRelativePath);
      } else {
        // oxlint-disable-next-line no-await-in-loop -- bounded sequential reads avoid materializing every file twice concurrently.
        entries.push([childRelativePath, await filesystem.readFile(childPath)]);
      }
    }
  };
  if (await filesystem.exists(directory)) {
    await visit('');
  }
  return new ImmutableRevisionTree(entries);
};

const removeTree = async (filesystem: FileSystemProvider, path: string): Promise<void> => {
  if (!(await filesystem.exists(path))) {
    return;
  }
  const stat = await filesystem.stat(path);
  if (stat.type === 'file') {
    await filesystem.unlink(path);
    return;
  }
  for (const child of await filesystem.readdir(path)) {
    // oxlint-disable-next-line no-await-in-loop -- children must be removed before their parent directory.
    await removeTree(filesystem, joinRelativePath(path, child));
  }
  await filesystem.rmdir(path);
};

/**
 * Persist revisions in the filesystem provider already selected by the browser
 * workspace layer (OPFS, IndexedDB, or File System Access).
 *
 * Revision metadata is the commit marker and is atomically renamed into place
 * after every tree byte. Branch refs retain a backup until their replacement
 * commits. Both mutation protocols share the filesystem's cross-tab lock.
 *
 * @public
 */
export const createBrowserRevisionPersistence = (
  options: BrowserRevisionPersistenceOptions,
): RevisionPersistencePort => {
  const { filesystem, resourceQueue } = options;
  const storageDirectory = assertRootedPath(options.storageDirectory ?? defaultStorageDirectory);
  if (storageDirectory === '') {
    throw new TypeError('Revision persistence storageDirectory cannot be the filesystem root.');
  }
  const nodesDirectory = joinRelativePath(storageDirectory, 'nodes');
  const branchesDirectory = joinRelativePath(storageDirectory, 'branches');
  const storageLock = `revision-persistence:${filesystem.id}:${storageDirectory}`;
  const nodeDirectory = (id: Revision['id']): string => joinRelativePath(nodesDirectory, encodeURIComponent(id));
  const metadataPath = (id: Revision['id']): string => joinRelativePath(nodeDirectory(id), 'metadata.json');
  const temporaryMetadataPath = (id: Revision['id']): string => `${metadataPath(id)}.tmp`;
  const treeDirectory = (id: Revision['id']): string => joinRelativePath(nodeDirectory(id), 'tree');
  const branchPath = (branch: RevisionBranchName): string =>
    joinRelativePath(branchesDirectory, `${encodeURIComponent(branch)}.json`);
  const temporaryBranchPath = (path: string): string => `${path}.tmp`;
  const backupBranchPath = (path: string): string => `${path}.backup`;

  const withStorageLock = async <T>(operation: () => Promise<T>): Promise<T> =>
    browserRevisionPersistenceQueue.queueFor(storageLock, async () =>
      withCrossContextLock(storageLock, async () =>
        resourceQueue === undefined ? operation() : resourceQueue.queueFor(storageLock, operation),
      ),
    );

  const readRevision = async (id: Revision['id']): Promise<Revision> => {
    const metadata = parseRevisionMetadata(JSON.parse(await filesystem.readFile(metadataPath(id), 'utf8')));
    if (metadata.id !== id) {
      throw new TypeError(`Persisted revision directory does not match metadata: ${id}`);
    }
    return Object.freeze({
      id: revisionId(metadata.id),
      parents: Object.freeze(metadata.parents.map((parent) => revisionId(parent))),
      tree: await readTree(filesystem, treeDirectory(id)),
      provenance: Object.freeze({ ...metadata.provenance }),
      summary: Object.freeze({ ...metadata.summary }),
    });
  };

  const hasValidRevisionMarker = async (id: Revision['id'], path: string): Promise<boolean> => {
    try {
      return parseRevisionMetadata(JSON.parse(await filesystem.readFile(path, 'utf8'))).id === id;
    } catch {
      return false;
    }
  };

  const recoverRevisionMarker = async (id: Revision['id']): Promise<void> => {
    const marker = metadataPath(id);
    const temporary = temporaryMetadataPath(id);
    if (!(await filesystem.exists(temporary)) || !(await filesystem.exists(marker))) {
      return;
    }
    if (await hasValidRevisionMarker(id, marker)) {
      await removeTree(filesystem, temporary);
      return;
    }
    if (!(await hasValidRevisionMarker(id, temporary))) {
      throw new TypeError(`Persisted revision metadata is invalid: ${id}`);
    }
    await removeTree(filesystem, marker);
    try {
      await filesystem.rename(temporary, marker);
    } catch (error) {
      if (!(await filesystem.exists(marker)) || !(await hasValidRevisionMarker(id, marker))) {
        throw error;
      }
      if (await filesystem.exists(temporary)) {
        await removeTree(filesystem, temporary);
      }
    }
  };

  const readRevisions = async (): Promise<RevisionPersistenceEntry[]> => {
    const revisions: RevisionPersistenceEntry[] = [];
    if (await filesystem.exists(nodesDirectory)) {
      const encodedIds = await filesystem.readdir(nodesDirectory);
      for (const encodedId of encodedIds.toSorted()) {
        const directory = joinRelativePath(nodesDirectory, encodedId);
        const persistedMetadataPath = joinRelativePath(directory, 'metadata.json');
        // A missing marker is an interrupted write, not a revision. Collection
        // rechecks under the writer lock so it cannot race a marker commit.
        // oxlint-disable-next-line no-await-in-loop -- each durable marker is checked before its tree is admitted.
        if (!(await filesystem.exists(persistedMetadataPath))) {
          // oxlint-disable-next-line no-await-in-loop -- collection must finish before this snapshot is validated.
          await withStorageLock(async () => {
            if (!(await filesystem.exists(persistedMetadataPath))) {
              await removeTree(filesystem, directory);
            }
          });
          continue;
        }
        let id: Revision['id'];
        try {
          id = revisionId(decodeURIComponent(encodedId));
        } catch {
          throw new TypeError(`Persisted revision directory name is invalid: ${encodedId}`);
        }
        // oxlint-disable-next-line no-await-in-loop -- every candidate marker is classified before the next node.
        if (await filesystem.exists(temporaryMetadataPath(id))) {
          // oxlint-disable-next-line no-await-in-loop -- a torn provider-level rename is repaired before its marker is admitted.
          await withStorageLock(async () => recoverRevisionMarker(id));
        }
        // oxlint-disable-next-line no-await-in-loop -- deterministic sequential hydration bounds peak tree memory.
        const revision = await readRevision(id);
        if (encodedId !== encodeURIComponent(revision.id)) {
          throw new TypeError(`Persisted revision directory name is invalid: ${encodedId}`);
        }
        revisions.push({ revision, persistence: browserReceipt });
      }
    }
    return revisions;
  };

  const readValidBranchRecord = async (
    path: string,
    canonicalPath: string,
  ): Promise<PersistedRevisionBranchHead | undefined> => {
    try {
      const persisted = parseBranchHead(JSON.parse(await filesystem.readFile(path, 'utf8')));
      return branchPath(persisted.branch) === canonicalPath ? persisted : undefined;
    } catch {
      return undefined;
    }
  };

  const recoverBranchRecord = async (path: string): Promise<void> => {
    const temporary = temporaryBranchPath(path);
    const backup = backupBranchPath(path);
    const finalExists = await filesystem.exists(path);
    if (finalExists && (await readValidBranchRecord(path, path)) !== undefined) {
      if (await filesystem.exists(temporary)) {
        await removeTree(filesystem, temporary);
      }
      if (await filesystem.exists(backup)) {
        await removeTree(filesystem, backup);
      }
      return;
    }
    const backupExists = await filesystem.exists(backup);
    if (backupExists && (await readValidBranchRecord(backup, path)) === undefined) {
      throw new TypeError(`Persisted revision branch backup is invalid: ${path}`);
    }
    if (finalExists) {
      await removeTree(filesystem, path);
    }
    if (backupExists) {
      await filesystem.rename(backup, path);
    }
    if (await filesystem.exists(temporary)) {
      await removeTree(filesystem, temporary);
    }
  };

  const canonicalBranchFilename = (file: string): string => {
    const canonical = file.endsWith('.json.backup')
      ? file.slice(0, -'.backup'.length)
      : file.endsWith('.json.tmp')
        ? file.slice(0, -'.tmp'.length)
        : file;
    if (!canonical.endsWith('.json')) {
      throw new TypeError(`Persisted revision branch filename is invalid: ${file}`);
    }
    return canonical;
  };

  const readBranchHeads = async (): Promise<PersistedRevisionBranchHead[]> => {
    const branchHeads: PersistedRevisionBranchHead[] = [];
    if (!(await filesystem.exists(branchesDirectory))) {
      return branchHeads;
    }
    const files = await filesystem.readdir(branchesDirectory);
    const canonicalFiles = [...new Set(files.map((file) => canonicalBranchFilename(file)))].toSorted();
    await withStorageLock(async () => {
      for (const file of canonicalFiles) {
        const path = joinRelativePath(branchesDirectory, file);
        // oxlint-disable-next-line no-await-in-loop -- one ref is recovered before its committed record is read.
        await recoverBranchRecord(path);
        // A lone temporary file belonged to an unborn ref and was discarded.
        // oxlint-disable-next-line no-await-in-loop -- recovered refs may legitimately have no committed record.
        if (!(await filesystem.exists(path))) {
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- branch files are small and hydrate deterministically.
        const content = await filesystem.readFile(path, 'utf8');
        const branchHead = parseBranchHead(JSON.parse(content));
        if (file !== `${encodeURIComponent(branchHead.branch)}.json`) {
          throw new TypeError(`Persisted revision branch filename is invalid: ${file}`);
        }
        branchHeads.push(branchHead);
      }
    });
    return branchHeads;
  };

  const snapshotIncoherence = (
    revisions: readonly RevisionPersistenceEntry[],
    branchHeads: readonly PersistedRevisionBranchHead[],
  ): string | undefined => {
    const ids = new Set(revisions.map(({ revision }) => revision.id));
    for (const { revision } of revisions) {
      const missingParent = revision.parents.find((parent) => !ids.has(parent));
      if (missingParent !== undefined) {
        return `Persisted revision parent does not exist: ${missingParent}`;
      }
    }
    const missingHead = branchHeads.find(({ head }) => !ids.has(head));
    return missingHead === undefined
      ? undefined
      : `Persisted branch points to an unknown revision: ${missingHead.head}`;
  };

  const load = async (): Promise<RevisionPersistenceSnapshot> => {
    let incoherence = 'Persisted revision snapshot is incoherent.';
    for (let attempt = 0; attempt < snapshotAttemptLimit; attempt++) {
      // Heads are sampled before the append-only node set: a newly observed
      // head must therefore be present in this or a retry's node snapshot.
      // oxlint-disable-next-line no-await-in-loop -- incoherent concurrent snapshots are retried as a complete unit.
      const branchHeads = await readBranchHeads();
      // oxlint-disable-next-line no-await-in-loop -- branch heads intentionally precede append-only nodes.
      const revisions = await readRevisions();
      incoherence = snapshotIncoherence(revisions, branchHeads) ?? '';
      if (incoherence === '') {
        return { revisions: Object.freeze(revisions), branchHeads: Object.freeze(branchHeads) };
      }
    }
    throw new Error(incoherence);
  };

  const storeRevision = async (revision: Revision): Promise<RevisionPersistenceReceipt> =>
    withStorageLock(async () => {
      const marker = metadataPath(revision.id);
      await recoverRevisionMarker(revision.id);
      if (await filesystem.exists(marker)) {
        const existing = await readRevision(revision.id);
        if (!sameRevision(existing, revision)) {
          throw new Error(`Revision identity already maps to different content: ${revision.id}`);
        }
        return browserReceipt;
      }
      const directory = nodeDirectory(revision.id);
      if (await filesystem.exists(directory)) {
        await removeTree(filesystem, directory);
      }
      for (const entry of revision.tree.entries()) {
        // oxlint-disable-next-line no-await-in-loop -- metadata must not commit until every tree byte is durable.
        await filesystem.writeFile(joinRelativePath(treeDirectory(revision.id), entry.path), entry.content);
      }
      const temporaryMarker = temporaryMetadataPath(revision.id);
      await filesystem.writeFile(temporaryMarker, JSON.stringify(metadataFor(revision)));
      try {
        await filesystem.rename(temporaryMarker, marker);
      } catch (error) {
        if (!(await filesystem.exists(marker))) {
          throw error;
        }
        let committed: Revision;
        try {
          committed = await readRevision(revision.id);
        } catch {
          throw error;
        }
        if (!sameRevision(committed, revision)) {
          throw error;
        }
        if (await filesystem.exists(temporaryMarker)) {
          await removeTree(filesystem, temporaryMarker);
        }
      }
      return browserReceipt;
    });

  const readBranchHead = async (branch: RevisionBranchName): Promise<Revision['id'] | undefined> => {
    const path = branchPath(branch);
    if (!(await filesystem.exists(path))) {
      return undefined;
    }
    const persisted = parseBranchHead(JSON.parse(await filesystem.readFile(path, 'utf8')));
    if (persisted.branch !== branch) {
      throw new TypeError(`Persisted revision branch does not match its path: ${branch}`);
    }
    return persisted.head;
  };

  const replaceBranchRecord = async (path: string, content: string): Promise<void> => {
    const temporary = temporaryBranchPath(path);
    const backup = backupBranchPath(path);
    const expected = parseBranchHead(JSON.parse(content));
    await filesystem.writeFile(temporary, content);
    if (await filesystem.exists(path)) {
      await filesystem.rename(path, backup);
    }
    try {
      await filesystem.rename(temporary, path);
    } catch (error) {
      const committed = await readValidBranchRecord(path, path);
      if (committed?.branch === expected.branch && committed.head === expected.head) {
        if (await filesystem.exists(backup)) {
          try {
            await removeTree(filesystem, backup);
          } catch {
            // A later locked operation recovers this harmless residue.
          }
        }
        return;
      }
      try {
        await recoverBranchRecord(path);
      } catch {
        // Keep every artifact in place for the next locked recovery attempt.
      }
      throw error;
    }
    const committed = await readValidBranchRecord(path, path);
    if (committed?.branch !== expected.branch || committed.head !== expected.head) {
      await recoverBranchRecord(path);
      throw new Error(`Persisted revision branch replacement is invalid: ${expected.branch}`);
    }
    if (await filesystem.exists(backup)) {
      try {
        await removeTree(filesystem, backup);
      } catch {
        // The new final ref is committed; cleanup is retried on the next locked operation.
      }
    }
  };

  const updateBranchHead = async (input: UpdateBranchHeadInput): Promise<BranchHeadUpdateResult> =>
    withStorageLock(async () => {
      const path = branchPath(input.branch);
      await recoverBranchRecord(path);
      if (!(await filesystem.exists(metadataPath(input.head)))) {
        throw new Error(`Cannot publish unknown persisted revision: ${input.head}`);
      }
      const actualHead = await readBranchHead(input.branch);
      if (actualHead !== input.expectedHead) {
        return {
          status: 'conflicted',
          conflict: {
            type: 'stale-head',
            branch: input.branch,
            expectedHead: input.expectedHead,
            actualHead,
            proposedHead: input.head,
          },
        };
      }
      await replaceBranchRecord(
        path,
        JSON.stringify({ version: 1, branch: input.branch, head: input.head } satisfies PersistedBranchHead),
      );
      return { status: 'updated', branch: input.branch, previousHead: actualHead, head: input.head };
    });

  return Object.freeze({ load, storeRevision, updateBranchHead });
};
