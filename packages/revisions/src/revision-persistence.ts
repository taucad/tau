/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
/**
 * The durable boundary a {@link RevisionAuthority} writes through, and the one
 * implementation of it: {@link RevisionPort}.
 *
 * There used to be two stores. The recorder wrote content-addressed Git objects
 * under `.tau/revisions` (where identity came from) while the authority kept a
 * second, uncompressed copy of the same tree per revision under
 * `.tau/workspaces/revisions/nodes/<id>/tree` (where the pane read it) — a
 * whole-tree copy of the user's project on disk per turn, deduplicated on one
 * side and not the other. One store, and the index is a projection of it.
 */

import { revisionBranchName } from '#revision-authority.js';
import type {
  BranchHeadUpdateResult,
  Revision,
  RevisionBranchName,
  UpdateBranchHeadInput,
} from '#revision-authority.js';
import { RevisionPortError } from '#revision-port.js';
import type { RevisionPort, RevisionReceipt } from '#revision-port.js';

/**
 * Durable storage evidence for one revision: the port's own receipt, so the
 * commit id, the change id and the recorded object format all travel with it.
 *
 * @public
 */
export type RevisionPersistenceReceipt = RevisionReceipt;

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
  /** Remove one branch ref under the same expected-old check. */
  deleteBranchHead(input: Omit<UpdateBranchHeadInput, 'head'>): Promise<BranchHeadUpdateResult>;
}>;

/** Dependencies for persistence over one content-addressed store. @public */
export type PortRevisionPersistenceOptions = Readonly<{
  port: RevisionPort;
}>;

/**
 * Adapt any {@link RevisionPort} to the authority's durable boundary.
 *
 * A ref in the store **is** a branch head, and a revision's id **is** its
 * commit id, so this is a projection rather than a second record: nothing is
 * copied, and a revision no ref reaches is not loaded — it is unreferenced
 * evidence in the object store, exactly as an unreachable Git object is.
 *
 * @param options - The store every revision id is minted by.
 * @returns Persistence the authority can be constructed over.
 * @public
 * @example <caption>An authority over the browser store</caption>
 * ```typescript
 * import { createMemoryProvider } from '@taucad/filesystem/backend';
 * import { createBrowserRevisionPort, createPortRevisionPersistence, RevisionAuthority } from '@taucad/revisions';
 *
 * const port = createBrowserRevisionPort({ filesystem: await createMemoryProvider() });
 * const authority = new RevisionAuthority({ persistence: createPortRevisionPersistence({ port }) });
 * ```
 */
export const createPortRevisionPersistence = (options: PortRevisionPersistenceOptions): RevisionPersistencePort => {
  const { port } = options;

  const publish = async (
    input: UpdateBranchHeadInput | Omit<UpdateBranchHeadInput, 'head'>,
  ): Promise<BranchHeadUpdateResult> => {
    const head = 'head' in input ? input.head : undefined;
    const result = await port.updateRef({
      name: input.branch,
      expectedHead: input.expectedHead,
      ...(head === undefined ? {} : { head }),
    });
    return result.status === 'updated'
      ? Object.freeze({
          status: 'updated',
          branch: input.branch,
          previousHead: result.previousHead,
          // A deletion leaves no head; the authority drops the branch on it.
          head: result.head,
        })
      : Object.freeze({
          status: 'conflicted',
          conflict: Object.freeze({
            type: 'stale-head',
            branch: input.branch,
            expectedHead: result.expectedHead,
            actualHead: result.actualHead,
            proposedHead: result.proposedHead,
          }),
        });
  };

  const load = async (): Promise<RevisionPersistenceSnapshot> => {
    const { objectFormat, engine } = await port.describe();
    const references = await port.listRefs();
    const branchHeads = references.map(
      (reference): PersistedRevisionBranchHead => ({
        branch: revisionBranchName(reference.name),
        head: reference.head,
      }),
    );
    const entries = await port.log({ heads: branchHeads.map((branchHead) => branchHead.head) });
    const revisions: RevisionPersistenceEntry[] = [];
    for (const entry of entries) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one tree at a time bounds peak memory over a long history.
      const tree = await port.readTree(entry.id);
      if (tree === undefined) {
        throw new RevisionPortError('UNKNOWN_REVISION', `The store holds no tree for revision ${entry.id}.`);
      }
      revisions.push({
        revision: Object.freeze({
          id: entry.id,
          parents: entry.parents,
          tree,
          provenance: entry.provenance,
          summary: entry.summary,
        }),
        persistence: Object.freeze({
          engine,
          commitId: entry.id,
          changeId: entry.changeId,
          objectFormat,
          conflicted: entry.conflicted,
        }),
      });
    }
    return { revisions: Object.freeze(revisions), branchHeads: Object.freeze(branchHeads) };
  };

  /**
   * Record one revision, or confirm the store already holds it.
   *
   * The recorder mints every id through {@link RevisionPort.writeRevision}, so
   * the common case is a read that hits. A revision created directly on the
   * authority is written here and must name itself: a store that answered with
   * a different id would mean this revision's identity is not its content.
   *
   * @param revision - The revision to make durable.
   * @returns The store's receipt for it.
   */
  const storeRevision = async (revision: Revision): Promise<RevisionPersistenceReceipt> => {
    const existing = await port.readRevision(revision.id);
    if (existing !== undefined) {
      return existing.receipt;
    }
    const receipt = await port.writeRevision({
      parents: revision.parents,
      tree: revision.tree,
      provenance: revision.provenance,
      summary: revision.summary,
    });
    if (receipt.commitId !== revision.id) {
      throw new RevisionPortError(
        'ENGINE_FAILED',
        `The store recorded this revision as ${receipt.commitId}, not ${revision.id}.`,
      );
    }
    return receipt;
  };

  return Object.freeze({
    load,
    storeRevision,
    updateBranchHead: async (input: UpdateBranchHeadInput): Promise<BranchHeadUpdateResult> => publish(input),
    deleteBranchHead: async (input: Omit<UpdateBranchHeadInput, 'head'>): Promise<BranchHeadUpdateResult> =>
      publish(input),
  });
};
