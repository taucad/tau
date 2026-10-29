import type {
  GitRemoteCredential,
  RevisionDiffEntry,
  RevisionDivergence,
  RevisionLogRequest,
  RevisionRow,
  RevisionStatusProjection,
  RevisionTag,
} from '@taucad/revisions';
import type { RevisionFileComparison } from '@taucad/revisions/algorithms';
import type { EditorConflictInput, EditorConflictOutcome } from '@taucad/revisions/revision-effects';
import type {
  RevisionToast,
  WorkerRevisionCommand,
  WorkerRevisionEvent,
  BranchCreated,
} from '#machines/file-manager.worker.revisions.js';

/** One project's live connection to its revision root. @public */
export type RevisionClient = Readonly<{
  status: () => RevisionStatusProjection | undefined;
  /**
   * Tell this project's port how to reach a third-party remote (S34, W12).
   *
   * A port frame, not a tree command: the port makes the requests, and this is
   * the routing rule plus — once *Connect* has taken consent — the remote's own
   * credential. Memory only, on both sides (I8).
   */
  remoteCredential: (credential: GitRemoteCredential) => void;
  /** Send a credential for one explicit push; the host discards it when the operation settles. */
  pushGithub: (credential: GitRemoteCredential) => Promise<void>;
  /**
   * Say whether this project is the page's focused one (RV-W5b F12): only the
   * focused project holds the `revision` long poll. A port frame, kept across
   * reconnects. Absent on a host-served client, whose polls have no socket cap.
   */
  focus?: (focused: boolean) => void;
  subscribe: (listener: () => void) => () => void;
  /** Every settled revision signal this project's root published. */
  subscribeEvents: (listener: (event: WorkerRevisionEvent) => void) => () => void;
  /** Restore's toasts — the only thing in the tree that needs a person to see it. */
  subscribeToasts: (listener: (toast: RevisionToast) => void) => () => void;
  /** One branch's history, newest first, each row carrying its `Rev N` (I3). */
  log: (request?: RevisionLogRequest) => Promise<readonly RevisionRow[]>;
  /** How far `head` and `base` have gone apart, counted by the port without listing either history. */
  divergence: (head: string, base: string) => Promise<RevisionDivergence>;
  /** Which paths one revision changed, against `from` or its own first parent. */
  diff: (
    revisionId: string,
    from?: string,
    options?: Readonly<{ against?: 'checkout' }>,
  ) => Promise<readonly RevisionDiffEntry[]>;
  /** Name one revision, or re-point an existing name (S31). */
  tag: (input: Readonly<{ name: string; revisionId: string; note?: string }>) => Promise<RevisionTag | undefined>;
  /** Remove one name. The revision it named stays. */
  deleteTag: (name: string) => Promise<void>;
  /**
   * One file's text before and after a revision, for *Compare* (S38).
   *
   * `against: 'checkout'` is S38's second half: the same round trip, with the
   * working copy on the right instead of another revision — "how does what I
   * have now differ from this revision".
   */
  compare: (
    revisionId: string,
    path: string,
    options?: Readonly<{ from?: string; against?: 'checkout' }>,
  ) => Promise<RevisionFileComparison>;
  send: (command: WorkerRevisionCommand) => void;
  /**
   * Pull the remote now for another device's run on `chatId` that awaits pulls (XD3), and answer whether this device
   * can pull the chat at all (round 27): `false` where the placement's pull is refused `CHAT_NOT_SHARED`. A root that
   * answers nothing (an older host) is taken to pull, as the agent host takes a placement with no pull verb.
   */
  pullRemote: (chatId: string) => Promise<boolean>;
  /**
   * Record what is on disk and wait for the answer (C16, contract §6).
   *
   * The correlated form of `send({ command: 'saveRevision' })`: it resolves
   * once the root has settled the cut and its scheduler has quiesced, bounded
   * by `syncQuiesceMilliseconds` on the far side. The `hidden` unload registrant
   * awaits it so `pagehide`'s keepalive POST carries *this* close revision
   * rather than the previous push's pack.
   */
  saveRevision: (trigger?: 'save' | 'hidden' | 'close') => Promise<void>;
  /**
   * Make a branch and wait for the checkout it was made on (P4).
   *
   * The correlated form of `send({ command: 'createBranch' })`. Rejects with
   * the refusal's `code` attached, because the caller that places a chat on the
   * new branch has to refuse the turn rather than silently run it elsewhere.
   */
  createBranch: (name: string, from?: string) => Promise<BranchCreated>;
  /**
   * Record an editor's overlapping edit as a conflicted revision (charter D14).
   *
   * Resolves once it is in the graph, so the editor can let go of its text: the
   * *Needs your decision* card is then the one surface, and it survives a
   * reload. `unchanged` means the file is back on the bytes the edit was made
   * from, and the editor saves as usual.
   */
  recordEditorConflict: (input: EditorConflictInput) => Promise<EditorConflictOutcome>;
  /**
   * Connect, or do nothing when the connection is already open.
   *
   * Frames sent before this wait for it: connecting starts the root, and its
   * first fetch must see the credential the route mints before opening (D36).
   */
  open: () => void;
  /**
   * Give the root back.
   *
   * The worker stops the tree when the last port for a project closes, so this
   * is the page's half of that contract when the owning project scope ends or
   * its worker is replaced. Lifecycle close preparation uses the correlated
   * {@link RevisionClient.quiesce}; pagehide does not close because release
   * itself takes a fresh cut. The client survives its own close — the next
   * `open`, command or mount connects again.
   */
  close: () => void;
  /**
   * Give the root back and wait for it to settle (W19, D31).
   *
   * The correlated form of {@link RevisionClient.close}: the worker's
   * `release()` takes the close cut and awaits W13's `awaitSyncSettled` before
   * it answers, so `project-session.closing` can flush before it stops the
   * project's children. Resolves anyway when the worker cannot answer — the
   * durable queue is the guarantee after the bound (D28).
   */
  quiesce: () => Promise<void>;
}>;
