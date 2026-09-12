/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
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

import type { ImmutableRevisionTree, RevisionId } from '@taucad/filesystem/revisions';
import type { RevisionProvenance, RevisionSummary } from '#revision-authority.js';
import type { ObjectFormat } from '#object-hash.js';

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

/** Input for creating the repository, its generated ignore file and its engine config. @public */
export type InitRevisionStoreInput = Readonly<{
  /** Identity stamped on every revision this port writes. */
  author: Readonly<{ name: string; email: string }>;
  /** Extra generated ignore lines beyond the derived-content set. */
  additionalIgnores?: readonly string[];
}>;

/** Input for recording one revision. @public */
export type WriteRevisionInput = Readonly<{
  parents: readonly RevisionId[];
  /**
   * The exact tree to record.
   *
   * Required: a merge is computed by the caller, with `mergeRevisionTrees` from
   * `@taucad/filesystem/revisions`, and the terms of an unresolved one arrive
   * here as {@link WriteRevisionInput.conflict} — which is what keeps a conflict
   * a value in the graph without either engine having to agree on a merge
   * algorithm (I-CONF, EQ14).
   */
  tree: ImmutableRevisionTree;
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

/** Generic transport request; the remote may be a name, URL or repository path. @public */
export type RevisionTransportInput = Readonly<{
  remote: string;
  refspecs: readonly string[];
}>;

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
  readRef(name: string): Promise<RevisionId | undefined>;
  updateRef(input: UpdateRevisionRefInput): Promise<UpdateRevisionRefResult>;
  /** The branch the live tree tracks, or `undefined` in a store that has none yet. */
  readHead(): Promise<RevisionHead | undefined>;
  /** Point the live tree's head at one branch, born or not. */
  setHead(branch: string): Promise<void>;
  listRefs(prefix?: string): Promise<readonly RevisionRef[]>;
  log(input?: RevisionLogInput): Promise<readonly RevisionLogEntry[]>;
  diff(input: RevisionDiffInput): Promise<readonly RevisionDiffEntry[]>;
  fetch(input: RevisionTransportInput): Promise<void>;
  push(input: RevisionTransportInput): Promise<void>;
  /** Rendered Jujutsu change id of one revision. */
  changeId?(id: RevisionId): Promise<string | undefined>;
  /** Conflicted term trees and labels, or `undefined` when the revision is resolved. */
  conflicts?(id: RevisionId): Promise<RevisionConflict | undefined>;
  /** Every place this project's files are, live checkout first. */
  listCheckouts?(): Promise<readonly Checkout[]>;
  /** Add one linked checkout on its own branch. */
  addCheckout?(input: AddCheckoutInput): Promise<Checkout>;
  /** Remove one linked checkout. Removing the live checkout is refused. */
  removeCheckout?(id: string): Promise<void>;
}>;

/** Stable failure categories every adapter shares. @public */
export type RevisionPortErrorCode =
  /** The requested branch already has a checkout, or the id names no checkout. */
  | 'CHECKOUT_CONFLICT'
  | 'ENGINE_FAILED'
  | 'ENGINE_UNAVAILABLE'
  | 'INVALID_REPOSITORY'
  | 'INVALID_TRANSPORT'
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
