/**
 * `RevisionPort` — the one substrate seam every Tau host implements.
 *
 * A revision is an immutable, content-addressed snapshot of one workspace tree
 * with its parents and provenance, and its id **is** its Git commit id, so the
 * same tree and the same headers name the same revision on every host. `log`
 * and `diff` are deliberately tree-free: they answer questions about the graph
 * without materializing any tree, so a revision pane never pays for one.
 *
 * A conflict is a value in this graph, not a failed operation. An adapter that
 * advertises `conflictsAsValues` records a conflicted revision and reports it;
 * a conflicted revision never leaves the host that created it.
 */

import type { ImmutableRevisionTree, RevisionId } from '#algorithms/index.js';
import type { RevisionActor, RevisionProvenance, RevisionSummary } from '#revision-authority.js';
import type { ObjectFormat } from '#object-hash.js';
import type { Remote } from '#remotes.js';

/** Which implementation is behind one port. @public */
export type RevisionEngine = 'isomorphic-git' | 'native-git' | 'remote';

/** Runtime facts an adapter reports about itself and its repository. @public */
export type RevisionEngineDescriptor = Readonly<{
  engine: RevisionEngine;
  /** Engine version string, or `'unknown'` when the engine has none. */
  version: string;
  /** Recorded repository object hash. Never assumed by a caller (I-HASH). */
  objectFormat: ObjectFormat;
  /** Every revision carries a `change-id` from creation. */
  changeIds: true;
  /** Whether a conflicted revision can be recorded rather than refused. */
  conflictsAsValues: boolean;
  /** Whether `fetch` and `push` address a real remote. */
  transports: boolean;
  /** Whether the engine can fan in more than two parents in one revision. */
  nWayMerge: boolean;
  /** Whether `listCheckouts`, `addCheckout` and `removeCheckout` are implemented. */
  checkouts: boolean;
  /**
   * Whether this store records a tracked large object as a git-LFS pointer.
   *
   * A caller that computes a tree id without writing it has to hash what the
   * store will record, pointers included (I5) — so the cut asks rather than
   * assumes. True on both legs since W11b: the decision is host-neutral
   * (`lfs.ts`) and only the transport behind it differs.
   */
  largeObjects: boolean;
}>;

/** Durable storage evidence for one revision. `objectFormat` travels with it. @public */
export type RevisionReceipt = Readonly<{
  engine: RevisionEngine;
  /** Lowercase hexadecimal commit id. Equal to the revision id. */
  commitId: string;
  /** Rendered Jujutsu change id. */
  changeId: string;
  objectFormat: ObjectFormat;
  conflicted: boolean;
}>;

/** One revision's headers and provenance, without its tree. @public */
export type RevisionRecord = Readonly<{
  id: RevisionId;
  parents: readonly RevisionId[];
  /**
   * Object id of the tree this revision carries — the tree, not the commit.
   * Two turns whose bytes are identical share it and differ in their ids, which
   * is what makes "did this turn change anything" answerable without reading a
   * single blob.
   */
  treeId: string;
  provenance: RevisionProvenance;
  summary: RevisionSummary;
  receipt: RevisionReceipt;
}>;

/** One graph node as `log` reports it. Tree-free by contract. @public */
export type RevisionLogEntry = Readonly<{
  id: RevisionId;
  changeId: string;
  parents: readonly RevisionId[];
  summary: RevisionSummary;
  provenance: RevisionProvenance;
  conflicted: boolean;
}>;

/** How one path changed between two revisions. @public */
export type RevisionDiffKind = 'added' | 'modified' | 'deleted';

/** One changed path as `diff` reports it. Tree-free by contract: paths, never content. @public */
export type RevisionDiffEntry = Readonly<{
  path: string;
  kind: RevisionDiffKind;
}>;

/** One named ref and the revision it points at. @public */
export type RevisionRef = Readonly<{
  name: string;
  head: RevisionId;
}>;

/**
 * Where the live tree is: the branch it tracks, and that branch's head.
 *
 * Git's HEAD in spirit — a *symbolic* ref, so a turn recorded onto the branch
 * moves the head with it and nothing has to be written twice.
 *
 * @public
 */
