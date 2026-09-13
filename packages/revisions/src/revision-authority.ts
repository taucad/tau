/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
/**
 * The single-owner revision graph and its branch refs.
 *
 * It lives here rather than in `@taucad/filesystem` because an authority is the
 * *writer* of a revision store, and the frozen S6 boundary is that the Tau API,
 * Electron main, renderers, runtime children, service worker and solver leaves
 * cannot initialize one through their allowed imports (RC8 work 10). The
 * filesystem library keeps what an authority is built *out of* — trees, ids and
 * the resource queue — and this package keeps the authority itself.
 */

import { ImmutableRevisionTree, ResourceQueue, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type {
  RevisionPersistencePort,
  RevisionPersistenceReceipt,
  RevisionPersistenceSnapshot,
} from '#revision-persistence.js';

declare const branchNameBrand: unique symbol;

/** Opaque branch-head name owned by one revision authority. @public */
export type RevisionBranchName = string & { readonly [branchNameBrand]: true };

/**
 * What asked for a revision, as the checkpoint policy names it.
 *
 * The same union `checkoutMachine` accepts as `CheckoutCutTrigger`; it is
 * declared here because it is provenance vocabulary — a fact recorded *about a
 * revision* — and `checkout.machine` imports nothing but XState, so it cannot
 * import it back. `checkout.machine.test-d.ts` asserts the two are identical,
 * which is what keeps the one union from becoming two.
 *
 * @public
 */
export type RevisionTrigger = 'turn' | 'save' | 'idle' | 'hidden' | 'close' | 'merge' | 'restore' | 'switch';

/**
 * A signed-in (or deliberately anonymous) person (S37, A26).
 *
 * `anonymous` is a property of the *recorded* identity, never of the setting
 * that produced it: the anonymity choice is applied when the revision is
 * written, and switching it later rewrites nothing.
 *
 * @public
 */
export type RevisionUserActor = Readonly<{
  kind: 'user';
  /** Stable id. `anon:<per-workspace hash>` when the person chose anonymity. */
  id: string;
  name?: string;
  /** Omitted for an anonymous actor: it is the identifying half. */
  email?: string;
  anonymous?: boolean;
}>;

/** The model that produced a revision, and the person it produced it for. @public */
export type RevisionAgentActor = Readonly<{
  kind: 'agent';
  /** The model id. */
  id: string;
  runId?: string;
  onBehalfOf?: RevisionUserActor;
}>;

/** Who one revision is by (S37). @public */
export type RevisionActor = RevisionUserActor | RevisionAgentActor;

/** Immutable authorship and run provenance for a revision. @public */
export type RevisionProvenance = Readonly<{
  source: 'user' | 'agent' | 'merge' | 'restore' | 'import';
  actorId: string;
  runId?: string;
  /**
   * Stable user-message id of the turn this revision recorded, when a turn did.
   *
   * The graph is the durable record (I3), so the link between a turn on screen
   * and the revision it minted is a fact *about the revision* rather than a
   * second store the client has to keep: a chat card is recovered from
   * `log(branch)` alone, on every host and after every reload. Absent for a
   * `save`, `idle`, `close`, `restore` or `merge` cut, which no turn owns.
   */
  turnId?: string;
  /**
   * Who this revision is by (S37).
   *
   * `actorId` stays the stable id every consumer already reads; this carries the
   * rest of the identity — the name and email stock `git log` shows, the model
   * behind an agent turn, and the person it ran for. Optional because a store
   * written before S37, and a caller that has no session to map, still records a
   * valid revision; the adapters fall back to `actorId` for the git author.
   */
  actor?: RevisionActor;
  /** What asked for this revision (S30). Absent in a store written before S30. */
  trigger?: RevisionTrigger;
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
  /** `undefined` when the refused publication was a branch deletion. */
  proposedHead: RevisionId | undefined;
}>;

/** Result of authoritative expected-old branch-head publication. @public */
export type BranchHeadUpdateResult =
  | Readonly<{
      status: 'updated';
      branch: RevisionBranchName;
      previousHead: RevisionId | undefined;
      /** `undefined` when the publication deleted the branch. */
      head: RevisionId | undefined;
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
  const expectedLength = receipt.objectFormat === 'sha1' ? 40 : 64;
  if (receipt.commitId.length !== expectedLength || !/^[0-9a-f]+$/u.test(receipt.commitId)) {
    throw new TypeError('Revision persistence receipt is invalid.');
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

  /**
   * Re-read the durable store into this authority.
   *
   * Hydration is otherwise once-per-instance, which is correct for the only
   * writer — but a *host* placement writes revisions into the same store from
   * another process, and the pane that reads it has no other way to learn of
   * them. Idempotent, and safe to call on an authority that never hydrated.
   *
   * @returns Nothing; the graph and the branch heads are replaced in place.
   */
  public async reload(): Promise<void> {
    this.#readyPromise = this.#initialize();
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
    return this.#publish(input.branch, async () => this.#persistence.updateBranchHead(input));
  }

  /**
   * Remove one branch ref iff its authoritative current value equals
   * `expectedHead`.
   *
   * A branch is a name for a head, so removing the name is the same operation
   * as moving it — under the same expected-old check, through the same
   * per-branch queue. The revisions it reached stay in the store and stay
   * reachable by id; only the name is gone.
   *
   * @param input - The branch and the head it must currently name.
   * @returns The publication, or the stale-head conflict that refused it.
   */
  public async deleteBranchHead(input: Omit<UpdateBranchHeadInput, 'head'>): Promise<BranchHeadUpdateResult> {
    await this.ready;
    return this.#publish(input.branch, async () => this.#persistence.deleteBranchHead(input));
  }

  async #publish(
    branch: RevisionBranchName,
    operation: () => Promise<BranchHeadUpdateResult>,
  ): Promise<BranchHeadUpdateResult> {
    return this.#resourceQueue.queueFor(`revision-head:${branch}`, async () => {
      const result = await operation();
      if (result.status === 'updated') {
        if (result.head === undefined) {
          this.#branchHeads.delete(branch);
        } else {
          this.#branchHeads.set(branch, result.head);
        }
      } else if (result.conflict.actualHead === undefined) {
        this.#branchHeads.delete(branch);
      } else {
        if (!this.#revisions.has(result.conflict.actualHead)) {
          await this.#refreshRevision(result.conflict.actualHead);
        }
        this.#branchHeads.set(branch, result.conflict.actualHead);
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
