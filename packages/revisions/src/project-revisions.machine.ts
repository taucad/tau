/**
 * `project-revisions.machine` — the root of one project's revision actor tree.
 *
 * A host creates exactly this actor. The always-on children of this wave
 * (`checkouts`, `restore`) are **invoked**, so they stop with the root; the
 * variable-count children (`checkout` per registered checkout, `turn` per
 * admitted turn) are **spawned** with stored refs and stopped with `stopChild`
 * on removal and on root `exit`. `remote` joined them in W11b; later waves add
 * `sync`.
 *
 * No `systemId` is used anywhere: the app is one XState system and a second live
 * project would collide (F1). Children get `parentRef` through `input` and
 * address siblings by sending to this root, which routes. This root also owns
 * the workbench selection and D10's switch guard (F10), because the choice needs
 * `checkouts`' lease set.
 */

import { assign, emit, enqueueActions, sendTo, setup } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';

import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutCutTrigger, CheckoutStatus } from '#checkout.machine.js';
import { branchMachine, selectBranchFacet } from '#branch.machine.js';
import type { BranchMachineEvent, BranchOperation } from '#branch.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import type { CheckoutOperation } from '#checkouts.machine.js';
import { publishMachine, selectPublishFacet } from '#publish.machine.js';
import type { PublishFacet, PublishMachineEvent } from '#publish.machine.js';
import { remoteMachine, selectRemoteFacet } from '#remote.machine.js';
import type { RemoteFacet, RemoteMachineEvent } from '#remote.machine.js';
import type { RemoteKind } from '#remotes.js';
import { resolutionMachine, selectResolutionFacet } from '#resolution.machine.js';
import type { ResolutionMachineEvent, ResolutionSide } from '#resolution.machine.js';
import { restoreMachine, selectRestoreBusy, selectRestoreNeedsConfirmation } from '#restore.machine.js';
import { selectSyncFacet, syncMachine } from '#sync.machine.js';
import type { SyncFacet, SyncMachineEvent, SyncPushOutcome } from '#sync.machine.js';
import type { CheckoutRecord } from '#revision-port.js';
import { turnMachine } from '#turn.machine.js';
import type { TurnOutcome, TurnSettlement } from '#turn.machine.js';

/** What one checkout last reported about itself. @public */
export type CheckoutStatusEntry = Readonly<{ status: CheckoutStatus; headRevisionId: string | undefined }>;

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
  branch: string | undefined;
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

/** Input accepted when creating the projectRevisionsMachine actor. @public */
export type ProjectRevisionsMachineInput = Readonly<{
  projectId: string;
  /** The checkout that is the project directory itself. */
  liveCheckoutId?: string;
  selectedCheckoutId?: string;
}>;

/** Serializable state owned by projectRevisionsMachine. @public */
export type ProjectRevisionsMachineContext = Readonly<{
  projectId: string;
  checkouts: readonly CheckoutRecord[];
  /** Local branch refs learned from fetch that do not need a checkout yet. */
  availableBranches: ReadonlyArray<Readonly<{ name: string; head: string }>>;
  checkoutStatus: Readonly<Record<string, CheckoutStatusEntry>>;
  liveCheckoutId: string | undefined;
  selectedCheckoutId: string | undefined;
  follow: 'chat' | 'pinned';
  followedChatId: string | undefined;
  checkoutRefs: Readonly<Record<string, ActorRefFrom<typeof checkoutMachine>>>;
  turnRefs: Readonly<Record<string, ActorRefFrom<typeof turnMachine>>>;
  /** One per conflicted revision the registry reports, by revision id (S33, A38). */
  resolutionRefs: Readonly<Record<string, ActorRefFrom<typeof resolutionMachine>>>;
  /** Which checkout each chat's last prepared turn landed on, for `followChat`. */
  chatCheckouts: Readonly<Record<string, string>>;
  /**
   * Admissions that arrived before the registry answered (W3c report §7.1).
   *
   * The root spawns a checkout actor from the registry's first announcement, so
   * a turn admitted before that would resolve a checkout no actor represents and
   * be answered `cutFailed`. Both hosts waited out a bounded timer instead; the
   * root holds them here and replays them the moment the registry lands, which
   * is the A38 answer — settled values out, no host compensation.
   */
  pendingAdmissions: ReadonlyArray<Readonly<{ turnId: string; chatId: string; runId: string; checkoutId?: string }>>;
  /**
   * Whether the registry has answered at all — announced, or failed.
   *
   * Not `checkouts.length > 0`: a registry that *failed* has no records and
   * never will, so waiting on emptiness would hold every admission for the life
   * of the project instead of letting each turn's own `prepare` refuse it.
   */
  registrySettled: boolean;
}>;

