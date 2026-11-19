/**
 * The page's side of the worker revision port (architecture A38): the verbs the page sends one project's revision
 * root, and the frames the root answers with. Only types, so the page's client and the file-manager worker that
 * serves the port share one contract without either importing the other.
 */

import type {
  CheckoutCutsOutcome,
  EditorConflictInput,
  EditorConflictOutcome,
  RevisionConflictRead,
  TurnConflictedEvent,
  TurnFailedEvent,
  TurnFinalizedEvent,
} from '@taucad/revisions/revision-effects';
import type {
  BranchOperation,
  GitRemoteCredential,
  PublishDraft,
  ReadOutcome,
  RevisionCommitAuthor,
  RevisionDiffEntry,
  RevisionDivergence,
  RevisionGraph,
  RevisionRow,
  RevisionStatusProjection,
  RevisionTag,
  RevisionUserActor,
  TurnAttemptKey,
} from '@taucad/revisions';
import type { RevisionFileComparison } from '@taucad/revisions/algorithms';

/**
 * A command the page sends to one project's revision root.
 *
 * The verbs are the machine's own: there is no browser-only verb, because the
 * page is a client of the same tree every host runs. `close` is the exception —
 * it is the port's own lifecycle, not the tree's.
 *
 * @public
 */

/**
 * The page's telemetry consent as the port carries it. It mirrors `ReportingConsent` from the app's
 * telemetry library, which this library does not import (scripts/src/telemetry-release-partition.test.ts);
 * the app's binding in `#hooks/use-revision-status` passes its consent through, so the compiler keeps the two
 * in step.
 */
export type ReportingConsent = 'granted' | 'denied' | 'unknown';

