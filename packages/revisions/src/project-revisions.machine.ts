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

import { setup, types } from 'xstate';
import type { ActorRefFrom, AnyActorRef, EnqueueObject, SnapshotFrom, SystemRegistry } from 'xstate';

import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutCutTrigger, CheckoutStatus } from '#checkout.machine.js';
import { branchMachine, selectBranchFacet } from '#branch.machine.js';
import type { BranchMachineEvent } from '#branch.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import type { CheckoutOperation } from '#checkouts.machine.js';
import { eventSchemas } from '#machine-schemas.js';
import { publishMachine, selectPublishFacet } from '#publish.machine.js';
import type { PublishFacet, PublishMachineEvent } from '#publish.machine.js';
import { remoteMachine, selectRemoteFacet } from '#remote.machine.js';
import type { RemoteFacet, RemoteMachineEvent } from '#remote.machine.js';
import type { RemoteKind } from '#remotes.js';
import { resolutionMachine, selectResolutionFacet } from '#resolution.machine.js';
import type { ResolutionMachineEvent } from '#resolution.machine.js';
import { restoreMachine, selectRestoreBusy, selectRestoreNeedsConfirmation } from '#restore.machine.js';
import { selectSyncFacet, syncMachine } from '#sync.machine.js';
import type { SyncFacet, SyncMachineEvent, SyncPushOutcome } from '#sync.machine.js';
import type { CheckoutRecord, RevisionPortErrorCode } from '#revision-port.js';
import { turnMachine } from '#turn.machine.js';
import type { TurnFailureCode, TurnOutcome, TurnSettlement } from '#turn.machine.js';
import type { RevisionStatusProjection } from '#project-revisions.types.js';
import type { RevisionBranchFacet, RevisionConflictFacet } from '#project-revisions.types.js';
export type { RevisionBranchFacet, RevisionConflictFacet } from '#project-revisions.types.js';
export type { RevisionStatusProjection } from '#project-revisions.types.js';

/** What one checkout last reported about itself. @public */
export type CheckoutStatusEntry = Readonly<{ status: CheckoutStatus; headRevisionId: string | undefined }>;

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
   *
   * The same buffer holds an admission delayed by a held turn id (V8). An entry
   * leaves it when that turn retires and it is replayed, or when the host that
   * asked for it gives up and abandons its run — never on a timer of its own.
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
  /* `runId` names the run this verb is about. One turn id is held by one run
   * while the next run of the same message queues behind it (V8), so a verb
   * that carries it ends exactly that run — queued or spawned — and a verb
   * without it keeps the old meaning: whatever run holds the turn id. */
  | Readonly<{ type: 'turnAbandoned'; turnId: string; runId?: string }>
  | Readonly<{ type: 'release'; turnId: string; runId?: string }>
  | Readonly<{ type: 'leaseWritten'; checkoutId: string | undefined; runId: string }>
  | Readonly<{
      type: 'turnReleased';
      turnId: string;
      chatId: string;
      checkoutId: string | undefined;
      runId: string;
      outcome: TurnOutcome;
      reason?: string;
      code?: TurnFailureCode;
    }>
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  | Readonly<{ type: 'removalOffered'; checkoutId: string }>
  | Readonly<{ type: 'checkoutFailed'; operation: CheckoutOperation; reason: string; code?: RevisionPortErrorCode }>
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
  /** That file could not be opened for resolution, and why (C44). */
  | Readonly<{ type: 'conflictMaterializationFailed'; revisionId: string; path: string; reason: string }>
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
      /** Why it ended, when the machine had a reason to give. A diagnostic. */
      reason?: string;
      /** The same refusal as a category, which is what a page phrases (P4). */
      code?: TurnFailureCode;
    }>
  | Readonly<{
      type: 'switchResolved';
      branch: string;
      /** `reroot` moves the workbench; `applyToLive` asks for head(branch) on live. */
      mode: 'reroot' | 'applyToLive';
      checkoutId: string;
    }>
  | Readonly<{ type: 'switchRefused'; branch: string; reason: string }>
  /**
   * A second admission for a turn id this root still holds (R10).
   *
   * Ignoring it silently left its caller waiting out the whole admission bound
   * and then hearing that the turn was never leased — which names nothing
   * anybody can act on. Edit and retry reuse the first turn's message id as the
   * lease key, so this is the answer a chat gets when it re-admits a turn whose
   * previous actor is still retiring.
   */
  | Readonly<{
      type: 'turnRefused';
      turnId: string;
      chatId: string;
      runId: string;
      code: 'TURN_ALREADY_LEASED';
      reason: string;
    }>
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  | Readonly<{ type: 'removalOffered'; checkoutId: string }>
  /* P4: a refusal crosses as a code; the page that shows it owns the words. */
  | Readonly<{ type: 'checkoutFailed'; operation: CheckoutOperation; reason: string; code?: RevisionPortErrorCode }>
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
  /** That file could not be opened for resolution, and why (C44). */
  | Readonly<{ type: 'conflictMaterializationFailed'; revisionId: string; path: string; reason: string }>
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
 * The turn actor a turn-ending verb may reach.
 *
 * A verb that names no run keeps its original meaning — whatever run holds that
 * turn id. One that names a run may only end *that* run: a turn id is held by
 * one run while the next run of the same message queues behind it (V8), so
 * abandoning the queued one must not retire the running one's lease.
 *
 * @param context - The root's own context.
 * @param event - The `turnAbandoned` or `release` that arrived.
 * @returns The turn actor to forward to, or `undefined` when it names another run.
 */