export type RevisionHead = Readonly<{
  /** The branch the live tree is on. */
  branch: string;
  /** That branch's head, or `undefined` while the branch is still unborn. */
  head: RevisionId | undefined;
}>;

/** Input for creating a revision store and, for ordinary projects, its generated setup files. @public */
export type InitRevisionStoreInput = Readonly<{
  /** Identity stamped on every revision this port writes. */
  author: Readonly<{ name: string; email: string }>;
  /** Extra generated ignore lines beyond the derived-content set. */
  additionalIgnores?: readonly string[];
  /** `false` initializes only control-plane storage for a reviewed remote bootstrap. */
  createSetupFiles?: boolean;
}>;

/** Input for recording one revision. @public */
export type WriteRevisionInput = Readonly<{
  parents: readonly RevisionId[];
  /**
   * The tree to record, exactly as given unless
   * {@link WriteRevisionInput.largeObjects} asks for the clean step.
   *
   * Required: a merge is computed by the caller, with `mergeRevisionTrees` from
   * `@taucad/revisions/algorithms`, and the terms of an unresolved one arrive
   * here as {@link WriteRevisionInput.conflict} — which is what keeps a conflict
   * a value in the graph without either engine having to agree on a merge
   * algorithm (I-CONF, EQ14).
   */
  tree: ImmutableRevisionTree;
  /**
   * Whether the store's large-object clean step runs on `tree` before it is
   * recorded.
   *
   * Default `true`: a project tree is recorded as its `.gitattributes` says,
   * which is `git add` honouring a clean filter. `false` records the tree byte
   * for byte, as `git add --no-filters` would, and is what a record ref needs: a
   * closed tree can never carry a `.gitattributes`, so a pointer written into
   * one is a pointer no attribute names, that no stock clone can smudge and no
   * plain remote can serve.
   */
  largeObjects?: boolean;
  provenance: RevisionProvenance;
  summary: RevisionSummary;
  /**
   * Conflicted term trees in Jujutsu's add/remove order with their labels.
   * Only an adapter advertising `conflictsAsValues` accepts this, and only when
   * the caller — not the engine — computed the conflict.
   */
  conflict?: Readonly<{ trees: readonly string[]; labels: readonly string[] }>;
}>;

/** Input for one expected-old ref publication. @public */
export type UpdateRevisionRefInput = Readonly<{
  /**
   * A branch name (`main`), or any other ref in full (`refs/tau/chats/c1`).
   *
   * The record set the design pushes lives outside `refs/heads`, and a port that
   * could only name branches could not address half of what its own `push`
   * moves — so a name beginning `refs/` is taken literally and every other name
   * is a branch (W17).
   */
  name: string;
  /** `undefined` means "this ref must be unborn". */
  expectedHead: RevisionId | undefined;
  /**
   * The revision this ref must name. Omitted, the ref is **deleted** under the
   * same expected-old check — a branch is a name for a head, so removing the
   * name is the same operation as moving it, and the revisions it reached stay
   * reachable as objects.
   */
  head?: RevisionId;
}>;

/** Outcome of one expected-old ref publication. @public */
export type UpdateRevisionRefResult =
  | Readonly<{
      status: 'updated';
      name: string;
      previousHead: RevisionId | undefined;
      /** `undefined` when the publication deleted the ref. */
      head: RevisionId | undefined;
    }>
  | Readonly<{
      status: 'conflicted';
      name: string;
      expectedHead: RevisionId | undefined;
      actualHead: RevisionId | undefined;
      /** `undefined` when the refused publication was a deletion. */
      proposedHead: RevisionId | undefined;
    }>;

/** Input for a bounded graph walk. @public */
export type RevisionLogInput = Readonly<{
  /** Heads to walk back from. Every recorded revision when absent. */
  heads?: readonly RevisionId[];
  limit?: number;
}>;

/** Input for a tree-free path diff. @public */
export type RevisionDiffInput = Readonly<{
  /** `undefined` compares against the empty tree. */
  from: RevisionId | undefined;
  to: RevisionId;
}>;

/**
 * One fully-qualified ref on a remote, as the server advertises it.
 *
 * Full names (`refs/heads/main`), not branch names: the record set the design
 * pushes lives outside `refs/heads` (`refs/tau/chats/*`), so a transport that
 * spoke in branch names could not name half of what it moves.
 *
 * @public
 */