/** Events accepted by projectRevisionsMachine. @public */
export type ProjectRevisionsMachineEvent =
  | Readonly<{ type: 'checkoutsChanged'; checkouts: readonly CheckoutRecord[] }>
  | Readonly<{
      type: 'branchesFetched';
      branches: ReadonlyArray<Readonly<{ name: string; head: string }>>;
    }>
  | Readonly<{
      type: 'checkoutStatusChanged';
      checkoutId: string;
      status: CheckoutStatus;
      headRevisionId?: string;
    }>
  | Readonly<{ type: 'admitTurn'; turnId: string; chatId: string; runId: string; checkoutId?: string }>
  | Readonly<{
      type: 'turnPrepared';
      turnId: string;
      chatId: string;
      checkoutId: string;
      branch: string | undefined;
    }>
  | Readonly<{
      type: 'cut';
      trigger: CheckoutCutTrigger;
      /** Absent for a trigger-only cut: `save`, `hidden` and `close` have no turn. */
      turnId?: string;
      checkoutId: string | undefined;
      leaseIds: readonly string[];
    }>
  | Readonly<{
      type: 'revisionMinted';
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      revisionId: string;
    }>
  | Readonly<{ type: 'nothingToSave'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string }>
  | Readonly<{
      type: 'cutFailed';
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      reason: string;
    }>
  | Readonly<{ type: 'casLost'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string }>
  | (Readonly<{ type: 'turnFinalized' }> & TurnSettlement)
  | (Readonly<{ type: 'turnConflicted' }> & TurnSettlement)
  | Readonly<{ type: 'leaseStale'; runId: string }>
  | Readonly<{
      type: 'checkoutChanged';
      checkoutId: string;
      revisionId: string;
      treeId: string;
      branch: string | undefined;
    }>
  /* R9: the two verbs a host drives most, and the lease facts children raise. */
  | Readonly<{ type: 'changed'; checkoutId: string; paths: readonly string[]; generation: number }>
  | Readonly<{ type: 'turnCompleted'; turnId: string }>
  | Readonly<{ type: 'turnAbandoned'; turnId: string }>
  | Readonly<{ type: 'release'; turnId: string }>
  | Readonly<{ type: 'leaseWritten'; checkoutId: string | undefined; runId: string }>
  | Readonly<{
      type: 'turnReleased';
      turnId: string;
      chatId: string;
      checkoutId: string | undefined;
      runId: string;
      outcome: TurnOutcome;
      reason?: string;
    }>
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  | Readonly<{ type: 'removalOffered'; checkoutId: string }>
  | Readonly<{ type: 'checkoutFailed'; operation: CheckoutOperation; reason: string }>
  | Readonly<{ type: 'addCheckout'; branch: string; from: string }>
  | Readonly<{ type: 'removeCheckout'; id: string }>
  | Readonly<{ type: 'switch'; branch: string }>
  | Readonly<{ type: 'followChat'; chatId: string }>
  | Readonly<{ type: 'pinTo'; checkoutId: string }>
  /* The remote child's own verbs, routed through the root: a host holds the
   * root and nothing else (A38), so the Sync region's events arrive here. */
  | (Readonly<{ type: 'remote' }> & Readonly<{ event: RemoteMachineEvent }>)
  | (Readonly<{ type: 'branch' }> & Readonly<{ event: BranchMachineEvent }>)
  | (Readonly<{ type: 'publish' }> & Readonly<{ event: PublishMachineEvent }>)
  /* W13's own verbs, routed the same way — a host holds only the root (A38). */
  | (Readonly<{ type: 'sync' }> & Readonly<{ event: SyncMachineEvent }>)
  /**
   * One push asked for, and its correlated settlement (W8 ↔ W13).
   *
   * The pair travels through the root in both directions, because siblings
   * speak through the parent (A38): `publish.machine` asks for `syncNow`,
   * `sync.machine` answers `pushSettled`, and the root's only job is to hand
   * each on to the machine on the other side.
   */
  | Readonly<{ type: 'syncNow'; pushId?: string; remote?: string }>
  | Readonly<{ type: 'pushSettled'; pushId: string; outcome: SyncPushOutcome }>
  /* The conflict card's verbs, addressed to one conflicted revision's child (S33). */
  | (Readonly<{ type: 'resolution'; revisionId: string }> & Readonly<{ event: ResolutionMachineEvent }>)
  /* `branch.machine` says a merge collided; the registry is stale and nothing
   * else would ever say so (W10 review R1, P41). */
  | Readonly<{ type: 'mergeConflicted'; branch: string; into: string; paths: readonly string[] }>
  | Readonly<{ type: 'branchMerged'; branch: string; into: string; revisionId: string }>
  /* That child's own answers, routed up so the root can retire it. */
  /* `remote.machine` says the remote came or went; `sync` is a sibling and hears
   * it through the root (A38, W18 review DEF-6b, P53). */
  | Readonly<{ type: 'remoteConnected'; kind: RemoteKind; url: string; name: string }>
  | Readonly<{ type: 'remoteDisconnected' }>
  | Readonly<{ type: 'conflictResolved'; revisionId: string; branch: string | undefined }>
  | Readonly<{ type: 'resolutionChanged'; revisionId: string }>
  | Readonly<{
      type: 'conflictMaterialized';
      revisionId: string;
      path: string;
      text: string;
      ours: string;
      theirs: string;
    }>
  | Readonly<{
      type: 'turnRequested';
      revisionId: string;
      checkoutId: string | undefined;
      paths: readonly string[];
    }>;

/** Facts projectRevisionsMachine emits for a host that holds only the root. @public */
export type ProjectRevisionsMachineEmitted =
  | Readonly<{
      type: 'revisionMinted';
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      revisionId: string;
    }>
  | Readonly<{ type: 'nothingToSave'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string }>
  | Readonly<{
      type: 'cutFailed';
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      reason: string;
    }>
  | Readonly<{ type: 'casLost'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string }>
  | (Readonly<{ type: 'turnFinalized' }> & TurnSettlement)
  | (Readonly<{ type: 'turnConflicted' }> & TurnSettlement)
  /*
   * A turn that ran and recorded nothing.
   *
   * `failed` and `released` are outcomes a person can see — an agent whose
   * placement broke, a chat the user cancelled — and a host that only heard the
   * two settlements would show nothing at all. Emitting it here deletes the
   * per-host polling compensation `watchFailedTurns` was (W5 report §9).
   */
  | Readonly<{
      type: 'turnReleased';
      turnId: string;
      chatId: string;
      checkoutId: string | undefined;
      runId: string;
      outcome: TurnOutcome;
      /** Why it ended, when the machine had a reason to give. */
      reason?: string;
    }>
  | Readonly<{
      type: 'switchResolved';
      branch: string;
      /** `reroot` moves the workbench; `applyToLive` asks for head(branch) on live. */
      mode: 'reroot' | 'applyToLive';
      checkoutId: string;
    }>
  | Readonly<{ type: 'switchRefused'; branch: string; reason: string }>
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  | Readonly<{ type: 'removalOffered'; checkoutId: string }>
  | Readonly<{ type: 'checkoutFailed'; operation: CheckoutOperation; reason: string }>
  /**
   * A conflict was resolved, or a chat was asked to resolve one (S33, W10).
   *
   * Both are re-emitted rather than left inside the child, because the surfaces
   * that need them — the toast sink and whatever starts a chat turn — hold the
   * root and nothing else (A38).
   */
  | Readonly<{ type: 'conflictResolved'; revisionId: string; branch: string | undefined }>
  /** A merge collided: the source branch now holds a conflicted revision (AC14). */
  | Readonly<{ type: 'mergeConflicted'; branch: string; into: string; paths: readonly string[] }>
  /** The marker text one conflicted file was opened with, for the editor that shows it. */
  | Readonly<{
      type: 'conflictMaterialized';
      revisionId: string;
      path: string;
      text: string;
      ours: string;
      theirs: string;
    }>
  | Readonly<{
      type: 'turnRequested';
      revisionId: string;
      checkoutId: string | undefined;
      paths: readonly string[];
    }>;