const endingTurnRef = (
  context: ProjectRevisionsMachineContext,
  event: Readonly<{ turnId: string; runId?: string }>,
): ActorRefFrom<typeof turnMachine> | undefined => {
  const ref = context.turnRefs[event.turnId];
  return event.runId === undefined || ref?.getSnapshot().context.runId === event.runId ? ref : undefined;
};

type ProjectRevisionsEnqueue = EnqueueObject<
  ProjectRevisionsMachineEvent,
  ProjectRevisionsMachineEmitted,
  SystemRegistry,
  Readonly<{ resolution: typeof resolutionMachine; checkout: typeof checkoutMachine; turn: typeof turnMachine }>,
  Readonly<{
    checkouts?: ActorRefFrom<typeof checkoutsMachine>;
    restore?: ActorRefFrom<typeof restoreMachine>;
    remote?: ActorRefFrom<typeof remoteMachine>;
    branch?: ActorRefFrom<typeof branchMachine>;
    publish?: ActorRefFrom<typeof publishMachine>;
    sync?: ActorRefFrom<typeof syncMachine>;
  }>
>;
type ProjectRevisionsSelf = AnyActorRef;
type ProjectRevisionsPatch = Partial<ProjectRevisionsMachineContext>;

/* R12: every terminal state of a turn drops its ref, not just the two that
 * carry a settlement. */
const dropTurn = (
  context: ProjectRevisionsMachineContext,
  enq: ProjectRevisionsEnqueue,
  turnId: string,
): ProjectRevisionsPatch => {
  const ref = context.turnRefs[turnId];
  if (ref === undefined) {
    return {};
  }
  enq.stop(ref);
  for (const admission of context.pendingAdmissions) {
    if (admission.turnId === turnId) {
      enq.raise({ type: 'admitTurn', ...admission });
    }
  }
  return {
    turnRefs: Object.fromEntries(Object.entries(context.turnRefs).filter(([held]) => held !== turnId)),
    /* The hold this turn id had is over, so the admissions it delayed are
     * released with it — in arrival order (V8). */
    pendingAdmissions: context.pendingAdmissions.filter((admission) => admission.turnId !== turnId),
  };
};

/*
 * One `resolution` child per conflicted branch head (S33, A38).
 *
 * Spawned from the *records*, so a reload rebuilds exactly the cards the
 * store still justifies (I3), and stopped the moment a head stops being
 * conflicted — which is what `finish` and a second merge both do.
 */
const syncResolutions = (
  context: ProjectRevisionsMachineContext,
  enq: ProjectRevisionsEnqueue,
  self: ProjectRevisionsSelf,
): ProjectRevisionsPatch => {
  const wanted = new Map(
    context.checkouts
      .filter((checkout) => checkout.conflicted === true && checkout.headRevisionId !== undefined)
      .map((checkout) => [checkout.headRevisionId ?? '', checkout.branch]),
  );
  for (const [id, ref] of Object.entries(context.resolutionRefs)) {
    if (!wanted.has(id)) {
      enq.stop(ref);
    }
  }
  const kept = Object.fromEntries(Object.entries(context.resolutionRefs).filter(([id]) => wanted.has(id)));
  for (const [id, branch] of wanted) {
    kept[id] ??= enq.spawn('resolution', {
      id: `resolution:${id}`,
      input: {
        projectId: context.projectId,
        revisionId: id,
        ...(branch === undefined ? {} : { branch }),
        parentRef: self,
      },
    });
  }
  return { resolutionRefs: kept };
};