export type RemoteRef = Readonly<{ name: string; head: RevisionId }>;

/** What one leg fetches, and where it puts it. @public */
export type RevisionFetchInput = Readonly<{
  /** Remote name from the store's own remotes list. */
  remote: string;
  /**
   * Fully-qualified refs to fetch. Every advertised ref when absent.
   *
   * Each lands at `refs/remotes/<remote>/…` — the remote-tracking half of the
   * store — so a fetch never moves a local branch and the merge that follows is
   * the ordinary one (A22). A fetched tag also updates its same-named local tag
   * when that name is unborn or still matches the previous remote-tracking
   * value; an unpushed local tag move is preserved for leased publication.
   */
  refs?: readonly string[];
  /**
   * Abandon this fetch when it fires (S24, F16's 10 s).
   *
   * The open pull is the one operation with a deadline of its own, and a bound
   * the *caller* holds is the only one that can end the socket rather than just
   * the caller's wait. Honoured by the engines that can: the browser leg passes
   * it to every request the fetch makes; a leg that spawns `git` leaves the
   * process to its own transport timeouts (W13 review 2 P36).
   */
  signal?: AbortSignal;
}>;

/** The remote-tracking refs one fetch wrote. @public */
export type RevisionFetchResult = Readonly<{
  /** `refs/remotes/<remote>/<name>` entries, as this store now holds them. */
  refs: readonly RemoteRef[];
}>;

/** Nonsecret identity recorded with a Git remote. @public */
export type SetRevisionRemoteInput = Readonly<{
  name: string;
  url: string;
  provider?: 'github';
  /** Stable decimal GitHub repository id. */
  repositoryId?: string;
  /** Fetch and display this relationship, but never offer it a ref. */
  fetchOnly?: boolean;
}>;

/** One ref a push offers the remote. @public */
export type RevisionPushRef = Readonly<{
  /** Fully-qualified local ref, e.g. `refs/heads/main` or `refs/tau/chats/c1`. */
  name: string;
  /** The receiving ref, when it differs from {@link RevisionPushRef.name}. */
  remoteName?: string;
  /**
   * The lease: what this host last observed the *remote* ref to be (D14's
   * `push(expected)`, A32, S24).
   *
   * Three states, and the difference between the last two matters:
   *
   * - **Absent** — no lease. The remote's own fast-forward rule decides, which
   *   is what a first push and the record set want.
   * - **A revision** — refuse unless the remote ref is still exactly there. A
   *   rewritten history (restore, amend) is allowed *because* nothing moved
   *   underneath it; a ref that moved is refused with `leaseLost` and left
   *   alone, which is the conflict signal A22 works from.
   * - **`undefined`** — refuse unless the ref does not exist yet.
   */
  expected?: RevisionId | undefined;
}>;

/**
 * What one push asks of a remote.
 *
 * The caller splits the two sets (A39) and this is where the difference is
 * expressed: the history set goes `atomic`, so `main` and its tags land
 * together or not at all, and the record set does not, so a chat ref the server
 * refuses never blocks a branch.
 *
 * @public
 */
export type RevisionPushInput = Readonly<{
  remote: string;
  refs: readonly RevisionPushRef[];
  /** All-or-nothing across the listed refs. Default `false`. */
  atomic?: boolean;
}>;

/** How one ref of a push ended. @public */
export type RevisionPushRefStatus = 'updated' | 'upToDate' | 'rejected';

/** One ref's outcome, which is the unit a push reports in. @public */
export type RevisionPushRefResult = Readonly<{
  /** The local ref that was offered. */
  name: string;
  status: RevisionPushRefStatus;
  /** What the remote holds for this ref now, when the push moved it. */
  head: RevisionId | undefined;
  /**
   * Why it was refused, when it was. Never a credential.
   *
   * The server's own words where there are any — git's `--porcelain` text on
   * the native leg, the remote's per-ref error on the browser leg — and
   * `leaseLost` where the client refused the push itself, because a lease it
   * held no longer matched the advertisement and nothing was offered.
   */
  reason?: string;
}>;

/** Every offered ref's outcome, in the order they were offered. @public */
export type RevisionPushResult = Readonly<{ refs: readonly RevisionPushRefResult[] }>;