const selectedRecord = (context: ProjectRevisionsMachineContext): CheckoutRecord | undefined =>
  context.checkouts.find((checkout) => checkout.id === context.selectedCheckoutId);

/**
 * Whether a turn is recording this checkout's bytes right now (W6-a2 R1).
 *
 * Two facts, because neither alone covers the window: the registry's
 * `leaseRunIds` is the *shared* one, so it sees a turn run by a second window or
 * another host, and it is what a lease outlives its actor for; a spawned turn
 * that has not written its lease yet is only in `turnRefs`. A turn that has
 * settled (`outcome` set) is holding nothing.
 *
 * @param context - The root's own context.
 * @param checkoutId - The checkout a cut names.
 * @returns True while some turn is recording that checkout.
 */
const heldByTurn = (context: ProjectRevisionsMachineContext, checkoutId: string): boolean =>
  (context.checkouts.find((checkout) => checkout.id === checkoutId)?.leaseRunIds.length ?? 0) > 0 ||
  Object.values(context.turnRefs).some((ref) => {
    const snapshot = ref.getSnapshot();
    return snapshot.context.checkoutId === checkoutId && snapshot.context.outcome === undefined;
  });

/**
 * Headless root of one project's revision actor tree.
 *
 * @public
 */
export const projectRevisionsMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as ProjectRevisionsMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as ProjectRevisionsMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    emitted: {} as ProjectRevisionsMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as ProjectRevisionsMachineInput,
  },
  actors: {
    checkouts: checkoutsMachine,
    restore: restoreMachine,
    checkout: checkoutMachine,
    turn: turnMachine,
    remote: remoteMachine,
    branch: branchMachine,
    publish: publishMachine,
    sync: syncMachine,
    resolution: resolutionMachine,
  },
  guards: {
    turnIsNew: ({ context }, params: Readonly<{ turnId: string }>) => context.turnRefs[params.turnId] === undefined,
    registryUnanswered: ({ context }) => !context.registrySettled,
  },
  actions: {
    /* R12: every terminal state of a turn drops its ref, not just the two that
     * carry a settlement. */
    dropTurn: enqueueActions(({ context, enqueue }, params: Readonly<{ turnId: string }>) => {
      const ref = context.turnRefs[params.turnId];
      if (ref === undefined) {
        return;
      }
      enqueue.stopChild(ref);
      enqueue.assign({
        turnRefs: Object.fromEntries(Object.entries(context.turnRefs).filter(([turnId]) => turnId !== params.turnId)),
      });
    }),
    /*
     * One `resolution` child per conflicted branch head (S33, A38).
     *
     * Spawned from the *records*, so a reload rebuilds exactly the cards the
     * store still justifies (I3), and stopped the moment a head stops being
     * conflicted — which is what `finish` and a second merge both do.
     */
    syncResolutions: enqueueActions(({ context, enqueue }) => {
      const wanted = new Map(
        context.checkouts
          .filter((checkout) => checkout.conflicted === true && checkout.headRevisionId !== undefined)
          .map((checkout) => [checkout.headRevisionId ?? '', checkout.branch]),
      );
      for (const [id, ref] of Object.entries(context.resolutionRefs)) {
        if (!wanted.has(id)) {
          enqueue.stopChild(ref);
        }
      }
      enqueue.assign(({ context: current, self, spawn }) => {
        const kept = Object.fromEntries(Object.entries(current.resolutionRefs).filter(([id]) => wanted.has(id)));
        for (const [id, branch] of wanted) {
          kept[id] ??= spawn('resolution', {
            id: `resolution:${id}`,
            input: {
              projectId: current.projectId,
              revisionId: id,
              ...(branch === undefined ? {} : { branch }),
              parentRef: self,
            },
          });
        }
        return { resolutionRefs: kept };
      });
    }),
    /* Tell `restore` which checkout the workbench is rooted at now, and
     * `branch` which branch *Merge into `<current>`* means. */
    announceSelection: enqueueActions(({ context, enqueue }) => {
      enqueue.sendTo('restore', {
        type: 'selectCheckout',
        checkoutId: context.selectedCheckoutId ?? '',
        headRevisionId: selectedRecord(context)?.headRevisionId,
      });
      enqueue.sendTo('branch', { type: 'selectBranch', branch: selectedRecord(context)?.branch });
    }),
  },
}).createMachine({
  id: 'project-revisions',
  context: ({ input }) => ({
    projectId: input.projectId,
    checkouts: [],
    availableBranches: [],
    checkoutStatus: {},
    liveCheckoutId: input.liveCheckoutId,
    selectedCheckoutId: input.selectedCheckoutId ?? input.liveCheckoutId,
    follow: 'chat',
    followedChatId: undefined,
    checkoutRefs: {},
    turnRefs: {},
    resolutionRefs: {},
    chatCheckouts: {},
    pendingAdmissions: [],
    registrySettled: false,
  }),
  invoke: [
    {
      id: 'checkouts',
      src: 'checkouts',
      input: ({ context, self }) => ({ projectId: context.projectId, parentRef: self }),
      /* P45: a child's own transition is a root snapshot, so the host frame follows it (see `sync` below). */
      onSnapshot: { actions: [] },
    },
    {
      id: 'restore',
      src: 'restore',
      input: ({ context, self }) => ({
        projectId: context.projectId,
        checkoutId: context.selectedCheckoutId ?? '',
        parentRef: self,
      }),
      onSnapshot: { actions: [] },
    },
    {
      id: 'remote',
      src: 'remote',
      input: ({ context, self }) => ({ projectId: context.projectId, parentRef: self }),
      onSnapshot: { actions: [] },
    },
    {
      id: 'branch',
      src: 'branch',
      input: ({ context, self }) => ({
        projectId: context.projectId,
        parentRef: self,
      }),
      onSnapshot: { actions: [] },
    },
    {
      id: 'publish',
      src: 'publish',
      input: ({ context, self }) => ({ projectId: context.projectId, parentRef: self }),
      onSnapshot: { actions: [] },
    },
    {
      id: 'sync',
      src: 'sync',
      input: ({ context, self }) => ({ projectId: context.projectId, parentRef: self }),
      /*
       * Every scheduler change is a root snapshot, and therefore a frame the
       * host may publish (W13).
       *
       * The facet is read from the child, but a host subscribes to the *root*,
       * and a child's own transition is not one — so a push settling, a queue
       * write finishing or the pull's deadline firing left the Sync row showing
       * whatever it showed when the root last moved. No action: the transition
       * itself is the notification, and the host's own settled-value filter
       * (`sameStatus`) is what stops it becoming a repaint (A38, P28).
       */
      onSnapshot: { actions: [] },
    },
  ],
  entry: sendTo('checkouts', { type: 'open' }),
  exit: enqueueActions(({ context, enqueue }) => {
    for (const ref of Object.values(context.checkoutRefs)) {
      enqueue.stopChild(ref);
    }
    for (const ref of Object.values(context.turnRefs)) {
      enqueue.stopChild(ref);
    }
    for (const ref of Object.values(context.resolutionRefs)) {
      enqueue.stopChild(ref);
    }
    enqueue.assign({ checkoutRefs: {}, turnRefs: {}, resolutionRefs: {} });
  }),
  initial: 'ready',
  states: {
    ready: {
      on: {
        branchesFetched: { actions: assign({ availableBranches: ({ event }) => event.branches }) },
        checkoutsChanged: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const known = new Set(event.checkouts.map((checkout) => checkout.id));
            for (const [id, ref] of Object.entries(context.checkoutRefs)) {
              if (!known.has(id)) {
                enqueue.stopChild(ref);
                continue;
              }
              const previous = context.checkouts.find((checkout) => checkout.id === id);
              const next = event.checkouts.find((checkout) => checkout.id === id);
              if (
                previous?.headRevisionId !== next?.headRevisionId &&
                next?.headRevisionId !== undefined &&
                next.headTreeId !== undefined
              ) {
                enqueue.sendTo(ref, {
                  type: 'headChanged',
                  revisionId: next.headRevisionId,
                  treeId: next.headTreeId,
                });
              }
            }
            /* W3b's own correction, unexecuted until a consumer needed it: the
             * registry's `kind === 'live'` record *is* the live checkout, so a
             * host that pins none still gets one — without this the selection,
             * and therefore the whole `RevisionStatus` projection, stays empty
             * forever (W3d). `input.liveCheckoutId` remains the override. */
            const liveId = context.liveCheckoutId ?? event.checkouts.find((checkout) => checkout.kind === 'live')?.id;
            enqueue.assign(({ context: current, self, spawn }) => {
              const kept = Object.fromEntries(Object.entries(current.checkoutRefs).filter(([id]) => known.has(id)));
              for (const record of event.checkouts) {
                if (kept[record.id] !== undefined) {
                  continue;
                }
                kept[record.id] = spawn('checkout', {
                  id: `checkout:${record.id}`,
                  input: {
                    checkoutId: record.id,
                    branch: record.branch,
                    headRevisionId: record.headRevisionId,
                    /* I5's left-hand side, so the first cut after a rehydration
                     * can be recognised as a no-op (R3). */
                    headTreeId: record.headTreeId,
                    parentRef: self,
                  },
                });
              }
              const selected =
                current.selectedCheckoutId !== undefined && known.has(current.selectedCheckoutId)
                  ? current.selectedCheckoutId
                  : liveId;
              return {
                checkouts: event.checkouts,
                checkoutRefs: kept,
                chatCheckouts: Object.fromEntries(
                  Object.entries(current.chatCheckouts).filter(([, checkoutId]) => known.has(checkoutId)),
                ),
                liveCheckoutId: liveId,
                selectedCheckoutId: selected,
              };
            });
            /* R8: `restore`'s invoke input was evaluated before any record
             * existed, so the first registry it ever sees has to be announced,
             * and so does a head that moved under the selection. */
            const nextSelected =
              context.selectedCheckoutId !== undefined && known.has(context.selectedCheckoutId)
                ? context.selectedCheckoutId
                : liveId;
            const previousHead = context.checkouts.find(
              (checkout) => checkout.id === context.selectedCheckoutId,
            )?.headRevisionId;
            const nextHead = event.checkouts.find((checkout) => checkout.id === nextSelected)?.headRevisionId;
            if (
              nextSelected !== undefined &&
              (context.checkouts.length === 0 ||
                nextSelected !== context.selectedCheckoutId ||
                nextHead !== previousHead)
            ) {
              enqueue('announceSelection');
            }
            /* One conflict card per conflicted head the records justify (S33). */
            enqueue('syncResolutions');
            /* `branch` delegated *New branch* and *Discard* to the registry, so
             * the registry's own answer is what settles them. */
            enqueue.sendTo('branch', {
              type: 'branchesChanged',
              branches: event.checkouts.flatMap((checkout) => (checkout.branch === undefined ? [] : [checkout.branch])),
            });
            enqueue.assign({ registrySettled: true });
            /* The registry has answered, so the turns that arrived before it
             * can be admitted onto checkouts that now have actors. */
            if (context.pendingAdmissions.length > 0 && event.checkouts.length > 0) {
              for (const admission of context.pendingAdmissions) {
                enqueue.raise({ type: 'admitTurn', ...admission });
              }
              enqueue.assign({ pendingAdmissions: [] });
            }
          }),
        },
        checkoutStatusChanged: {
          actions: assign({
            checkoutStatus: ({ context, event }) => ({
              ...context.checkoutStatus,
              [event.checkoutId]: { status: event.status, headRevisionId: event.headRevisionId },
            }),
          }),
        },
        admitTurn: [
          {
            guard: 'registryUnanswered',
            actions: assign({
              pendingAdmissions: ({ context, event }) => {
                const { type: _type, ...admission } = event;
                return [...context.pendingAdmissions, admission];
              },
            }),
          },
          {
            guard: { type: 'turnIsNew', params: ({ event }) => ({ turnId: event.turnId }) },
            actions: assign({
              turnRefs: ({ context, event, self, spawn }) => ({
                ...context.turnRefs,
                [event.turnId]: spawn('turn', {
                  id: `turn:${event.turnId}`,
                  input: {
                    turnId: event.turnId,
                    chatId: event.chatId,
                    runId: event.runId,
                    ...(event.checkoutId === undefined ? {} : { checkoutId: event.checkoutId }),
                    parentRef: self,
                  },
                }),
              }),
            }),
          },
        ],
        turnPrepared: {
          actions: assign({
            chatCheckouts: ({ context, event }) => ({ ...context.chatCheckouts, [event.chatId]: event.checkoutId }),
          }),
        },
        cut: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = event.checkoutId === undefined ? undefined : context.checkoutRefs[event.checkoutId];
            if (ref === undefined) {
              /* R5: a dropped request is a turn that waits out its whole bound
               * and then fails with a timeout nobody can act on. */
              const turnRef = event.turnId === undefined ? undefined : context.turnRefs[event.turnId];
              if (turnRef !== undefined) {
                enqueue.sendTo(turnRef, {
                  type: 'cutFailed',
                  trigger: event.trigger,
                  turnId: event.turnId,
                  reason: `This project has no checkout ${event.checkoutId ?? '(none named)'}.`,
                });
              }
              return;
            }
            /*
             * A trigger-only cut never takes a running turn's bytes (a2 R1).
             *
             * `save`, `idle`, `hidden` and `close` are ambient: the tab going
             * hidden and the page unloading fire on their own schedule, and the
             * one that lands mid-turn would pass the I5 gate on the agent's
             * writes, record them as the person's, and leave the turn's own
             * settlement with an unchanged tree and no revision (AC9). The turn
             * is already recording them, so the honest answer is the same one an
             * unchanged tree gets — settled, never a silent drop.
             */
            if (event.turnId === undefined && heldByTurn(context, event.checkoutId ?? '')) {
              enqueue.raise({
                type: 'nothingToSave',
                checkoutId: event.checkoutId ?? '',
                trigger: event.trigger,
              });
              return;
            }
            enqueue.sendTo(ref, {
              type: 'cut',
              trigger: event.trigger,
              ...(event.turnId === undefined ? {} : { turnId: event.turnId }),
              leaseIds: event.leaseIds,
            });
          }),
        },
        revisionMinted: {
          actions: [
            enqueueActions(({ context, enqueue, event }) => {
              const ref = event.turnId === undefined ? undefined : context.turnRefs[event.turnId];
              if (ref !== undefined) {
                enqueue.sendTo(ref, event);
              }
            }),
            /* The scheduler hears about every revision this project mints, and
               nothing else decides when a push happens (D28, W13). A cut the
               root declined above never reaches here, so the durable queue can
               never record a phantom (W6-a2 R1). */
            sendTo('sync', ({ event }) => event),
            emit(({ event }) => event),
          ],
        },
        /* Re-emitted as well as routed (W6): a trigger-only cut — `save`,
         * `idle`, `hidden`, `close` — has no turn to answer, and its outcome is
         * exactly what *Nothing changed since Rev N* renders and what a host
         * quitting on a `close` flush waits for. */
        nothingToSave: {
          actions: [
            enqueueActions(({ context, enqueue, event }) => {
              const ref = event.turnId === undefined ? undefined : context.turnRefs[event.turnId];
              if (ref !== undefined) {
                enqueue.sendTo(ref, event);
              }
            }),
            emit(({ event }) => event),
          ],
        },
        cutFailed: {
          actions: [
            enqueueActions(({ context, enqueue, event }) => {
              const ref = event.turnId === undefined ? undefined : context.turnRefs[event.turnId];
              if (ref !== undefined) {
                enqueue.sendTo(ref, event);
              }
            }),
            emit(({ event }) => event),
          ],
        },
        casLost: {
          actions: [
            enqueueActions(({ context, enqueue, event }) => {
              const ref = event.turnId === undefined ? undefined : context.turnRefs[event.turnId];
              if (ref !== undefined) {
                enqueue.sendTo(ref, event);
              }
            }),
            emit(({ event }) => event),
          ],
        },
        turnFinalized: {
          actions: [
            sendTo('checkouts', ({ event }) => event),
            emit(({ event }) => event),
            { type: 'dropTurn', params: ({ event }) => ({ turnId: event.turnId }) },
          ],
        },
        turnConflicted: {
          actions: [
            sendTo('checkouts', ({ event }) => event),
            emit(({ event }) => event),
            { type: 'dropTurn', params: ({ event }) => ({ turnId: event.turnId }) },
          ],
        },
        leaseStale: { actions: sendTo('checkouts', ({ event }) => event) },
        leaseWritten: { actions: sendTo('checkouts', ({ event }) => event) },
        turnReleased: {
          actions: [
            sendTo('checkouts', ({ event }) => event),
            emit(({ event }) => event),
            { type: 'dropTurn', params: ({ event }) => ({ turnId: event.turnId }) },
          ],
        },
        /* R9: the host drives the tree through the root, so the root owns the
         * inbound routes as well as the outbound ones. */
        changed: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = context.checkoutRefs[event.checkoutId];
            if (ref !== undefined) {
              enqueue.sendTo(ref, { type: 'changed', paths: event.paths, generation: event.generation });
            }
          }),
        },
        turnCompleted: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = context.turnRefs[event.turnId];
            if (ref !== undefined) {
              enqueue.sendTo(ref, { type: 'turnCompleted' });
            }
          }),
        },
        turnAbandoned: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = context.turnRefs[event.turnId];
            if (ref !== undefined) {
              enqueue.sendTo(ref, { type: 'turnAbandoned' });
            }
          }),
        },
        release: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = context.turnRefs[event.turnId];
            if (ref !== undefined) {
              enqueue.sendTo(ref, { type: 'release' });
            }
          }),
        },
        /* R11: registry facts a host has to show reach it through the root. */
        leaseRetired: { actions: emit(({ event }) => event) },
        removalOffered: { actions: emit(({ event }) => event) },
        checkoutFailed: {
          actions: [
            emit(({ event }) => event),
            sendTo('branch', ({ event }) => ({ type: 'operationFailed', reason: event.reason })),
            /* A registry that failed will never announce, so an admission held
             * for it would wait out its host's whole bound. Release the buffer
             * instead: the turn's own `prepare` is what refuses it, with the
             * reason — which is how a host refuses a run rather than running it
             * unrecorded (I-EDIT). */
            enqueueActions(({ context, enqueue }) => {
              enqueue.assign({ registrySettled: true });
              if (context.pendingAdmissions.length === 0) {
                return;
              }
              for (const admission of context.pendingAdmissions) {
                enqueue.raise({ type: 'admitTurn', ...admission });
              }
              enqueue.assign({ pendingAdmissions: [] });
            }),
          ],
        },
        checkoutChanged: {
          actions: [
            assign({
              checkouts: ({ context, event }) =>
                context.checkouts.map((checkout) =>
                  checkout.id === event.checkoutId
                    ? { ...checkout, headRevisionId: event.revisionId, branch: event.branch }
                    : checkout,
                ),
            }),
            enqueueActions(({ context, enqueue, event }) => {
              const ref = context.checkoutRefs[event.checkoutId];
              if (ref !== undefined) {
                enqueue.sendTo(ref, {
                  type: 'headChanged',
                  revisionId: event.revisionId,
                  treeId: event.treeId,
                });
              }
            }),
          ],
        },
        pinTo: {
          actions: [
            assign({
              selectedCheckoutId: ({ event }) => event.checkoutId,
              follow: 'pinned',
              followedChatId: undefined,
            }),
            'announceSelection',
          ],
        },
        /* The root routes, it does not interpret: a host sends one verb per
         * surface and the child owns what the verb means (A38). */
        remote: {
          actions: enqueueActions(({ enqueue, event }) => {
            /* Replacing a destination first retires the old scheduler. An
             * in-flight request may finish against the old remote, but no
             * queued lease is allowed to wake up against the replacement. */
            if (event.event.type === 'connect') {
              enqueue.sendTo('sync', { type: 'remoteDisconnected' });
            }
            enqueue.sendTo('remote', event.event);
          }),
        },
        branch: { actions: sendTo('branch', ({ event }) => event.event) },
        publish: { actions: sendTo('publish', ({ event }) => event.event) },
        sync: { actions: sendTo('sync', ({ event }) => event.event) },
        /*
         * The conflict card's verbs, addressed to one conflicted revision (S33).
         *
         * By revision id, not by name: there is one child per conflicted
         * revision and a project can hold several at once — one per branch that
         * was merged and did not settle.
         */
        resolution: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = context.resolutionRefs[event.revisionId];
            if (ref !== undefined) {
              enqueue.sendTo(ref, event.event);
            }
          }),
        },
        resolutionChanged: { actions: [] },
        /* The merge moved the source branch onto a conflicted revision, so the
         * registry is re-read; `syncResolutions` then spawns the child and the
         * *Needs resolution* card exists without anyone reopening the project.
         * Re-emitted too, because a verb that changed nothing a person can see
         * has to say so (A25) — the card says the rest. */
        remoteConnected: {
          actions: sendTo('sync', ({ event }) => ({ type: 'remoteConnected', remote: event.name })),
        },
        remoteDisconnected: {
          actions: sendTo('sync', { type: 'remoteDisconnected' }),
        },
        mergeConflicted: {
          actions: enqueueActions(({ enqueue, event }) => {
            enqueue.emit(event);
            enqueue.sendTo('checkouts', { type: 'open' });
          }),
        },
        branchMerged: { actions: sendTo('checkouts', { type: 'open' }) },
        /* The head moved off the conflicted revision, so the registry is re-read
         * and `syncResolutions` retires the child on the answer — one writer of
         * the ref table, exactly as `checkoutRefs` has one. */
        conflictResolved: {
          actions: enqueueActions(({ enqueue, event }) => {
            enqueue.emit({ type: 'conflictResolved', revisionId: event.revisionId, branch: event.branch });
            enqueue.sendTo('checkouts', { type: 'open' });
            /* And the scheduler, or the Sync row would still read `Needs
             * resolution` after the person composed the two lines: `conflicted`
             * otherwise leaves only on connectivity or a correlated `syncNow`
             * (W13 review 2 R6, P37). The branch is what W10's resolution
             * settled; `sync` matches it against the ref it recorded. */
            enqueue.sendTo('sync', {
              type: 'conflictResolved',
              revisionId: event.revisionId,
              ...(event.branch === undefined ? {} : { ref: `refs/heads/${event.branch}` }),
            });
          }),
        },
        /* The marker text goes to the page that has an editor to show it in. */
        conflictMaterialized: { actions: emit(({ event }) => event) },
        /* *Ask chat to resolve*: only a page or a CLI can start a chat, and both
         * hold the root (A38), so the request is re-emitted here. */
        turnRequested: { actions: emit(({ event }) => event) },
        /* Verbatim to the machine that asked for the push, `outcome` included:
         * dropping it would let a failed or queued push publish a row for a
         * name the remote does not have (W8 review R3, P39). */
        /* The other half of that pair: the dialog asks the scheduler for its
         * push through here, because siblings speak through the parent (A38).
         * Without this edge `publish` could only declare its own success and
         * P39's three other outcomes were unreachable (W22 DEF-W22-2). */
        syncNow: {
          actions: sendTo('sync', ({ event }) => ({
            type: 'syncNow',
            pushId: event.pushId,
            ...(event.remote === undefined ? {} : { remote: event.remote }),
          })),
        },
        pushSettled: {
          actions: sendTo('publish', ({ event }) => ({
            type: 'pushSettled',
            pushId: event.pushId,
            outcome: event.outcome,
          })),
        },
        /* The registry's two verbs, which `branch` asks for through here
         * rather than opening a second writer of the same records. */
        /* A new branch with no base named starts where the person is standing:
           the head of the checkout they have selected. Only the root knows
           that, so it fills it here rather than making every caller — the
           picker, the region, `branch.machine` — carry a revision id. */
        addCheckout: {
          actions: sendTo('checkouts', ({ context, event }) => {
            if (event.from !== '') {
              return event;
            }
            const selected = context.checkouts.find((checkout) => checkout.id === context.selectedCheckoutId);
            const head =
              context.checkoutStatus[context.selectedCheckoutId ?? '']?.headRevisionId ?? selected?.headRevisionId;
            return head === undefined ? event : { ...event, from: head };
          }),
        },
        removeCheckout: { actions: sendTo('checkouts', ({ event }) => event) },
        followChat: {
          actions: [
            assign({
              follow: 'chat',
              followedChatId: ({ event }) => event.chatId,
              selectedCheckoutId: ({ context, event }) => context.chatCheckouts[event.chatId] ?? context.liveCheckoutId,
            }),
            'announceSelection',
          ],
        },
        /* D10: one verb. Re-root when the branch has a checkout; otherwise apply
         * to the live checkout, but only while no lease holds it. */
        switch: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const linked = context.checkouts.find((checkout) => checkout.branch === event.branch);
            if (linked !== undefined) {
              enqueue.assign({
                selectedCheckoutId: linked.id,
                follow: 'pinned',
                followedChatId: undefined,
              });
              enqueue.emit({
                type: 'switchResolved',
                branch: event.branch,
                mode: 'reroot',
                checkoutId: linked.id,
              });
              enqueue('announceSelection');
              return;
            }
            const liveRecord = context.checkouts.find((checkout) => checkout.id === context.liveCheckoutId);
            if (liveRecord === undefined || liveRecord.leaseRunIds.length > 0) {
              enqueue.emit({
                type: 'switchRefused',
                branch: event.branch,
                reason:
                  liveRecord === undefined
                    ? 'This project has no live checkout.'
                    : 'An agent is working in the live checkout.',
              });
              return;
            }
            enqueue.assign({
              selectedCheckoutId: liveRecord.id,
              follow: 'pinned',
              followedChatId: undefined,
            });
            enqueue.emit({
              type: 'switchResolved',
              branch: event.branch,
              mode: 'applyToLive',
              checkoutId: liveRecord.id,
            });
            /* The resolution is not the application. `branch.machine` owns the
               verb's lifecycle — its confirmation, its failure edge and the one
               `applySwitch` actor that writes the tree — so the root hands it
               the decision it just made rather than a host re-choreographing it
               from the emit (A38, I20; review R3). */
            enqueue.sendTo('branch', {
              type: 'switch',
              branch: event.branch,
              mode: 'applyToLive',
              checkoutId: liveRecord.id,
            });
            enqueue('announceSelection');
          }),
        },
      },
    },
  },
});

