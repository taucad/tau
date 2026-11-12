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
   * The live checkout — the project directory — whichever checkout the
   * workbench has selected; a branch on any other one is *Linked* (D96).
   */
  liveCheckoutId?: string | undefined;
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
   * What the restore child is doing (S19). Nothing here asks a person: a
   * restore acts at once and *Undo restore* takes it back (I11). The plan's
   * file sets stay with the host behind `planId`.
   */
  restore: Readonly<{
    busy: boolean;
    revisionNumber: number | undefined;
    /**
     * Whether *Undo restore* has something to undo: this checkout's head is the
     * restore row this root minted on the selected line (W0's undo target).
     * Absent reads as false — nothing is offered — so a projection fixture
     * written before it never offers an undo the machine would refuse.
     */
    undoable?: boolean;
    /**
     * Whether *Undo* has an operation of this device's to reverse on the
     * selected line (D15), as the operation log last answered. Absent reads as
     * false, like `undoable`.
     */
    canUndo?: boolean;
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
    operation: BranchOperation | undefined;
    branch: string | undefined;
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
  /**
   * Files the selected checkout still holds as large-object placeholders, and
   * how their transfer is going. Absent when every file is here.
   *
   * The root does not set it: the host that runs the fill merges what
   * {@link LargeObjectsReport} told it (the browser worker does).
   */
  largeObjects?: LargeObjectsFacet;
  /**
   * The checkout roots a tree apply is writing right now, sorted. Absent when
   * none is.
   *
   * A file view rooted at one of them holds its directory re-reads until the
   * root leaves this list: every file the apply swaps into place raises its own
   * events, and re-listing the directory after each one is work that grows with
   * the square of the file count. Like `largeObjects`, the root does not set
   * it: the host that brackets the apply (`onApplyingTree`) merges it.
   */
  applyingRoots?: readonly string[];
  /**
   * How far the selected checkout's tree has arrived (D10). Absent until the
   * host has published a reading, which reads as unknown, never as empty (I7).
   *
   * Like `largeObjects`, the root does not set it: the host that merges the
   * fill and the apply bracket settles it, monotonic within one tree.
   */
  readiness?: ProjectReadiness;
}>;

/**
 * The readiness vocabulary of D10: `connected → treeReady → entryReady →
 * materialized → filled`. The editor, tree and viewer open at `treeReady` and
 * `entryReady`; search, export, the LSP workspace and a revision cut wait for
 * `materialized`; a model render waits for `filled`.
 *
 * @public
 */
export type ProjectReadiness = 'connected' | 'treeReady' | 'entryReady' | 'materialized' | 'filled';

/**
 * The large objects one checkout is still waiting for.
 *
 * The files open as soon as the checkout is written; a file whose object has
 * not arrived holds its pointer until it does, and a reader that must see real
 * bytes — a model render — waits for `paths` to empty.
 *
 * @public
 */
export type LargeObjectsFacet = Readonly<{
  phase: 'fetching' | 'failed';
  /** Checkout-relative paths that still hold a pointer, sorted. */
  paths: readonly string[];
  /** Distinct objects (and their bytes) this fill wants, and how many have arrived. */
  objects: number;
  totalObjects: number;
  bytes: number;
  totalBytes: number;
  /** Why the transfer stopped, when `phase` is `failed`. */
  error?: string;
}>;

/** One checkout's fill, as a host is told about it. @public */
export type LargeObjectsReport = Readonly<{
  checkoutId: string;
  /** `undefined` once every placeholder is filled. */
  facet: LargeObjectsFacet | undefined;
  /** Start the transfer again after a failure; a no-op otherwise. */
  retry: () => void;
  /**
   * Fetch and write these checkout-relative paths' objects before the rest:
   * an opened path jumps the fill queue (D10). Paths that hold no placeholder
   * are ignored.
   */
  prioritize: (paths: readonly string[]) => void;
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
  /**
   * Whether the last fetch found this branch on the remote (D93); absent when
   * no fetch has said. A row with no checkout reads it as *Remote only*, and
   * every row as *Rename* refused, since the remote keeps the old name (D91).
   */
  onRemote?: boolean;
}>;

/** One undecided conflicted revision as the *Needs your decision* card renders it (D14). @public */
export type RevisionConflictFacet = Readonly<{
  /** The conflicted revision. */
  revisionId: string;
  /** Its conflict line, `conflicts/<into>/<device>`. */
  branch: string | undefined;
  /** The line the decision lands on — what *Needs your decision on …* names (HQ2). */
  into: string;
  /** Whether another device recorded it; only such a line is offered for removal (D24). */
  foreign: boolean;
  /** The two side labels the markers carry, once its child has read them. */
  labels: Readonly<{ ours: string; theirs: string }> | undefined;
  /**
   * One row per file, with the side chosen for it so far; `keys` names the
   * parameter keys both sides changed, for a parameter record.
   */
  paths: ReadonlyArray<
    Readonly<{ path: string; openable: boolean; keys?: readonly string[]; side: ResolutionSide | undefined }>
  >;
  /** A resolution effect is running. */
  busy: boolean;
  /** Every file has a side, so *Merge into `<current>`* can be asked for again. */
  ready: boolean;
}>;