/*
 * A cut's answer goes to the turn that asked for it, or — when no turn
 * did — to the `branch` child, which may be recording the selected tree
 * before it makes a branch (P3). The child ignores what it did not ask for.
 */
const answerCut = (
  context: ProjectRevisionsMachineContext,
  enq: ProjectRevisionsEnqueue,
  event: Extract<ProjectRevisionsMachineEvent, { type: 'revisionMinted' | 'nothingToSave' | 'cutFailed' | 'casLost' }>,
): void => {
  if (event.turnId === undefined) {
    enq.sendTo('branch', event);
    return;
  }
  /* A turn whose ref has already gone is not the `branch` child's answer:
     the cut it asked for was that turn's (review finding 9). */
  const ref = context.turnRefs[event.turnId];
  if (ref !== undefined) {
    enq.sendTo(ref, event);
  }
};

/* Tell `restore` which checkout the workbench is rooted at now, and
 * `branch` which branch *Merge into `<current>`* means. */
const announceSelection = (context: ProjectRevisionsMachineContext, enq: ProjectRevisionsEnqueue): void => {
  enq.sendTo('restore', {
    type: 'selectCheckout',
    checkoutId: context.selectedCheckoutId ?? '',
    headRevisionId: selectedRecord(context)?.headRevisionId,
  });
  enq.sendTo('branch', { type: 'selectBranch', branch: selectedRecord(context)?.branch });
};

/* The admissions a registry answer releases: raised in arrival order, and the buffer emptied. */
const releaseAdmissions = (
  context: ProjectRevisionsMachineContext,
  enq: ProjectRevisionsEnqueue,
): ProjectRevisionsPatch => {
  for (const admission of context.pendingAdmissions) {
    enq.raise({ type: 'admitTurn', ...admission });
  }
  return { pendingAdmissions: [] };
};

/*
 * A turn's settlement: the registry retires its lease, the host hears it, and the root drops the ref.
 *
 * Forwarded verbatim, as it always was — `turnConflicted` included, which the
 * registry does not handle — so the registry is addressed as any actor.
 */
const settleTurn = (
  context: ProjectRevisionsMachineContext,
  enq: ProjectRevisionsEnqueue,
  registry: AnyActorRef | undefined,
  event: Extract<ProjectRevisionsMachineEvent, { type: 'turnFinalized' | 'turnConflicted' | 'turnReleased' }>,
) => {
  enq.sendTo(registry, event);
  enq.emit(event);
  return { context: dropTurn(context, enq, event.turnId) };
};

const bufferAdmission = (
  context: ProjectRevisionsMachineContext,
  event: Extract<ProjectRevisionsMachineEvent, { type: 'admitTurn' }>,
): ProjectRevisionsPatch => {
  const { type: _type, ...admission } = event;
  return { pendingAdmissions: [...context.pendingAdmissions, admission] };
};