/**
 * Selects the coalesced status W3d publishes for this project.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The projection the UI reads through one stable selector.
 * @public
 */
export const selectRevisionStatus = (
  snapshot: SnapshotFrom<typeof projectRevisionsMachine>,
): RevisionStatusProjection => {
  const { context } = snapshot;
  const selected = context.checkouts.find((checkout) => checkout.id === context.selectedCheckoutId);
  const status =
    context.selectedCheckoutId === undefined ? undefined : context.checkoutStatus[context.selectedCheckoutId];
  return {
    projectId: context.projectId,
    checkoutId: context.selectedCheckoutId,
    checkoutRoot: selected?.root,
    branch: selected?.branch,
    projectDirty: Object.values(context.checkoutStatus).some((entry) => entry.status !== 'clean'),
    dirty: status !== undefined && status.status !== 'clean',
    minting: status?.status === 'minting',
    headRevisionId: status?.headRevisionId ?? selected?.headRevisionId,
    follow: context.follow,
    /* A conflicted branch needs a person as much as a failed cut does (A22,
     * the agent-state row `revision.conflicted`), so it counts here too. */
    attention:
      Object.values(context.checkoutStatus).filter((entry) => entry.status === 'failed' || entry.status === 'stale')
        .length + selectConflicts(snapshot).length,
    restore: selectRestoreFacet(snapshot),
    remote: selectRemoteFacetOf(snapshot),
    publish: selectPublishFacetOf(snapshot),
    sync: selectSyncFacetOf(snapshot),
    branches: selectBranches(snapshot),
    branchVerb: selectBranchFacetOf(snapshot),
    conflicts: selectConflicts(snapshot),
  };
};

