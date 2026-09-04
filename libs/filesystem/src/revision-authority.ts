import { ResourceQueue } from '#resource-queue.js';
import { ImmutableRevisionTree, revisionId } from '#revision-tree.js';
import type { RevisionId } from '#revision-tree.js';
import type {
  RevisionPersistencePort,
  RevisionPersistenceReceipt,
  RevisionPersistenceSnapshot,
} from '#revision-persistence.js';

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

/** Dependencies for one durable revision authority. @public */
export type RevisionAuthorityOptions = Readonly<{
  persistence: RevisionPersistencePort;
  resourceQueue?: ResourceQueue;
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

const freezeRevision = (input: CreateRevisionInput): Revision => {
  const id = revisionId(input.id);
  const parents = input.parents.map(revisionId);
  if (new Set(parents).size !== parents.length) {
    throw new TypeError('A revision cannot name the same parent more than once.');
  }
  if (!(input.tree instanceof ImmutableRevisionTree)) {
    throw new TypeError('Revision tree must be an ImmutableRevisionTree.');
  }
  if (!Number.isSafeInteger(input.provenance.createdAt) || input.provenance.createdAt < 0) {
    throw new TypeError('Revision provenance createdAt must be a non-negative safe integer.');
  }
  if (input.provenance.actorId.length === 0 || input.summary.generated.length === 0) {
    throw new TypeError('Revision provenance actorId and generated summary are required.');
  }
  return Object.freeze({
    id,
    parents: Object.freeze(parents),
    tree: input.tree,
    provenance: Object.freeze({ ...input.provenance }),
    summary: Object.freeze({ ...input.summary }),
  });
};

const freezePersistenceReceipt = (receipt: RevisionPersistenceReceipt): RevisionPersistenceReceipt => {
  if (receipt.type === 'browser') {
    return Object.freeze({ type: 'browser' });
  }
  const expectedLength = receipt.objectFormat === 'sha1' ? 40 : 64;
  if (receipt.commitId.length !== expectedLength || !/^[0-9a-f]+$/u.test(receipt.commitId)) {
    throw new TypeError('Native Git revision persistence receipt is invalid.');
  }
  return Object.freeze({ ...receipt });
};

type HydratedRevisionState = Readonly<{
  revisions: Map<RevisionId, Revision>;
  branchHeads: Map<RevisionBranchName, RevisionId>;
  persistenceReceipts: Map<RevisionId, RevisionPersistenceReceipt>;
}>;

/**
 * Single-owner revision graph and branch-ref authority used by the C2 substrate.
 * Branch publication linearizes through the filesystem `ResourceQueue`; callers
 * never perform a read-then-write sequence outside this authority.
 *
 * @public
 */
export class RevisionAuthority {
  readonly #revisions = new Map<RevisionId, Revision>();
  readonly #branchHeads = new Map<RevisionBranchName, RevisionId>();
  readonly #persistenceReceipts = new Map<RevisionId, RevisionPersistenceReceipt>();
  readonly #persistence: RevisionPersistencePort;
  readonly #resourceQueue: ResourceQueue;
  #initialized = false;
  #readyPromise: Promise<void> | undefined;

  public constructor(options: RevisionAuthorityOptions) {
    this.#persistence = options.persistence;
    this.#resourceQueue = options.resourceQueue ?? new ResourceQueue();
  }

  /**
   * Rehydration is lazy: it starts on the first `ready` access (or first
   * operation), so constructing an authority — e.g. on a route remount —
   * touches no storage until the revision graph is actually used.
   */
  public get ready(): Promise<void> {
    this.#readyPromise ??= this.#initialize();
    return this.#readyPromise;
  }

  /** Insert a revision after validating that every parent exists. */
  public async createRevision(input: CreateRevisionInput): Promise<Revision> {
    await this.ready;
    const id = revisionId(input.id);
    return this.#resourceQueue.queueFor(`revision:${id}`, async () => {
      if (this.#revisions.has(id)) {
        throw new Error(`Revision already exists: ${id}`);
      }
      const revision = freezeRevision(input);
      for (const parent of revision.parents) {
        if (!this.#revisions.has(parent)) {
          throw new Error(`Revision parent does not exist: ${parent}`);
        }
      }
      const receipt = freezePersistenceReceipt(await this.#persistence.storeRevision(revision));
      this.#revisions.set(revision.id, revision);
      this.#persistenceReceipts.set(revision.id, receipt);
      return revision;
    });
  }

  /** Read one immutable revision. */
  public getRevision(id: RevisionId): Revision | undefined {
    this.#assertReady();
    return this.#revisions.get(id);
  }

  /** Read the durable storage evidence attached to one revision. */
  public getRevisionPersistence(id: RevisionId): RevisionPersistenceReceipt | undefined {
    this.#assertReady();
    return this.#persistenceReceipts.get(id);
  }

  /** Read the current branch head, returning `undefined` for an unborn branch. */
  public getBranchHead(branch: RevisionBranchName): RevisionId | undefined {
    this.#assertReady();
    return this.#branchHeads.get(branch);
  }

  /** Every published branch head, in insertion order. */
  public listBranchHeads(): ReadonlyMap<RevisionBranchName, RevisionId> {
    this.#assertReady();
    return new Map(this.#branchHeads);
  }

  /**
   * Publish one branch head iff its authoritative current value equals
   * `expectedHead`. Contending publishers are serialized by branch key and only
   * one can win from the same expected value.
   */
  public async updateBranchHead(input: UpdateBranchHeadInput): Promise<BranchHeadUpdateResult> {
    await this.ready;
    if (!this.#revisions.has(input.head)) {
      throw new Error(`Cannot publish unknown revision: ${input.head}`);
    }
    return this.#resourceQueue.queueFor(`revision-head:${input.branch}`, async () => {
      const result = await this.#persistence.updateBranchHead(input);
      if (result.status === 'updated') {
        this.#branchHeads.set(input.branch, result.head);
      } else if (result.conflict.actualHead === undefined) {
        this.#branchHeads.delete(input.branch);
      } else {
        if (!this.#revisions.has(result.conflict.actualHead)) {
          await this.#refreshRevision(result.conflict.actualHead);
        }
        this.#branchHeads.set(input.branch, result.conflict.actualHead);
      }
      return result;
    });
  }

  async #initialize(): Promise<void> {
    try {
      await this.#rehydrate();
    } catch (error) {
      this.#readyPromise = undefined;
      throw error;
    }
  }

  async #rehydrate(): Promise<void> {
    const state = this.#buildHydratedState(await this.#persistence.load());
    this.#revisions.clear();
    this.#persistenceReceipts.clear();
    this.#branchHeads.clear();
    for (const [id, revision] of state.revisions) {
      this.#revisions.set(id, revision);
    }
    for (const [id, receipt] of state.persistenceReceipts) {
      this.#persistenceReceipts.set(id, receipt);
    }
    for (const [branch, head] of state.branchHeads) {
      this.#branchHeads.set(branch, head);
    }
    this.#initialized = true;
  }

  #buildHydratedState(snapshot: RevisionPersistenceSnapshot): HydratedRevisionState {
    const pending = new Map<RevisionId, { revision: Revision; persistence: RevisionPersistenceReceipt }>();
    for (const entry of snapshot.revisions) {
      const revision = freezeRevision(entry.revision);
      if (pending.has(revision.id)) {
        throw new Error(`Persisted revision appears more than once: ${revision.id}`);
      }
      pending.set(revision.id, {
        revision,
        persistence: freezePersistenceReceipt(entry.persistence),
      });
    }
    const knownIds = new Set(pending.keys());
    for (const { revision } of pending.values()) {
      for (const parent of revision.parents) {
        if (!knownIds.has(parent)) {
          throw new Error(`Persisted revision parent does not exist: ${parent}`);
        }
      }
    }
    const revisions = new Map<RevisionId, Revision>();
    const persistenceReceipts = new Map<RevisionId, RevisionPersistenceReceipt>();
    while (pending.size > 0) {
      let progressed = false;
      for (const [id, entry] of pending) {
        if (!entry.revision.parents.every((parent) => revisions.has(parent))) {
          continue;
        }
        revisions.set(id, entry.revision);
        persistenceReceipts.set(id, entry.persistence);
        pending.delete(id);
        progressed = true;
      }
      if (!progressed) {
        throw new Error('Persisted revision graph contains a parent cycle.');
      }
    }
    const branchHeads = new Map<RevisionBranchName, RevisionId>();
    for (const persisted of snapshot.branchHeads) {
      const branch = revisionBranchName(persisted.branch);
      const head = revisionId(persisted.head);
      if (branchHeads.has(branch)) {
        throw new Error(`Persisted revision branch appears more than once: ${branch}`);
      }
      if (!revisions.has(head)) {
        throw new Error(`Persisted branch points to an unknown revision: ${head}`);
      }
      branchHeads.set(branch, head);
    }
    return { revisions, persistenceReceipts, branchHeads };
  }

  async #refreshRevision(id: RevisionId): Promise<void> {
    const state = this.#buildHydratedState(await this.#persistence.load());
    if (!state.revisions.has(id)) {
      throw new Error(`Persisted branch points to an unknown revision: ${id}`);
    }
    for (const [revisionIdValue, revision] of state.revisions) {
      if (!this.#revisions.has(revisionIdValue)) {
        this.#revisions.set(revisionIdValue, revision);
        this.#persistenceReceipts.set(revisionIdValue, state.persistenceReceipts.get(revisionIdValue)!);
      }
    }
  }

  #assertReady(): void {
    if (!this.#initialized) {
      throw new Error('RevisionAuthority is not ready. Await authority.ready before reading it.');
    }
  }
}