/** The conflicted term trees and labels recorded on one revision. @public */
export type RevisionConflict = Readonly<{
  trees: readonly string[];
  labels: readonly string[];
}>;

/**
 * One place a project's files are: the live tree, or a linked copy on a branch
 * of its own. The id is stable across turns, and is what a chat and the
 * workbench attach to (S5).
 *
 * @public
 */
export type Checkout = Readonly<{
  /** Stable within one project. Derived from the branch, so one branch is one checkout. */
  id: string;
  projectId: string;
  /** Where the files are: a host path on a disk host, a route on the browser leg. */
  root: string;
  kind: 'live' | 'linked';
  /** The branch this checkout tracks, or `undefined` when its head is detached. */
  branch: string | undefined;
  /** The revision its head names, or `undefined` on an unborn branch. */
  baseRevisionId: RevisionId | undefined;
}>;

/**
 * One checkout as a project's registry holds it: the port's record, plus the
 * two facts only a host knows.
 *
 * The port's `baseRevisionId` is the branch's head, and the registry calls it
 * `headRevisionId`, so the rename happens here once instead of at every
 * consumer. `leaseRunIds` comes from `.tau/runs` — the port knows nothing about
 * leases — and `removable` from the host's clock and merged-branch policy.
 *
 * @public
 */
export type CheckoutRecord = Readonly<Omit<Checkout, 'baseRevisionId'>> &
  Readonly<{
    /** The revision this checkout's branch names, or `undefined` while unborn. */
    headRevisionId?: string;
    /** Tree object id of that head — the left-hand side of the I5 gate. */
    headTreeId?: string;
    /** Run ids of the leases currently holding this checkout. */
    leaseRunIds: readonly string[];
    /**
     * Chat ids of those leases, deduplicated.
     *
     * A record, not a routing memory: the chips that say who is working where
     * come from `.tau/runs/*.json` like every other lease fact, so a host that
     * rehydrates from records alone rebuilds them (I3; W7 review R9).
     */
    leaseChatIds: readonly string[];
    /** Set when the host's policy would offer this checkout for removal (A25). */
    removable?: boolean;
    /**
     * Set when this branch's head is a conflicted revision (A22, W10).
     *
     * The head *is* the conflicted revision — a conflicted merge mints it on the
     * branch a person merged from — so there is no second id to carry. One
     * commit read per checkout answers it, and it is record-derived like every
     * other field here, so *Needs resolution* survives a reload (I3).
     */
    conflicted?: boolean;
  }>;

/**
 * One named version: an annotated tag on a revision (S31, A21).
 *
 * Annotated rather than lightweight, because a name has an author, a time and a
 * reason of its own — and because an annotated tag is an object every git
 * client and host already understands, so `refs/tags/*` transports with the
 * history set (A39) and a clone shows the names without Tau.
 *
 * @public
 */
export type RevisionTag = Readonly<{
  /** Unique per project. `refs/tags/<name>`. */
  name: string;
  revisionId: RevisionId;
  /** Why this version has a name. */
  note: string | undefined;
  /** Who named it (S37). `undefined` on a tag this store did not write. */
  actor: RevisionActor | undefined;
  /** Milliseconds since the Unix epoch. */
  createdAt: number;
}>;

/** Input for naming one revision. @public */
export type CreateRevisionTagInput = Readonly<{
  name: string;
  revisionId: RevisionId;
  note?: string;
  actor?: RevisionActor;
  /** Milliseconds since the Unix epoch. Defaults to the store's clock. */
  createdAt?: number;
}>;

/** Input for adding one linked checkout. @public */
export type AddCheckoutInput = Readonly<{
  /** The branch the new checkout tracks. One checkout per branch. */
  branch: string;
  /**
   * Where an unborn branch starts. Ignored when the branch already exists: the
   * checkout is then placed at that branch's head, which is what makes two
   * hosts' answers to the same input the same.
   */
  from?: RevisionId;
}>;

/**
 * The substrate capability. Every host constructs one; the port, not the
 * engine, is the seam callers program against.
 *
 * @public
 */