export type WorkerRevisionCommand =
  | Readonly<{ command: 'restore'; revisionId: string }>
  /** *Undo restore*: restore the first parent of `revisionId`, or of the last restore (D2). */
  | Readonly<{ command: 'undo' }>
  /** *Undo*: reverse this device's newest operation on the selected line (D15). */
  | Readonly<{ command: 'undoOperation' }>
  /** The *Merged* toast's *Undo*: a new entry with `before`'s files, while the merge is still the head (I11). */
  | Readonly<{ command: 'undoMerge'; revisionId: string; before: string }>
  | Readonly<{ command: 'switch'; branch: string }>
  | Readonly<{ command: 'followChat'; chatId: string }>
  | Readonly<{ command: 'pinTo'; checkoutId: string }>
  /*
   * The *Branches* region's verbs (S26, A2/D10).
   *
   * Named `…Branch` for the same reason the Sync region's are named `…Remote`:
   * one flat namespace per project. Each one is `branch.machine`'s own event —
   * the region drives a machine, not a promise. None asks first (I11).
   */
  | Readonly<{ command: 'createBranch'; name: string; from?: string }>
  | Readonly<{ command: 'discardBranch'; branch: string; checkoutId?: string }>
  | Readonly<{ command: 'mergeBranch'; branch: string }>
  | Readonly<{ command: 'renameBranch'; branch: string; name: string }>
  /*
   * The Sync region's verbs (S26, S34).
   *
   * Named `…Remote` rather than the machine's own `authorized`/`cancel`: this
   * is one flat namespace per project and `cancel` already belongs to restore.
   * The page supplies the Tau Cloud URL because only the page knows which API
   * origin it is signed in to — the worker has no `window.ENV`.
   */
  | Readonly<{
      command: 'connectRemote';
      kind: 'none' | 'tau' | 'git';
      url?: string;
      provider?: 'github';
      repositoryId?: string;
      fetchOnly?: boolean;
    }>
  | Readonly<{ command: 'disconnectRemote' }>
  | Readonly<{ command: 'cancelRemote' }>
  /* The page re-minted the credential a `reconnectRequired` remote was refused
     with and sent its frame first; `remote.machine` re-validates (D3). */
  | Readonly<{ command: 'authorizeRemote' }>
  | Readonly<{ command: 'syncNow' }>
  /** The page's signed-in person changed (audit R6): read the remote afresh under the new session. */
  | Readonly<{ command: 'sessionChanged' }>
  /* The viewer's *Try again* after a large-object transfer failed; the files are already open. */
  | Readonly<{ command: 'retryLargeObjects' }>
  /* An opened file still holding its pointer: its object jumps the fill queue (D10). */
  | Readonly<{ command: 'prioritizeLargeObjects'; paths: readonly string[] }>
  /**
   * The paths one open file pane waits on while a tree write lands them (STO-25): the projection's `landedPaths`
   * names each once this tab's write has landed it. Replaces what the watcher asked before; no paths ends its watch.
   */
  | Readonly<{ command: 'watchLanding'; watcher: string; paths: readonly string[] }>
  /**
   * Pull the remote now (XD3, round 18): another device's run on one of this project's chats has been quiet here a
   * while, and only pulls show whether it stayed quiet there. A question since round 27: answered `pulled`, with
   * whether this device can pull the chat at all, as the placement session's own pull answers it.
   */
  | Readonly<{ command: 'pullRemote'; chatId?: string }>
  /** Separate, consent-gated candidate artifact route; never authored sync. */
  | Readonly<{ command: 'fetchGeoSpecCandidates' }>
  | Readonly<{ command: 'publishGeoSpecCandidate'; candidate: Uint8Array<ArrayBuffer> }>
  | Readonly<{ command: 'recordsChanged' }>
  /*
   * The Publish dialog's three verbs (S32, W8).
   *
   * Named `…Publish` on the same flat namespace: `confirm` and `cancel` already
   * belong to restore. `publishProject` opens the dialog on the project's own
   * names; `confirmPublish` carries the whole draft (the version's name, or an
   * auto-named one, and who can open the project's cloud link) in one gesture.
   */
  | Readonly<{
      command: 'publishProject';
      tag?: string;
      /** An older revision to publish (a History row's *Publish*); the branch head when absent. */
      revisionId?: string;
      /* The API origin Publish reaches, on the command rather than in a
       * credential frame: a frame carrying no credential *clears* the one a
       * third-party remote was connected with, and publishing must not sign
       * anybody out of GitHub (W8 review R4, W12's S34). */
      apiBaseUrl?: string;
    }>
  | Readonly<{ command: 'confirmPublish'; draft: PublishDraft }>
  | Readonly<{ command: 'cancelPublish' }>
  | Readonly<{ command: 'resetPublish' }>
  /*
   * The *Needs resolution* card's verbs (S33, W10).
   *
   * Each names the conflicted revision it is about, because a project can hold
   * more than one conflicted branch and every verb is addressed to that
   * revision's own `resolution` child. `resolveInEditor` asks for the marker
   * text (it arrives back as a `conflictText` notice) and `resolvedInEditor`
   * hands the resolved file back.
   */
  | Readonly<{ command: 'resolve'; revisionId: string; path: string; side: 'mine' | 'theirs' }>
  | Readonly<{ command: 'resolveInEditor'; revisionId: string; path: string }>
  | Readonly<{ command: 'resolvedInEditor'; revisionId: string; path: string; content: string }>
  | Readonly<{ command: 'finishResolution'; revisionId: string }>
  | Readonly<{ command: 'abandonResolution'; revisionId: string }>
  | Readonly<{ command: 'askChatToResolve'; revisionId: string }>
  /*
   * An editor's overlapping edit, recorded as a conflicted revision on the live
   * line's conflict line (D14, RV-W5b2 R2-1): the *Needs your decision* card is
   * then the one surface, and it survives a reload and travels. A question: the
   * editor waits for the record before it lets go of its text.
   */
  | (Readonly<{ command: 'recordEditorConflict' }> & EditorConflictInput)

  /* The three graph reads. The page never holds a port (A38), and `Rev N`,
   * "Current" and *Compare* are all derived from the graph at read time (I3),
   * so the reads ride the same port the verbs do. */
  /*
   * Named versions (S31) and `Mod+S` (S30).
   *
   * `saveRevision` is a cut with no turn: the page asks its checkout to record
   * what is on disk, and the I5 gate decides whether anything is minted.
   * `tag` is a port verb with no lifecycle of its own — a version is a ref,
   * not a state machine — so they ride the same correlated channel the
   * graph reads do rather than becoming machine events with nothing to hold.
   */
  | Readonly<{ command: 'saveRevision'; trigger?: 'save' | 'hidden' | 'close' }>
  /*
   * Who this document records as (S37, A26, EQ8).
   *
   * A resolved value, not a resolver: a function cannot cross a `MessagePort`,
   * and the decision the page owns is *which person* — the signed-in user, or
   * their per-workspace anonymous stand-in. Turning the model of an agent turn
   * into the actor is mechanical and stays here, beside the mint.
   */
  | Readonly<{
      command: 'setActor';
      actor: RevisionUserActor;
      /** The linked forge's no-reply identity for `actor` (D33), for the git author line alone (I3). */
      commitAuthor?: RevisionCommitAuthor;
    }>
  /*
   * Which device this document is (W13, W17).
   *
   * Sent by the page rather than read here, because the id lives in
   * `localStorage` and a worker cannot see it. It names no pushed record — chat
   * segments name a random record device per actor form (`.git/ops-devices.json`)
   * — but a worker that has not been told writes no chat refs at all, and the id
   * counts as this host's own for a segment written before record devices
   * existed (`apps/libs/ui-core/src/lib/device-id.ts` is the one source).
   */
  | Readonly<{ command: 'setDeviceId'; deviceId: string }>
  /*
   * The `pagehide` last word (A32, S41).
   *
   * Offers the receive-pack POST the `hidden` flush already built again, under
   * `keepalive`. Over 64 KiB the client refuses it and the scheduler records
   * *Not backed up* — which is the difference between a bounded failure and a
   * silent drop.
   */
  | Readonly<{ command: 'flushKeepalive' }>
  | Readonly<{ command: 'tag'; name: string; revisionId: string; note?: string; number?: number }>
  | Readonly<{ command: 'log'; branch?: string; limit?: number; from?: string }>
  /** Every branch's history in one walk, for History's lanes (D2). */
  | Readonly<{ command: 'graph'; branches?: readonly string[]; limit?: number }>
  | Readonly<{ command: 'divergence'; head: string; base: string }>
  | Readonly<{ command: 'diff'; revisionId: string; from?: string; against?: 'checkout' }>
  | Readonly<{ command: 'compare'; revisionId: string; path: string; from?: string; against?: 'checkout' }>
  /** Both sides of one conflicted revision as text, for the agent's `revisions` tool (rule 8). */
  | Readonly<{ command: 'readConflict'; revisionId: string }>
  /** One file with its large-object placeholder resolved, or `pending` (D9); the project directory when no checkout is named. */
  | Readonly<{
      command: 'readContent';
      checkoutId?: string;
      path: string;
      /** Milliseconds to wait for an object a running fill is fetching. */
      wait?: number;
    }>
  /** Make these paths physical files, their objects fetched first (D9). */
  | Readonly<{ command: 'materialize'; checkoutId?: string; paths: readonly string[] }>;

