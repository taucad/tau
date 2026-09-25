import type { BranchOperation } from '#branch.types.js';
import type { ResolutionSide } from '#resolution.types.js';
import type { PublishFacet } from '#publish.types.js';
import type { RemoteFacet } from '#remote.types.js';
import type { SyncFacet } from '#sync.types.js';

/**
 * The coalesced status one project publishes to its UI.
 *
 * `Rev N` is not here: it is derived from the graph at read time (I3). The sync
 * *progress* facet arrives with `sync.machine` in W13; `remote` is the
 * connection itself, which the Sync region renders on its own (S26, S35).
 *
 * @public
 */
export type RevisionStatusProjection = Readonly<{
  projectId: string;
  checkoutId: string | undefined;
  /**
   * Where that checkout's files are — the route every consumer re-roots at
   * when *Switch* moves the workbench (S27).
   *
   * The registry's own answer, not a rule a caller re-derives: the live
   * checkout is the project directory and a linked one is its own route, and
   * only the host that made them knows which is which.
   */
  checkoutRoot: string | undefined;
  /** The line that checkout is on (D3); never an absent branch standing for several states. */
  line: RevisionLine;
  /**
   * Whether the checkout registry has answered once. Before it has, a checkout
   * named here has no root yet; that is not the same as a checkout that is
   * gone (D41).
   */
  registrySettled: boolean;
  /** Whether any checkout has work that is not safely recorded. */
  projectDirty: boolean;
  dirty: boolean;
  minting: boolean;
  headRevisionId: string | undefined;
  follow: 'chat' | 'pinned';
  /** Checkouts that need a person: a failed cut or a head that lost its CAS. */
  attention: number;
  /**
   * What the restore child is doing, for the one surface that asks (S19).
   *
   * The plan's file sets stay with the host behind `planId`; these are the two
   * facts the confirmation renders — how many files the restore deletes, and
   * whether the checkout has diverged from its head — plus whether it is
   * waiting to be confirmed at all.
   */
  restore: Readonly<{
    asking: boolean;
    busy: boolean;
    removedPathCount: number;
    dirty: boolean;
    revisionNumber: number | undefined;
  }>;
  /** Which remote this project has, and what it costs (S26 *Sync*, S35). */
  remote: RemoteFacet;
  /** Where this project's publication is, for the Publish dialog (S32, W8). */
  publish: PublishFacet;
  /**
   * Whether this project is backed up, and how much is not (S26, S41).
   *
   * Settled values only (A38, P28): `Backed up`, `Backing up… n`,
   * `Not backed up · n`, `Needs resolution` — never a backoff tick and never a
   * per-write counter.
   */
  sync: SyncFacet;
  /**
   * Every branch this project has, for the pane's *Branches* region (S26).
   *
   * One row per branch, because one branch is one checkout (A2): the chats are
   * the ones whose last placed turn landed there, which is what "the chats
   * working on this branch" means to a reader. Ahead/behind is a graph read the
   * pane asks for separately when it needs it.
   */
  branches: readonly RevisionBranchFacet[];
  /** What the branch verbs are doing, for the one region that drives them. */
  branchVerb: Readonly<{
    busy: boolean;
    asking: boolean;
    operation: BranchOperation | undefined;
    branch: string | undefined;
    question: string | undefined;
  }>;
  /**
   * Every branch whose head is a conflicted revision (A22, S33).
   *
   * Existence is record-derived — the registry's `conflicted` flag, so a reload
   * still shows *Needs resolution* — while the per-file rows come from that
   * revision's own `resolution` child, which is the only thing that knows what
   * a person has chosen so far.
   */
  conflicts: readonly RevisionConflictFacet[];
}>;

/**
 * The line of history the selected checkout is on (D3).
 *
 * - `branch` — it tracks `name`, and `name` has at least one revision.
 * - `unborn` — it tracks `name`, and `name` has no revision yet: a project that
 *   has not been recorded. Its first cut creates the line.
 * - `unknown` — nothing names a line yet: the registry has not answered, or it
 *   answered with no branch for this checkout. A client view reads `unknown`
 *   until its projection arrives, too.
 *
 * There is no detached state: a restore mints on its line (D1), so a checkout
 * is always on a branch once its store exists.
 *
 * @public
 */
export type RevisionLine =
  | Readonly<{ kind: 'branch'; name: string }>
  | Readonly<{ kind: 'unborn'; name: string }>
  | Readonly<{ kind: 'unknown' }>;

/** One branch as the *Branches* region renders it. @public */
export type RevisionBranchFacet = Readonly<{
  name: string;
  /** The revision the branch names, or `undefined` while unborn. */
  head: string | undefined;
  /** The checkout that tracks it; `undefined` when no checkout does. */
  checkoutId: string | undefined;
  /**
   * Where that checkout's files are — `/projects/<id>` for the live tree, and
   * `/checkouts/<id>` for a linked one. It is what the workbench re-roots at
   * (S27) and what tells a host which routes a linked checkout needs mounted.
   */
  checkoutRoot: string | undefined;
  /** Chats whose turns are placed on this branch (the row's chips). */
  leaseChatIds: readonly string[];
}>;

/** One conflicted branch as the *Needs resolution* card renders it. @public */
export type RevisionConflictFacet = Readonly<{
  /** The conflicted revision, which is that branch's head. */
  revisionId: string;
  branch: string | undefined;
  /** The two side labels the markers carry, once its child has read them. */
  labels: Readonly<{ ours: string; theirs: string }> | undefined;
  /** One row per file, with the side chosen for it so far. */
  paths: ReadonlyArray<Readonly<{ path: string; openable: boolean; side: ResolutionSide | undefined }>>;
  /** A resolution effect is running. */
  busy: boolean;
  /** Every file has a side, so *Merge into `<current>`* can be asked for again. */
  ready: boolean;
}>;