/**
 * Every conflicted branch, with what a person has chosen on it so far.
 *
 * Two sources on purpose, each answering what only it can: the *records* say a
 * conflict exists (so a reload still shows the card), and the conflicted
 * revision's own `resolution` child says which files are left and which side
 * each has been given. Before that child has read the conflict the card renders
 * with no rows, which is exactly what is known.
 *
 * @param snapshot - Current root snapshot.
 * @returns One facet per conflicted branch head.
 */
const selectConflicts = (snapshot: SnapshotFrom<typeof projectRevisionsMachine>): readonly RevisionConflictFacet[] => {
  const { context } = snapshot;
  return context.checkouts.flatMap((checkout) => {
    if (checkout.conflicted !== true || checkout.headRevisionId === undefined) {
      return [];
    }
    const child = context.resolutionRefs[checkout.headRevisionId]?.getSnapshot();
    const facet = child === undefined ? undefined : selectResolutionFacet(child);
    return [
      {
        revisionId: checkout.headRevisionId,
        branch: checkout.branch,
        labels: facet?.labels,
        paths: facet?.paths ?? [],
        busy: facet?.busy ?? true,
        ready: facet?.ready ?? false,
      },
    ];
  });
};

/**
 * Every branch the registry holds, with the chats working on each.
 *
 * @param snapshot - Current root snapshot.
 * @returns The rows the *Branches* region renders.
 */