/**
 * One settled signal from the worker revision root.
 *
 * Turn outcomes use the same host-attested schema the Node host writes into a
 * chat's durable log. `chats.projected` is browser composition only: it names
 * the protected chat records a remote fetch finished writing, so page caches
 * can reread their filesystem authority without guessing from sync timing.
 *
 * @public
 */
export type WorkerRevisionEvent =
  | TurnConflictedEvent
  | TurnFailedEvent
  | TurnFinalizedEvent
  | Readonly<{ type: 'chats.projected'; projectId: string; chatIds: readonly string[] }>
  | Readonly<{ type: 'checkout.changed'; checkoutId: string; paths: readonly string[] }>;

/**
 * What a child of the tree asked the page to say.
 *
 * The two children with something to tell a person are `restore` and `branch`;
 * every other outcome rides the projection, which is why this union is small
 * and not one per machine.
 *
 * @public
 */
export type RevisionToast =
  /**
   * A *Restore* or *Undo restore* landed. `revisionId` names the revision whose
   * files came back; only a `restore` offers Undo (I11). `revisionNumber` is
   * `undefined` for a target that is not on the line (D5, A9).
   */
  | Readonly<{
      type: 'restored';
      mode: 'restore' | 'undoRestore' | 'undoMerge';
      revisionId: string;
      revisionNumber: number | undefined;
    }>
  /** *Undo* landed; the number is the revision it undid (D15). */
  | Readonly<{ type: 'undone'; revisionNumber: number | undefined }>
  /** `heldBy`: the run whose lease held the save; its edits land in that run's revision (TS-R17, V5 A6). */
  | Readonly<{ type: 'nothingToSave'; heldBy?: TurnAttemptKey }>
  | Readonly<{
      type: 'branch';
      operation: BranchOperation;
      branch: string;
      /** What a `create` made, for a caller correlating one (P4). */
      checkoutId?: string;
      checkoutRoot?: string;
      /** The branch a *Switch* left, which its Undo switches back to (I11). */
      from?: string;
      /** A *Switch* saved the unsaved work on `from` before it moved. */
      saved?: true;
      /** The entry a *Merge* landed and the head it moved from, which its Undo returns to (I11). */
      revisionId?: string;
      before?: string;
    }>
  /** A *Switch* the D10 guard would not make, in the words it gave (review R3). */
  | Readonly<{ type: 'refused'; branch: string; reason: string }>
  /**
   * A merge that collided (AC14, W10 review R1).
   *
   * The card on the branch's own row says what to do about it; this says that
   * something happened at all, because the person pressed a button and the
   * thing they were looking at — the target branch — did not move, by design.
   */
  | Readonly<{ type: 'mergeConflicted'; branch: string; into: string; paths: readonly string[] }>
  /**
   * One conflicted file's marker text, for the editor that opens it (S33, W10).
   *
   * Not a toast in the sense of a message, but the same channel for the same
   * reason: it is a fact from the tree that only a page can act on, and the page
   * holds the root and nothing else (A38).
   */
  | Readonly<{ type: 'conflictText'; revisionId: string; path: string; text: string; ours: string; theirs: string }>
  /** That conflicted file could not be opened, and why (C44). */
  | Readonly<{ type: 'conflictTextFailed'; revisionId: string; path: string; reason: string }>
  /** *Ask chat to resolve*: whatever starts chat turns on this page should. */
  | Readonly<{
      type: 'resolveWithChat';
      revisionId: string;
      checkoutId: string | undefined;
      paths: readonly string[];
    }>
  /**
   * A verb that could not be carried out, in the words the tree gave.
   *
   * `save` joined `restore` and `branch` because a cut nobody asked for by hand
   * — *Save*, the idle window, the tab going hidden — failed with a reason only
   * the Revisions pane's count hinted at, and a count is not a reason (I12,
   * W18 DEF-7). A cut a *turn* asked for is not on this channel: its chat
   * already says so, through the admission it refuses.
   */
  /**
   * A remote or resolution child's own sentence (L2-F8): *Connected*, a
   * refused connection, a merge that could not be finished. The machines
   * already phrase these for a person, so the page shows `message` as it is.
   */
  | Readonly<{ type: 'notice'; subject: 'remote' | 'resolution'; tone: 'info' | 'error'; message: string }>
  | Readonly<{
      type: 'error';
      subject: 'restore' | 'branch' | 'save' | 'connection';
      /** Which attachment attempt and initialization step failed. */
      generation?: number;
      connectionOperation?: 'connect' | 'status' | 'open' | 'subscribe' | 'stream';
      /* Which branch verb refused, so a caller correlating one *New branch*
       * does not take another verb's refusal for its own (finding 1). */
      operation?: BranchOperation;
      branch?: string;
      message: string;
      /* P4: the code is the refusal; the page turns it into product words. */
      code?: string;
      /** The revision an undo could not undo, for the page's sentence (D15). */
      revisionNumber?: number;
    }>;