const projectRevisionsMachineDefinition = setup({
  schemas: {
    context: types<ProjectRevisionsMachineContext>(),
    events: eventSchemas<ProjectRevisionsMachineEvent>(),
    emitted: eventSchemas<ProjectRevisionsMachineEmitted>(),
    input: types<ProjectRevisionsMachineInput>(),
    /* The invoked children by id, as v5 inferred them from `invoke`: selectors read their snapshots. */
    children: {
      checkouts: types<ActorRefFrom<typeof checkoutsMachine>>(),
      restore: types<ActorRefFrom<typeof restoreMachine>>(),
      remote: types<ActorRefFrom<typeof remoteMachine>>(),
      branch: types<ActorRefFrom<typeof branchMachine>>(),
      publish: types<ActorRefFrom<typeof publishMachine>>(),
      sync: types<ActorRefFrom<typeof syncMachine>>(),
    },
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
    turnIsNew: (context: ProjectRevisionsMachineContext, turnId: string) => context.turnRefs[turnId] === undefined,
    registryUnanswered: (context: ProjectRevisionsMachineContext) => !context.registrySettled,
    /*
     * V9: a run id is minted once per gesture and *is* the idempotency key, so
     * the same one arriving twice is a bug in the caller, never a queue.
     *
     * Read across every turn rather than the one the turn id happens to name: a
     * run id is also its lease's own key (`.tau/runs/<runId>.json`), so a second
     * turn admitted under it writes and retires the first turn's lease.
     */
    runIsAlreadyHeld: (context: ProjectRevisionsMachineContext, runId: string) =>
      Object.values(context.turnRefs).some((ref) => ref.getSnapshot().context.runId === runId),
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
      onSnapshot: {},
    },
    {
      id: 'restore',
      src: 'restore',
      input: ({ context, self }) => ({
        projectId: context.projectId,
        checkoutId: context.selectedCheckoutId ?? '',
        parentRef: self,
      }),
      onSnapshot: {},
    },
    {
      id: 'remote',
      src: 'remote',
      input: ({ context, self }) => ({ projectId: context.projectId, parentRef: self }),
      onSnapshot: {},
    },
    {
      id: 'branch',
      src: 'branch',
      input: ({ context, self }) => ({
        projectId: context.projectId,
        parentRef: self,
      }),
      onSnapshot: {},
    },
    {
      id: 'publish',
      src: 'publish',
      input: ({ context, self }) => ({ projectId: context.projectId, parentRef: self }),
      onSnapshot: {},
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
       * whatever it showed when the root last moved. No handler body: the
       * transition itself is the notification, and the host's own settled-value
       * filter (`sameStatus`) is what stops it becoming a repaint (A38, P28).
       */
      onSnapshot: {},
    },
  ],
  entry: (_, enq) => {
    enq.sendTo('checkouts', { type: 'open' });
  },
  exit: ({ context }, enq) => {
    for (const ref of Object.values(context.checkoutRefs)) {
      enq.stop(ref);
    }
    for (const ref of Object.values(context.turnRefs)) {
      enq.stop(ref);
    }
    for (const ref of Object.values(context.resolutionRefs)) {
      enq.stop(ref);
    }
    return { context: { checkoutRefs: {}, turnRefs: {}, resolutionRefs: {} } };
  },
  initial: 'ready',
  states: {
    ready: {
      on: {
        branchesFetched: { context: ({ event }) => ({ availableBranches: event.branches }) },
        checkoutsChanged: ({ context, event, self }, enq) => {
          const known = new Set(event.checkouts.map((checkout) => checkout.id));
          for (const [id, ref] of Object.entries(context.checkoutRefs)) {
            if (!known.has(id)) {
              enq.stop(ref);
              continue;
            }
            const previous = context.checkouts.find((checkout) => checkout.id === id);
            const next = event.checkouts.find((checkout) => checkout.id === id);
            if (
              previous?.headRevisionId !== next?.headRevisionId &&
              next?.headRevisionId !== undefined &&
              next.headTreeId !== undefined
            ) {
              enq.sendTo(ref, {
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
          const kept = Object.fromEntries(Object.entries(context.checkoutRefs).filter(([id]) => known.has(id)));
          for (const record of event.checkouts) {
            if (kept[record.id] !== undefined) {
              continue;
            }
            kept[record.id] = enq.spawn('checkout', {
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
            context.selectedCheckoutId !== undefined && known.has(context.selectedCheckoutId)
              ? context.selectedCheckoutId
              : liveId;
          let next: ProjectRevisionsMachineContext = {
            ...context,
            checkouts: event.checkouts,
            checkoutRefs: kept,
            chatCheckouts: Object.fromEntries(
              Object.entries(context.chatCheckouts).filter(([, checkoutId]) => known.has(checkoutId)),
            ),
            liveCheckoutId: liveId,
            selectedCheckoutId: selected,
          };
          /* R8: `restore`'s invoke input was evaluated before any record
           * existed, so the first registry it ever sees has to be announced,
           * and so does a head that moved under the selection. */
          const previousHead = context.checkouts.find(
            (checkout) => checkout.id === context.selectedCheckoutId,
          )?.headRevisionId;
          const nextHead = event.checkouts.find((checkout) => checkout.id === selected)?.headRevisionId;
          if (
            selected !== undefined &&
            (context.checkouts.length === 0 || selected !== context.selectedCheckoutId || nextHead !== previousHead)
          ) {
            announceSelection(next, enq);
          }
          /* One conflict card per conflicted head the records justify (S33). */
          next = { ...next, ...syncResolutions(next, enq, self) };
          /* `branch` delegated *New branch* and *Discard* to the registry, so
           * the registry's own answer is what settles them. */
          enq.sendTo('branch', {
            type: 'branchesChanged',
            branches: event.checkouts.flatMap((checkout) => (checkout.branch === undefined ? [] : [checkout.branch])),
            /* The records too, so a settled `create` knows which checkout it
               made without scraping the projection (P4). */
            checkouts: event.checkouts.flatMap((checkout) =>
              checkout.branch === undefined
                ? []
                : [{ branch: checkout.branch, checkoutId: checkout.id, checkoutRoot: checkout.root }],
            ),
          });
          next = { ...next, registrySettled: true };
          /* The registry has answered, so the turns that arrived before it
           * can be admitted onto checkouts that now have actors. */
          if (context.pendingAdmissions.length > 0 && event.checkouts.length > 0) {
            next = { ...next, ...releaseAdmissions(next, enq) };
          }
          return {
            context: {
              checkouts: next.checkouts,
              checkoutRefs: next.checkoutRefs,
              chatCheckouts: next.chatCheckouts,
              liveCheckoutId: next.liveCheckoutId,
              selectedCheckoutId: next.selectedCheckoutId,
              resolutionRefs: next.resolutionRefs,
              registrySettled: next.registrySettled,
              pendingAdmissions: next.pendingAdmissions,
            },
          };
        },
        checkoutStatusChanged: {
          context: ({ context, event }) => ({
            checkoutStatus: {
              ...context.checkoutStatus,
              [event.checkoutId]: { status: event.status, headRevisionId: event.headRevisionId },
            },
          }),
        },
        admitTurn: ({ context, event, guards, self }, enq) => {
          if (guards.registryUnanswered(context)) {
            return { context: bufferAdmission(context, event) };
          }
          if (guards.runIsAlreadyHeld(context, event.runId)) {
            enq.emit({
              type: 'turnRefused',
              turnId: event.turnId,
              chatId: event.chatId,
              runId: event.runId,
              code: 'TURN_ALREADY_LEASED',
              reason: 'This run has already taken this chat’s checkout.',
            });
            return {};
          }
          if (guards.turnIsNew(context, event.turnId)) {
            const ref = enq.spawn('turn', {
              id: `turn:${event.turnId}`,
              input: {
                turnId: event.turnId,
                chatId: event.chatId,
                runId: event.runId,
                ...(event.checkoutId === undefined ? {} : { checkoutId: event.checkoutId }),
                parentRef: self,
              },
            });
            return { context: { turnRefs: { ...context.turnRefs, [event.turnId]: ref } } };
          }
          /*
           * V8: a held turn id delays an admission inside its owner.
           *
           * An edit or a *Try again* leases the turn id of the message it
           * rewinds to, which is the id the previous run of that turn leased.
           * Refusing it outright put a banner in front of the person for a
           * condition that clears itself in well under a second — and no page
           * code read the code to recover from it. The root is what knows when
           * the hold ends, so the root is what waits.
           */
          return { context: bufferAdmission(context, event) };
        },
        turnPrepared: {
          context: ({ context, event }) => ({
            chatCheckouts: { ...context.chatCheckouts, [event.chatId]: event.checkoutId },
          }),
        },
        cut: ({ context, event }, enq) => {
          const ref = event.checkoutId === undefined ? undefined : context.checkoutRefs[event.checkoutId];
          if (ref === undefined) {
            /* R5: a dropped request is a turn that waits out its whole bound
             * and then fails with a timeout nobody can act on. */
            const reason = `This project has no checkout ${event.checkoutId ?? '(none named)'}.`;
            if (event.turnId === undefined) {
              /* The `branch` child asks for this cut before it branches, and
                 waited out its whole bound when nobody answered — a *New
                 branch* on a project with nothing selected (finding 10). */
              enq.sendTo('branch', {
                type: 'cutFailed',
                checkoutId: event.checkoutId,
                trigger: event.trigger,
                reason,
                code: 'CHECKOUT_UNKNOWN',
              });
              return {};
            }
            const turnRef = context.turnRefs[event.turnId];
            if (turnRef !== undefined) {
              enq.sendTo(turnRef, {
                type: 'cutFailed',
                trigger: event.trigger,
                turnId: event.turnId,
                reason,
              });
            }
            return {};
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
            enq.raise({
              type: 'nothingToSave',
              checkoutId: event.checkoutId ?? '',
              trigger: event.trigger,
            });
            return {};
          }
          enq.sendTo(ref, {
            type: 'cut',
            trigger: event.trigger,
            ...(event.turnId === undefined ? {} : { turnId: event.turnId }),
            leaseIds: event.leaseIds,
          });
          return {};
        },
        revisionMinted: ({ children, context, event }, enq) => {
          answerCut(context, enq, event);
          /* The scheduler hears about every revision this project mints, and
             nothing else decides when a push happens (D28, W13). A cut the
             root declined above never reaches here, so the durable queue can
             never record a phantom (W6-a2 R1). Verbatim, whatever its trigger,
             so the scheduler is addressed as any actor. */
          const scheduler: AnyActorRef | undefined = children.sync;
          enq.sendTo(scheduler, event);
          enq.emit(event);
          return {};
        },
        /* Re-emitted as well as routed (W6): a trigger-only cut — `save`,
         * `idle`, `hidden`, `close` — has no turn to answer, and its outcome is
         * exactly what *Nothing changed since Rev N* renders and what a host
         * quitting on a `close` flush waits for. */
        nothingToSave: ({ context, event }, enq) => {
          answerCut(context, enq, event);
          enq.emit(event);
          return {};
        },
        cutFailed: ({ context, event }, enq) => {
          answerCut(context, enq, event);
          enq.emit(event);
          return {};
        },
        casLost: ({ context, event }, enq) => {
          answerCut(context, enq, event);
          enq.emit(event);
          return {};
        },
        turnFinalized: ({ children, context, event }, enq) => settleTurn(context, enq, children.checkouts, event),
        turnConflicted: ({ children, context, event }, enq) => settleTurn(context, enq, children.checkouts, event),
        leaseStale: ({ event }, enq) => {
          enq.sendTo('checkouts', event);
          return {};
        },
        leaseWritten: ({ event }, enq) => {
          enq.sendTo('checkouts', event);
          return {};
        },
        turnReleased: ({ children, context, event }, enq) => settleTurn(context, enq, children.checkouts, event),
        /* R9: the host drives the tree through the root, so the root owns the
         * inbound routes as well as the outbound ones. */
        changed: ({ context, event }, enq) => {
          const ref = context.checkoutRefs[event.checkoutId];
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'changed', paths: event.paths, generation: event.generation });
          }
          return {};
        },
        turnCompleted: ({ context, event }, enq) => {
          const ref = context.turnRefs[event.turnId];
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'turnCompleted' });
          }
          return {};
        },
        /*
         * T4-02: a turn-ending verb reaches the queue as well as the ref.
         *
         * An admission whose caller stopped waiting is still queued behind the
         * turn id it is held by, and the root raised it anyway when that turn
         * retired: the turn it spawned took the checkout's lease with nothing
         * left to send it `turnCompleted`, so the checkout read as held for the
         * rest of the session, every manual save on it answered
         * `nothingToSave`, and every later edit of that message queued behind
         * it. A lease has no heartbeat by policy (§8), so the host giving up
         * *is* its liveness signal, and the run id is what tells the run that
         * gave up from the one still recording.
         */
        turnAbandoned: ({ context, event }, enq) => {
          const ref = endingTurnRef(context, event);
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'turnAbandoned' });
          }
          return event.runId === undefined
            ? {}
            : {
                context: {
                  pendingAdmissions: context.pendingAdmissions.filter((admission) => admission.runId !== event.runId),
                },
              };
        },
        /* The other half of the same verb, and the same queue rule. */
        release: ({ context, event }, enq) => {
          const ref = endingTurnRef(context, event);
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'release' });
          }
          return event.runId === undefined
            ? {}
            : {
                context: {
                  pendingAdmissions: context.pendingAdmissions.filter((admission) => admission.runId !== event.runId),
                },
              };
        },
        /* R11: registry facts a host has to show reach it through the root. */
        leaseRetired: ({ event }, enq) => {
          enq.emit(event);
          return {};
        },
        removalOffered: ({ event }, enq) => {
          enq.emit(event);
          return {};
        },
        checkoutFailed: ({ context, event }, enq) => {
          enq.emit(event);
          enq.sendTo('branch', {
            type: 'operationFailed',
            reason: event.reason,
            ...(event.code === undefined ? {} : { code: event.code }),
          });
          /* A registry that failed will never announce, so an admission held
           * for it would wait out its host's whole bound. Release the buffer
           * instead: the turn's own `prepare` is what refuses it, with the
           * reason — which is how a host refuses a run rather than running it
           * unrecorded (I-EDIT). */
          if (context.pendingAdmissions.length === 0) {
            return { context: { registrySettled: true } };
          }
          return { context: { registrySettled: true, ...releaseAdmissions(context, enq) } };
        },
        checkoutChanged: ({ context, event }, enq) => {
          const ref = context.checkoutRefs[event.checkoutId];
          if (ref !== undefined) {
            enq.sendTo(ref, {
              type: 'headChanged',
              revisionId: event.revisionId,
              treeId: event.treeId,
            });
          }
          return {
            context: {
              checkouts: context.checkouts.map((checkout) =>
                checkout.id === event.checkoutId
                  ? { ...checkout, headRevisionId: event.revisionId, branch: event.branch }
                  : checkout,
              ),
            },
          };
        },
        pinTo: ({ context, event }, enq) => {
          const patch = {
            selectedCheckoutId: event.checkoutId,
            follow: 'pinned',
            followedChatId: undefined,
          } satisfies ProjectRevisionsPatch;
          announceSelection({ ...context, ...patch }, enq);
          return { context: patch };
        },
        /* The root routes, it does not interpret: a host sends one verb per
         * surface and the child owns what the verb means (A38). */
        remote: ({ event }, enq) => {
          /* Replacing a destination first retires the old scheduler. An
           * in-flight request may finish against the old remote, but no
           * queued lease is allowed to wake up against the replacement. */
          if (event.event.type === 'connect') {
            enq.sendTo('sync', { type: 'remoteDisconnected' });
          }
          enq.sendTo('remote', event.event);
          return {};
        },
        branch: ({ context, event }, enq) => {
          if (event.event.type !== 'create') {
            enq.sendTo('branch', event.event);
            return {};
          }
          /* P3: a branch starts from what the person sees, and only the root
           * knows where they are standing. The sequence — record, then add —
           * is the child's; this names the selection it works from. */
          const selected = selectedRecord(context);
          const head =
            context.checkoutStatus[context.selectedCheckoutId ?? '']?.headRevisionId ?? selected?.headRevisionId;
          enq.sendTo('branch', {
            ...event.event,
            ...(context.selectedCheckoutId === undefined ? {} : { checkoutId: context.selectedCheckoutId }),
            ...(head === undefined ? {} : { head }),
          });
          return {};
        },
        publish: ({ event }, enq) => {
          enq.sendTo('publish', event.event);
          return {};
        },
        sync: ({ event }, enq) => {
          enq.sendTo('sync', event.event);
          return {};
        },
        /*
         * The conflict card's verbs, addressed to one conflicted revision (S33).
         *
         * By revision id, not by name: there is one child per conflicted
         * revision and a project can hold several at once — one per branch that
         * was merged and did not settle.
         */
        resolution: ({ context, event }, enq) => {
          const ref = context.resolutionRefs[event.revisionId];
          if (ref !== undefined) {
            enq.sendTo(ref, event.event);
          }
          return {};
        },
        resolutionChanged: {},
        /* The merge moved the source branch onto a conflicted revision, so the
         * registry is re-read; `syncResolutions` then spawns the child and the
         * *Needs resolution* card exists without anyone reopening the project.
         * Re-emitted too, because a verb that changed nothing a person can see
         * has to say so (A25) — the card says the rest. */
        remoteConnected: ({ event }, enq) => {
          enq.sendTo('sync', { type: 'remoteConnected', remote: event.name });
          return {};
        },
        remoteDisconnected: (_, enq) => {
          enq.sendTo('sync', { type: 'remoteDisconnected' });
          return {};
        },
        mergeConflicted: ({ event }, enq) => {
          enq.emit(event);
          enq.sendTo('checkouts', { type: 'open' });
          return {};
        },
        branchMerged: (_, enq) => {
          enq.sendTo('checkouts', { type: 'open' });
          return {};
        },
        /* The head moved off the conflicted revision, so the registry is re-read
         * and `syncResolutions` retires the child on the answer — one writer of
         * the ref table, exactly as `checkoutRefs` has one. */
        conflictResolved: ({ event }, enq) => {
          enq.emit({ type: 'conflictResolved', revisionId: event.revisionId, branch: event.branch });
          enq.sendTo('checkouts', { type: 'open' });
          /* And the scheduler, or the Sync row would still read `Needs
           * resolution` after the person composed the two lines: `conflicted`
           * otherwise leaves only on connectivity or a correlated `syncNow`
           * (W13 review 2 R6, P37). The branch is what W10's resolution
           * settled; `sync` matches it against the ref it recorded. */
          enq.sendTo('sync', {
            type: 'conflictResolved',
            revisionId: event.revisionId,
            ...(event.branch === undefined ? {} : { ref: `refs/heads/${event.branch}` }),
          });
          return {};
        },
        /* The marker text goes to the page that has an editor to show it in. */
        conflictMaterialized: ({ event }, enq) => {
          enq.emit(event);
          return {};
        },
        /* And so does its refusal: a surface that asked for a file learns that
         * nothing is coming from a fact, not from a timeout (C44). */
        conflictMaterializationFailed: ({ event }, enq) => {
          enq.emit(event);
          return {};
        },
        /* *Ask chat to resolve*: only a page or a CLI can start a chat, and both
         * hold the root (A38), so the request is re-emitted here. */
        turnRequested: ({ event }, enq) => {
          enq.emit(event);
          return {};
        },
        /* Verbatim to the machine that asked for the push, `outcome` included:
         * dropping it would let a failed or queued push publish a row for a
         * name the remote does not have (W8 review R3, P39). */
        /* The other half of that pair: the dialog asks the scheduler for its
         * push through here, because siblings speak through the parent (A38).
         * Without this edge `publish` could only declare its own success and
         * P39's three other outcomes were unreachable (W22 DEF-W22-2). */
        syncNow: ({ event }, enq) => {
          enq.sendTo('sync', {
            type: 'syncNow',
            pushId: event.pushId,
            ...(event.remote === undefined ? {} : { remote: event.remote }),
          });
          return {};
        },
        pushSettled: ({ event }, enq) => {
          enq.sendTo('publish', {
            type: 'pushSettled',
            pushId: event.pushId,
            outcome: event.outcome,
          });
          return {};
        },
        /* The registry's two verbs, which `branch` asks for through here
         * rather than opening a second writer of the same records. A router,
         * not a sequencer: what a new branch starts from is the `branch`
         * child's, which is the state machine that has the waits for it (P3). */
        addCheckout: ({ event }, enq) => {
          enq.sendTo('checkouts', event);
          return {};
        },
        removeCheckout: ({ event }, enq) => {
          enq.sendTo('checkouts', event);
          return {};
        },
        followChat: ({ context, event }, enq) => {
          const patch = {
            follow: 'chat',
            followedChatId: event.chatId,
            selectedCheckoutId: context.chatCheckouts[event.chatId] ?? context.liveCheckoutId,
          } satisfies ProjectRevisionsPatch;
          announceSelection({ ...context, ...patch }, enq);
          return { context: patch };
        },
        /* D10: one verb. Re-root when the branch has a checkout; otherwise apply
         * to the live checkout, but only while no lease holds it. */
        switch: ({ context, event }, enq) => {
          const linked = context.checkouts.find((checkout) => checkout.branch === event.branch);
          if (linked !== undefined) {
            const patch = {
              selectedCheckoutId: linked.id,
              follow: 'pinned',
              followedChatId: undefined,
            } satisfies ProjectRevisionsPatch;
            enq.emit({
              type: 'switchResolved',
              branch: event.branch,
              mode: 'reroot',
              checkoutId: linked.id,
            });
            announceSelection({ ...context, ...patch }, enq);
            return { context: patch };
          }
          const liveRecord = context.checkouts.find((checkout) => checkout.id === context.liveCheckoutId);
          if (liveRecord === undefined || liveRecord.leaseRunIds.length > 0) {
            enq.emit({
              type: 'switchRefused',
              branch: event.branch,
              reason:
                liveRecord === undefined
                  ? 'This project has no files open to move.'
                  : 'An agent is working in this project’s files.',
            });
            return {};
          }
          const patch = {
            selectedCheckoutId: liveRecord.id,
            follow: 'pinned',
            followedChatId: undefined,
          } satisfies ProjectRevisionsPatch;
          enq.emit({
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
          enq.sendTo('branch', {
            type: 'switch',
            branch: event.branch,
            mode: 'applyToLive',
            checkoutId: liveRecord.id,
          });
          announceSelection({ ...context, ...patch }, enq);
          return { context: patch };
        },
      },
    },
  },
});

type ProjectRevisionsMachineDefinition = typeof projectRevisionsMachineDefinition;

/**
 * The type of {@link projectRevisionsMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type -- a named alias of the inferred machine type
export interface ProjectRevisionsMachine extends ProjectRevisionsMachineDefinition {}

/**
 * Headless root of one project's revision actor tree.
 *
 * @public
 */
export const projectRevisionsMachine: ProjectRevisionsMachine = projectRevisionsMachineDefinition;

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
        reason: undefined,
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