const selectBranches = (snapshot: SnapshotFrom<typeof projectRevisionsMachine>): readonly RevisionBranchFacet[] => {
  const { context } = snapshot;
  const checkedOut = context.checkouts.flatMap((checkout) =>
    checkout.branch === undefined
      ? []
      : [
          {
            name: checkout.branch,
            head: checkout.headRevisionId,
            checkoutId: checkout.id,
            checkoutRoot: checkout.root,
            /* The registry's own record, not the root's routing memory: a chip
               that came from `chatCheckouts` was gone the moment the page
               reloaded, because nothing on disk said it (I3; review R9). */
            leaseChatIds: checkout.leaseChatIds,
          },
        ],
  );
  const known = new Set(checkedOut.map((branch) => branch.name));
  return [
    ...checkedOut,
    ...context.availableBranches
      .filter((branch) => !known.has(branch.name))
      .map((branch) => ({
        name: branch.name,
        head: branch.head,
        checkoutId: undefined,
        checkoutRoot: undefined,
        leaseChatIds: [],
      })),
  ];
};

/**
 * The branch child's own state, read where it lives.
 *
 * @param snapshot - Current root snapshot.
 * @returns What the branch verbs are doing.
 */
const selectBranchFacetOf = (
  snapshot: SnapshotFrom<typeof projectRevisionsMachine>,
): RevisionStatusProjection['branchVerb'] => {
  const branch = snapshot.children.branch?.getSnapshot();
  return branch === undefined
    ? { busy: false, asking: false, operation: undefined, branch: undefined, question: undefined }
    : selectBranchFacet(branch);
};