/**
 * One request frame on a revision port: a command, optionally correlated.
 *
 * A command that has an answer carries an `id` and is answered by one `result`
 * frame (see `answerOf`); everything else rides the tree's own projection.
 *
 * @public
 */
export type WorkerRevisionRequest =
  | (WorkerRevisionCommand & Readonly<{ id?: number }>)
  | Readonly<{ command: 'close'; id?: number }>
  /*
   * The credential a third-party remote is reached with (S34, W12).
   *
   * A port frame rather than a tree command, for the same reason `close` is:
   * the *port* makes the requests, and the credential is resolved per request
   * rather than held in a machine's context (I8). The page sends it because
   * only the page has `authClient` and `window.ENV`; the worker keeps it in
   * memory for as long as the project is open and never writes it anywhere.
   */
  | (GitRemoteCredential & Readonly<{ command: 'remoteCredential'; id?: number }>)
  | (GitRemoteCredential & Readonly<{ command: 'pushGithub'; id?: number }>)
  /* Whether this project is the page's focused one (RV-W5b F12): a port frame,
   * because focus is the page's fact about its projects, not the tree's. */
  | Readonly<{ command: 'focus'; focused: boolean; id?: number }>
  /* The page's resolved telemetry consent (runtime observability PR-7, AR-W6-02): a port frame, said on every new
   * port and on every change, because only the page can resolve it. The sync attempt reporter reads it. */
  | Readonly<{ command: 'telemetryConsent'; consent: ReportingConsent; id?: number }>
  /* The page's word that a Tau Cloud open's first view is on screen (STO-25): a port frame, because only the page
   * knows what it shows. The host's open timer reads it. */
  | Readonly<{ command: 'firstViewShown'; id?: number }>;