export type RevisionPort = Readonly<{
  describe(): Promise<RevisionEngineDescriptor>;
  init(input: InitRevisionStoreInput): Promise<void>;
  readRevision(id: RevisionId): Promise<RevisionRecord | undefined>;
  readTree(id: RevisionId): Promise<ImmutableRevisionTree | undefined>;
  writeRevision(input: WriteRevisionInput): Promise<RevisionReceipt>;
  /** A branch by name, or any other ref spelled in full. */
  readRef(name: string): Promise<RevisionId | undefined>;
  updateRef(input: UpdateRevisionRefInput): Promise<UpdateRevisionRefResult>;
  /** The branch the live tree tracks, or `undefined` in a store that has none yet. */
  readHead(): Promise<RevisionHead | undefined>;
  /** Point the live tree's head at one branch, born or not. */
  setHead(branch: string): Promise<void>;
  /**
   * Named refs, answered in the vocabulary the prefix was asked in.
   *
   * No prefix, or a bare one, lists branch names as branch names; a prefix
   * beginning `refs/` lists that namespace and reports full names, which is how
   * the record set (`refs/tau/chats/*`) is enumerated (W17).
   */
  listRefs(prefix?: string): Promise<readonly RevisionRef[]>;
  /**
   * The reachable graph in first-parent-first topological order, newest first.
   *
   * A revision appears only after every revision that names it as a parent, and
   * among those eligible the one reached by following first parents comes
   * first — so a merge is followed by its first-parent side, then the side it
   * merged, then their common history. Every engine answers identically; `limit`
   * cuts that order from the front and never reorders it (review 4 R12).
   *
   * Unbounded, that holds unconditionally. A *bounded* walk reads only what the
   * order needs and assumes non-decreasing committer time from parent to child
   * to know when it has read enough: under an inverted clock a bounded result
   * may place a parent before a child (review 4 R39).
   */
  log(input?: RevisionLogInput): Promise<readonly RevisionLogEntry[]>;
  diff(input: RevisionDiffInput): Promise<readonly RevisionDiffEntry[]>;
  /** Every ref the remote advertises, without fetching an object. */
  listRemoteRefs(remote: string): Promise<readonly RemoteRef[]>;
  /** Bring the remote's refs into `refs/remotes/<remote>/…`; never moves a branch. */
  fetch(input: RevisionFetchInput): Promise<RevisionFetchResult>;
  /** Offer refs to the remote and report each one's outcome. */
  push(input: RevisionPushInput): Promise<RevisionPushResult>;
  /** Git's own remotes list for this store. */
  listRemotes(): Promise<readonly Remote[]>;
  /** Create or re-point one remote by name. */
  setRemote(input: SetRevisionRemoteInput): Promise<void>;
  /** Remove one remote. History and remote-tracking refs stay. */
  removeRemote(name: string): Promise<void>;
  /**
   * Name one revision, replacing an existing name of the same spelling.
   *
   * Re-pointing is the same operation as creating: a name is a name for a head,
   * exactly as a branch is, and *Rename* in the pane is a create plus a delete.
   */
  tag(input: CreateRevisionTagInput): Promise<RevisionTag>;
  /** Every named version in this store, by name. */
  listTags(): Promise<readonly RevisionTag[]>;
  /** Remove one name. The revision it named stays, and stays reachable by id. */
  deleteTag(name: string): Promise<void>;
  /** Rendered Jujutsu change id of one revision. */
  changeId?(id: RevisionId): Promise<string | undefined>;
  /**
   * Conflicted term trees and labels, or `undefined` when the revision is resolved.
   *
   * Required since W10: a conflict is a value in this graph, and a host that
   * could record one without being able to read it back would leave a person
   * with a branch that says *Needs resolution* and nothing to resolve.
   */
  conflicts(id: RevisionId): Promise<RevisionConflict | undefined>;
  /** Every place this project's files are, live checkout first. */
  listCheckouts?(): Promise<readonly Checkout[]>;
  /** Add one linked checkout on its own branch. */
  addCheckout?(input: AddCheckoutInput): Promise<Checkout>;
  /** Remove one linked checkout. Removing the live checkout is refused. */
  removeCheckout?(id: string): Promise<void>;
}>;

