import { ResourceQueue } from '#resource-queue.js';
import type { ImmutableRevisionTree, RevisionId } from '#revision-tree.js';

declare const branchNameBrand: unique symbol;

/** Opaque branch-head name owned by one revision authority. @public */
export type RevisionBranchName = string & { readonly [branchNameBrand]: true };

/** Immutable authorship and run provenance for a revision. @public */
export type RevisionProvenance = Readonly<{
  source: 'user' | 'agent' | 'merge' | 'restore' | 'import';
  actorId: string;
  runId?: string;
  /** Milliseconds since the Unix epoch. */
  createdAt: number;
}>;

/** Generated summary plus an optional user-edited replacement. @public */
export type RevisionSummary = Readonly<{
  generated: string;
  edited?: string;
}>;

/** One immutable revision-graph node. @public */
export type Revision = Readonly<{
  id: RevisionId;
  parents: readonly RevisionId[];
  tree: ImmutableRevisionTree;
  provenance: RevisionProvenance;
  summary: RevisionSummary;
}>;

/** A stale expected-old branch publication. @public */
export type StaleBranchHeadConflict = Readonly<{
  type: 'stale-head';
  branch: RevisionBranchName;
  expectedHead: RevisionId | undefined;
  actualHead: RevisionId | undefined;
  proposedHead: RevisionId;
}>;

/** Result of authoritative expected-old branch-head publication. @public */
export type BranchHeadUpdateResult =
  | Readonly<{
      status: 'updated';
      branch: RevisionBranchName;
      previousHead: RevisionId | undefined;
      head: RevisionId;
    }>
  | Readonly<{ status: 'conflicted'; conflict: StaleBranchHeadConflict }>;

/** Input for inserting one immutable revision. @public */
export type CreateRevisionInput = Readonly<{
  id: RevisionId;
  parents: readonly RevisionId[];
  tree: ImmutableRevisionTree;
  provenance: RevisionProvenance;
  summary: RevisionSummary;
}>;

/** Input for conditionally publishing one branch head. @public */
export type UpdateBranchHeadInput = Readonly<{
  branch: RevisionBranchName;
  expectedHead: RevisionId | undefined;
  head: RevisionId;
}>;

/** Validate and brand an externally supplied branch name. @public */
export const revisionBranchName = (value: string): RevisionBranchName => {
  if (
    value.length === 0 ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value) ||
    value.includes('..')
  ) {
    throw new TypeError('Revision branch name is invalid.');
  }
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- runtime validation establishes the opaque brand.
  return value as RevisionBranchName;
};

const sameRevision = (left: RevisionId | undefined, right: RevisionId | undefined): boolean => left === right;

/**
 * Single-owner revision graph and branch-ref authority used by the C2 substrate.
 * Branch publication linearizes through the filesystem `ResourceQueue`; callers
 * never perform a read-then-write sequence outside this authority.
 *
 * Persistence adapters may replace the maps later, but must preserve this exact
 * expected-old result contract at their authoritative storage boundary.
 *
 * @public
 */
export class RevisionAuthority {
  readonly #revisions = new Map<RevisionId, Revision>();
  readonly #branchHeads = new Map<RevisionBranchName, RevisionId>();
  readonly #resourceQueue: ResourceQueue;

  public constructor(options?: { resourceQueue?: ResourceQueue }) {
    this.#resourceQueue = options?.resourceQueue ?? new ResourceQueue();
  }

  /** Insert a revision after validating that every parent exists. */
  public createRevision(input: CreateRevisionInput): Revision {
    if (this.#revisions.has(input.id)) {
      throw new Error(`Revision already exists: ${input.id}`);
    }
    for (const parent of input.parents) {
      if (!this.#revisions.has(parent)) {
        throw new Error(`Revision parent does not exist: ${parent}`);
      }
    }
    if (new Set(input.parents).size !== input.parents.length) {
      throw new TypeError('A revision cannot name the same parent more than once.');
    }
    if (!Number.isSafeInteger(input.provenance.createdAt) || input.provenance.createdAt < 0) {
      throw new TypeError('Revision provenance createdAt must be a non-negative safe integer.');
    }
    if (input.provenance.actorId.length === 0 || input.summary.generated.length === 0) {
      throw new TypeError('Revision provenance actorId and generated summary are required.');
    }

    const revision = Object.freeze({
      id: input.id,
      parents: Object.freeze([...input.parents]),
      tree: input.tree,
      provenance: Object.freeze({ ...input.provenance }),
      summary: Object.freeze({ ...input.summary }),
    });
    this.#revisions.set(revision.id, revision);
    return revision;
  }

  /** Read one immutable revision. */
  public getRevision(id: RevisionId): Revision | undefined {
    return this.#revisions.get(id);
  }

  /** Read the current branch head, returning `undefined` for an unborn branch. */
  public getBranchHead(branch: RevisionBranchName): RevisionId | undefined {
    return this.#branchHeads.get(branch);
  }

  /**
   * Publish one branch head iff its authoritative current value equals
   * `expectedHead`. Contending publishers are serialized by branch key and only
   * one can win from the same expected value.
   */
  public async updateBranchHead(input: UpdateBranchHeadInput): Promise<BranchHeadUpdateResult> {
    if (!this.#revisions.has(input.head)) {
      throw new Error(`Cannot publish unknown revision: ${input.head}`);
    }
    return this.#resourceQueue.queueFor(`revision-head:${input.branch}`, async () => {
      const actualHead = this.getBranchHead(input.branch);
      if (!sameRevision(actualHead, input.expectedHead)) {
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
      this.#branchHeads.set(input.branch, input.head);
      return { status: 'updated', branch: input.branch, previousHead: actualHead, head: input.head };
    });
  }
}