/**
 * The remote child's own state, read where it lives.
 *
 * Same rule as `restore`: the root keeps no copy, because a copy would be a
 * second truth to keep in step.
 *
 * @param snapshot - Current root snapshot.
 * @returns The facet the Sync region renders.
 */
const selectRemoteFacetOf = (snapshot: SnapshotFrom<typeof projectRevisionsMachine>): RemoteFacet => {
  const remote = snapshot.children.remote?.getSnapshot();
  return remote === undefined
    ? {
        kind: 'none',
        url: undefined,
        phase: 'none',
        storage: undefined,
        quota: undefined,
        overQuota: [],
        error: undefined,
        fetchOnly: false,
        provider: undefined,
        repositoryId: undefined,
      }
    : selectRemoteFacet(remote);
};

/**
 * The sync child's own state, read where it lives.
 *
 * Same rule as `remote` and `restore`: the root keeps no copy, because a copy
 * would be a second truth to keep in step.
 *
 * @param snapshot - Current root snapshot.
 * @returns The facet the Sync row and the header chip render.
 */
const selectSyncFacetOf = (snapshot: SnapshotFrom<typeof projectRevisionsMachine>): SyncFacet => {
  const sync = snapshot.children.sync?.getSnapshot();
  return sync === undefined
    ? { state: 'noRemote', pendingCount: 0, online: true, conflictRef: undefined, error: undefined, reason: undefined }
    : selectSyncFacet(sync);
};