/**
 * What a remote said about room when it refused a push for storage (D16, C13).
 *
 * The numbers the Tau API's LFS batch refusal actually carries. They were
 * parsed into `LfsQuotaRefusal` and then dropped one hop later, so the Sync
 * region's storage meter had nothing to render but the file list. Declared here
 * because it is a *contract* shape: `remote.machine` and `sync.machine` may
 * import types from this module and from nowhere else (I20).
 *
 * @public
 */
export type RemoteStorageRefusal = Readonly<{
  /** How much room is left under the plan, when the remote said. */
  remainingBytes?: number;
  /** How much more this push needed than would fit, when the remote said. */
  shortfallBytes?: number;
}>;

/** Stable failure categories every adapter shares. @public */
export type RevisionPortErrorCode =
  /** A branch was asked of a checkout that has no revision and nothing to record. */
  | 'BRANCH_NEEDS_REVISION'
  /** The requested branch already has a checkout, or the id names no checkout. */
  | 'CHECKOUT_CONFLICT'
  | 'ENGINE_FAILED'
  | 'ENGINE_UNAVAILABLE'
  | 'INVALID_REPOSITORY'
  | 'INVALID_TRANSPORT'
  /**
   * The push would carry large objects and the remote cannot hold them (P20).
   *
   * Raised by both legs, before any object or ref is offered, so a third-party
   * remote never receives pointers whose bytes have nowhere to go. The message
   * names the files.
   */
  | 'LFS_REMOTE_UNSUPPORTED'
  /** A large object this revision references is not in this store, and cannot be fetched. */
  | 'MISSING_LARGE_OBJECT'
  /*
   * The remote's own answers (N1).
   *
   * Every one of these means the remote *was* reached and said no, which is why
   * none of them may ever be spelled "could not be reached": that sentence is
   * `ENGINE_FAILED`'s alone, and `ENGINE_FAILED` is reserved for a transport
   * failure carrying no HTTP status at all. One classifier produces the whole
   * set — `remoteTransportError` in `#remotes.js` — and both legs call it.
   */
  /** Any HTTP 403 that is not an entitlement refusal. */
  | 'REMOTE_FORBIDDEN'
  /** HTTP 403 whose body `code` is `GIT_SYNC_NOT_ENTITLED`: the plan does not include syncing. */
  | 'REMOTE_NOT_ENTITLED'
  /** HTTP 404: the remote has no repository at this address for this account. */
  | 'REMOTE_NOT_FOUND'
  /** HTTP 413 with no LFS file list; a batch refusal keeps raising `LfsQuotaError`. */
  | 'REMOTE_QUOTA_EXCEEDED'
  /**
   * The remote's credential has to be granted again.
   *
   * Spelled identically to `RemoteReauthorizationCode` in `#remotes.js`, which
   * is the same literal on a plain `Error` for the hosts that raise it before a
   * request is made. `remote.machine` routes both to `reconnectRequired`.
   */
  | 'REMOTE_REAUTHORIZATION_REQUIRED'
  /** A reviewed remote ref changed before it could be adopted locally. */
  | 'REMOTE_REF_CONFLICT'
  /**
   * The remote refused the refs themselves, in its own words and with no status.
   *
   * Tau Cloud's `pre-receive` hook refuses a deletion or a rewind on *every* ref
   * family, `refs/tau/*` included (contract §4), and it answers over git's
   * `remote:` sideband rather than with an HTTP status — so without this the one
   * refusal a fetch-and-replay actually clears read as `ENGINE_FAILED`, the code
   * reserved for a remote that was never reached.
   */
  | 'REMOTE_REJECTED'
  /** HTTP 401: this device's credential is not one the remote accepts. */
  | 'REMOTE_UNAUTHORIZED'
  /** HTTP 429 or 5xx: the remote is there and cannot answer yet. Retryable. */
  | 'REMOTE_UNAVAILABLE'
  | 'UNKNOWN_REVISION'
  | 'UNSUPPORTED_OPERATION';

/** Typed revision-port failure. @public */
export class RevisionPortError extends Error {
  public readonly code: RevisionPortErrorCode;

  /**
   * Create a stable port failure.
   *
   * @param code - Machine-readable failure category.
   * @param message - Safe diagnostic without remote credentials or command arguments.
   * @param options - Optional cause.
   */
  public constructor(code: RevisionPortErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RevisionPortError';
    this.code = code;
  }
}