/**
 * What one correlated command answered.
 *
 * One `result` frame for every command that has an answer, discriminated by
 * `kind` — rather than a frame type per verb, which would be a second channel
 * to keep in step with the request ids (W3d review).
 *
 * @public
 */
export type WorkerRevisionResult =
  | Readonly<{ kind: 'githubPushed' }>
  | Readonly<{ kind: 'log'; rows: readonly RevisionRow[] }>
  | Readonly<{ kind: 'graph'; graph: RevisionGraph }>
  | Readonly<{ kind: 'divergence'; divergence: RevisionDivergence }>
  | Readonly<{ kind: 'diff'; entries: readonly RevisionDiffEntry[] }>
  | Readonly<{ kind: 'comparison'; comparison: RevisionFileComparison }>
  | Readonly<{ kind: 'conflict'; conflict: RevisionConflictRead }>
  | Readonly<{ kind: 'content'; content: ReadOutcome }>
  | Readonly<{ kind: 'materialized' }>
  | Readonly<{ kind: 'geoSpecCandidates'; candidates: ReadonlyArray<Uint8Array<ArrayBuffer>> }>
  | Readonly<{ kind: 'geoSpecCandidatePublication'; status: 'updated' | 'upToDate' | 'rejected' }>
  /** `tag` answers with the version it wrote. */
  | Readonly<{ kind: 'tag'; tag: RevisionTag | undefined }>
  /**
   * The project's root has been released (W19).
   *
   * A correlated `close` is what lets `project-session.closing` wait for the
   * flush it asked for: `release()` takes the close cut and then awaits W13's
   * `awaitSyncSettled`, and only then does this frame go out. An uncorrelated
   * `close` — what `pagehide` sends — still answers nothing.
   */
  | Readonly<{ kind: 'closed' }>
  /**
   * The cut a `saveRevision` asked for has settled (C16).
   *
   * Carries nothing: the outcome a reader acts on is the projection (a new
   * head, or none) and the toast channel (a failure). What the frame *is* is
   * permission for `pagehide` to run.
   */
  | Readonly<{ kind: 'saved'; outcome: CheckoutCutsOutcome }>
  /**
   * The root has taken a `sessionChanged` (audit R6). Every frame posted after
   * this one was projected after the change; frames before it may be from
   * either side, so the page reads only a refusal after it as the new session's.
   */
  | Readonly<{ kind: 'sessionChanged' }>
  /** What recording an editor's overlapping edit did (D14). */
  | Readonly<{ kind: 'editorConflict'; outcome: EditorConflictOutcome }>
  /**
   * The branch a `createBranch` asked for exists, on the checkout named here.
   *
   * The one fact the caller needs (interface segregation): a page placing a
   * chat on the branch it just made would otherwise subscribe to the whole
   * projection to infer it.
   */
  | (Readonly<{ kind: 'branch' }> & BranchCreated)
  /** A `pullRemote` was asked (round 27): `pulls: false` where this device cannot pull the chat (`CHAT_NOT_SHARED`). */
  | Readonly<{ kind: 'pulled'; pulls: boolean }>;

/** A branch that now exists, and the checkout the registry made for it. @public */
export type BranchCreated = Readonly<{ branch: string; checkoutId: string; checkoutRoot: string }>;

/** One response frame on a revision port. @public */
export type WorkerRevisionResponse =
  | Readonly<{ type: 'status'; status: RevisionStatusProjection }>
  | Readonly<{ type: 'event'; event: WorkerRevisionEvent }>
  | Readonly<{ type: 'toast'; toast: RevisionToast }>
  | Readonly<{ type: 'result'; id: number; result: WorkerRevisionResult }>
  | Readonly<{ type: 'error'; id: number; message: string; code?: string }>;