/**
 * The publish child's own state, read where it lives.
 *
 * @param snapshot - Current root snapshot.
 * @returns The Publish dialog's facet.
 */
const selectPublishFacetOf = (snapshot: SnapshotFrom<typeof projectRevisionsMachine>): PublishFacet => {
  const publish = snapshot.children.publish?.getSnapshot();
  return publish === undefined
    ? { phase: 'idle', tags: [], publicationId: undefined, shareUrl: undefined, error: undefined }
    : selectPublishFacet(publish);
};

/**
 * The restore child's own state, read where it lives.
 *
 * `restore` is an invoked child, so its snapshot is the only place the computed
 * plan's two risk facts exist; the root does not copy them into its context,
 * because a copy would be a second truth to keep in step.
 *
 * @param snapshot - Current root snapshot.
 * @returns The facts the restore confirmation renders.
 */
const selectRestoreFacet = (
  snapshot: SnapshotFrom<typeof projectRevisionsMachine>,
): RevisionStatusProjection['restore'] => {
  const restore = snapshot.children.restore?.getSnapshot();
  if (restore === undefined) {
    return { asking: false, busy: false, removedPathCount: 0, dirty: false, revisionNumber: undefined };
  }
  return {
    asking: selectRestoreNeedsConfirmation(restore),
    busy: selectRestoreBusy(restore),
    removedPathCount: restore.context.removedPathCount,
    dirty: restore.context.dirty,
    revisionNumber: restore.context.revisionNumber,
  };
};

/**
 * Selects the checkout the workbench reads (A1).
 *
 * @param snapshot - Current machine snapshot.
 * @returns The selected checkout id, or `undefined` before the registry opens.
 * @public
 */
export const selectSelectedCheckoutId = (snapshot: SnapshotFrom<typeof projectRevisionsMachine>): string | undefined =>
  snapshot.context.selectedCheckoutId;
