/**
 * `project-revisions.machine` — the root of one project's revision actor tree.
 *
 * A host creates exactly this actor. The always-on children of this wave
 * (`checkouts`, `restore`) are **invoked**, so they stop with the root; the
 * variable-count children (`checkout` per registered checkout, `turn` per
 * admitted attempt, keyed `${runId}/${attempt}`) are **spawned** with stored refs and stopped with `stopChild`
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
import type { PublishMachineEvent } from '#publish.machine.js';
import type { PublishFacet } from '#publish.types.js';
import { remoteMachine, selectRemoteFacet } from '#remote.machine.js';
import type { RemoteFacet, RemoteMachineEvent } from '#remote.types.js';
import type { RemoteKind } from '#remotes.js';
import { resolutionMachine, selectResolutionFacet } from '#resolution.machine.js';
import type { ResolutionMachineEvent } from '#resolution.machine.js';
import { restoreMachine, selectRestoreBusy, selectRestoreNeedsConfirmation } from '#restore.machine.js';
import { selectSyncFacet, syncMachine } from '#sync.machine.js';
import type { SyncMachineEvent } from '#sync.machine.js';
import type { SyncFacet, SyncPushOutcome } from '#sync.types.js';
import type { CheckoutRecord, RevisionPortErrorCode } from '#revision-port.js';
import { turnMachine } from '#turn.machine.js';
import type { TurnFailureCode, TurnOutcome, TurnSettlement } from '#turn.machine.js';
import type { TurnAttemptKey, TurnCutOf } from '#turn.types.js';
import type { RevisionStatusProjection, RevisionBranchFacet, RevisionConflictFacet } from '#project-revisions.types.js';

/** What one checkout last reported about itself: the root's only source of its branch and head (RM-R5). @public */
export type CheckoutStatusEntry = Readonly<{
  status: CheckoutStatus;
  branch: string | undefined;
  headRevisionId: string | undefined;
  headTreeId?: string | undefined;
}>;

/** What the root knows of one turn attempt, kept from the facts its actor sends (RM-R7). @public */
export type TurnFact = Readonly<{
  key: TurnAttemptKey;
  checkoutId: string | undefined;
  /** Admitted by today's commands: the root acknowledges it itself until W8's port does (RM-S9). */
  legacy: boolean;
  /** The attempt holds its lease and may be completed. */
  placed: boolean;
  /** The attempt announced its outcome and waits for `acknowledge`. */
  settled: boolean;
}>;

/** Input accepted when creating the projectRevisionsMachine actor. @public */
export type ProjectRevisionsMachineInput = Readonly<{
  projectId: string;
  /** The checkout that is the project directory itself. */
  liveCheckoutId?: string;
  selectedCheckoutId?: string;
}>;

type Admission = Readonly<{ key: TurnAttemptKey; checkoutId?: string; legacy?: true }>;

/** Serializable state owned by projectRevisionsMachine. @public */
export type ProjectRevisionsMachineContext = Readonly<{
  projectId: string;
  /** The registry's records; branch, head and head tree are read from `checkoutStatus` first (RM-R5). */
  checkouts: readonly CheckoutRecord[];
  /** Local branch refs learned from fetch that do not need a checkout yet. */
  availableBranches: ReadonlyArray<Readonly<{ name: string; head: string }>>;
  checkoutStatus: Readonly<Record<string, CheckoutStatusEntry>>;
  liveCheckoutId: string | undefined;
  selectedCheckoutId: string | undefined;
  follow: 'chat' | 'pinned';
  followedChatId: string | undefined;
  checkoutRefs: Readonly<Record<string, ActorRefFrom<typeof checkoutMachine>>>;
  /** One actor per attempt, by `${runId}/${attempt}` (D14). */
  turnRefs: Readonly<Record<string, ActorRefFrom<typeof turnMachine>>>;
  /** The facts each attempt's actor has sent, by the same id; transitions read these, never a child's snapshot (RM-R7). */
  turnFacts: Readonly<Record<string, TurnFact>>;
  /** Attempts this root retired or refused, by the same id, until the registry drops their run: never adopted again (I20). */
  retiredAttempts: readonly string[];
  /** One per conflicted revision the registry reports, by revision id (S33, A38). */
  resolutionRefs: Readonly<Record<string, ActorRefFrom<typeof resolutionMachine>>>;
  /** Which checkout each chat's last prepared turn landed on, for `followChat`. */
  chatCheckouts: Readonly<Record<string, string>>;
  /**
   * Admissions that arrived before the registry answered (W3c report §7.1).
   *
   * The root spawns a checkout actor from the registry's first announcement, so
   * a turn admitted before that would resolve a checkout no actor represents.
   * The root holds them here and replays them once the registry answers — with
   * or without checkouts, or failed (RM-R11) — and a turn's own `prepare`
   * refuses one it cannot place.
   */
  pendingAdmissions: readonly Admission[];
  /**
   * Whether the registry has answered at all — announced, or failed.
   *
   * Kept in the status projection until W8's TS-S5 deletes the attach's waits on it (RV9-F1).
   */
  registrySettled: boolean;
}>;

type CutAnswerFields = Readonly<{
  checkoutId: string;
  trigger: CheckoutCutTrigger;
  /** The requester's id; an `idle` mint has none (RM-R1). */
  requestId?: string;
  /** The attempt a turn's cut is for, which routes the answer to its actor. */
  turn?: TurnCutOf;
}>;

type TurnAnswer = Readonly<{ key: TurnAttemptKey }>;

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
      branch: string | undefined;
      headRevisionId?: string;
      headTreeId?: string;
    }>
  /* The host's turn verbs, keyed by attempt (D14). `legacy` marks today's commands (RM-S9). */
  | Readonly<{ type: 'admitTurn'; key: TurnAttemptKey; checkoutId?: string; legacy?: true }>
  | Readonly<{ type: 'turnCompleted'; key: TurnAttemptKey; legacy?: true }>
  | Readonly<{ type: 'turnAbandoned'; key: TurnAttemptKey; legacy?: true }>
  | Readonly<{ type: 'acknowledge'; key: TurnAttemptKey }>
  /* A cut names its request; a host's `save`, `hidden` and `close` mint their own id (RM-R1). */
  | Readonly<{
      type: 'cut';
      requestId: string;
      trigger: CheckoutCutTrigger;
      /** Absent for a trigger-only cut: `save`, `hidden` and `close` have no turn. */
      turn?: TurnCutOf;
      checkoutId: string | undefined;
      leaseIds: readonly string[];
    }>
  | Readonly<{ type: 'cancelCut'; requestId: string; checkoutId: string | undefined }>
  | (Readonly<{ type: 'revisionMinted'; revisionId: string; branch: string | undefined }> & CutAnswerFields)
  | (Readonly<{ type: 'nothingToSave'; heldBy?: TurnAttemptKey }> & CutAnswerFields)
  | (Readonly<{ type: 'cutFailed'; reason: string; code?: RevisionPortErrorCode | 'CHECKOUT_UNKNOWN' }> &
      CutAnswerFields)
  | (Readonly<{ type: 'casLost' }> & CutAnswerFields)
  | Readonly<{ type: 'cutCancelled'; checkoutId: string; requestId: string; turn?: TurnCutOf }>
  /* What a turn actor tells the root about itself. */
  | (Readonly<{ type: 'turnPrepared'; checkoutId: string; branch: string | undefined }> & TurnAnswer)
  | (Readonly<{
      type: 'leaseWritten';
      checkoutId: string | undefined;
      leaseIds: readonly string[];
      /** Other attempts' records on the checkout, each announced as `leaseHeld` (RM-R16). */
      held?: readonly TurnAttemptKey[];
    }> &
      TurnAnswer)
  | (Readonly<{
      type: 'turnPlaced';
      checkoutId: string | undefined;
      branch: string | undefined;
      baseRevisionId: string | undefined;
    }> &
      TurnAnswer)
  | (Readonly<{ type: 'turnCutRefused'; code?: TurnFailureCode; reason: string; cutFailures: number }> & TurnAnswer)
  | (Readonly<{ type: 'turnFinalized' }> & TurnSettlement)
  | (Readonly<{ type: 'turnConflicted' }> & TurnSettlement)
  | (Readonly<{
      type: 'turnReleased';
      turnId: string;
      chatId: string;
      checkoutId: string | undefined;
      runId: string;
      attempt: number;
      outcome: TurnOutcome;
      reason?: string;
      code?: TurnFailureCode;
      revisionId?: string;
    }> &
      TurnAnswer)
  | (Readonly<{ type: 'turnRefused'; code?: TurnFailureCode; reason?: string }> & TurnAnswer)
  | (Readonly<{ type: 'turnRetired'; checkoutId: string | undefined }> & TurnAnswer)
  | (Readonly<{ type: 'acknowledgeRefused'; code?: TurnFailureCode | 'REVISIONS_BUSY'; reason: string }> & TurnAnswer)
  | Readonly<{ type: 'leaseStale'; runId: string }>
  /* A producer's hint that a checkout moved: the checkout re-reads its head (RM-R5). */
  | Readonly<{
      type: 'checkoutChanged';
      checkoutId: string;
      revisionId?: string;
      treeId?: string;
      branch?: string | undefined;
    }>
  /* R9: the verb a host drives most. */
  | Readonly<{ type: 'changed'; checkoutId: string; paths: readonly string[]; generation: number }>
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  | Readonly<{ type: 'removalOffered'; checkoutId: string }>
  | Readonly<{
      type: 'checkoutFailed';
      operation: CheckoutOperation;
      reason: string;
      code?: RevisionPortErrorCode;
      requestId?: string;
    }>
  /* The registry's answers to `branch`'s delegated verbs, routed back by request id (RM-S8). */
  | Readonly<{ type: 'checkoutAdded'; requestId: string; checkout: CheckoutRecord }>
  | Readonly<{ type: 'checkoutRemoved'; requestId: string; checkoutId: string }>
  | Readonly<{ type: 'addCheckout'; requestId: string; branch: string; from: string }>
  | Readonly<{ type: 'removeCheckout'; requestId: string; id: string }>
  | Readonly<{ type: 'switch'; requestId: string; branch: string }>
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
  | (Readonly<{ type: 'revisionMinted'; revisionId: string; branch: string | undefined }> & CutAnswerFields)
  | (Readonly<{ type: 'nothingToSave'; heldBy?: TurnAttemptKey }> & CutAnswerFields)
  | (Readonly<{ type: 'cutFailed'; reason: string; code?: RevisionPortErrorCode | 'CHECKOUT_UNKNOWN' }> &
      CutAnswerFields)
  | (Readonly<{ type: 'casLost' }> & CutAnswerFields)
  | (Readonly<{ type: 'turnFinalized' }> & TurnSettlement)
  | (Readonly<{ type: 'turnConflicted' }> & TurnSettlement)
  /*
   * A turn that ran and recorded nothing.
   *
   * `failed` and `released` are outcomes a person can see — an agent whose
   * placement broke, a chat the user cancelled — and a host that only heard the
   * two settlements would show nothing at all (W5 report §9).
   */
  | Readonly<{
      type: 'turnReleased';
      key: TurnAttemptKey;
      turnId: string;
      chatId: string;
      checkoutId: string | undefined;
      runId: string;
      attempt: number;
      outcome: TurnOutcome;
      /** Why it ended, when the machine had a reason to give. A diagnostic. */
      reason?: string;
      /** The same refusal as a category, which is what a page phrases (P4). */
      code?: TurnFailureCode;
      /** A base the attempt minted before it was released. */
      revisionId?: string;
    }>
  /* The attempt is placed: its lease is held and its dirty base, if any, is minted (RM-S14). */
  | Readonly<{
      type: 'turnPlaced';
      key: TurnAttemptKey;
      checkoutId: string | undefined;
      branch: string | undefined;
      baseRevisionId: string | undefined;
    }>
  /* A completion's cut did not land; the attempt keeps its lease (RM-R13). */
  | Readonly<{
      type: 'turnCutRefused';
      key: TurnAttemptKey;
      code?: TurnFailureCode;
      reason: string;
      cutFailures: number;
    }>
  | Readonly<{ type: 'turnRetired'; key: TurnAttemptKey }>
  | Readonly<{
      type: 'acknowledgeRefused';
      key: TurnAttemptKey;
      code?: TurnFailureCode | 'REVISIONS_BUSY';
      reason: string;
    }>
  /* A lease held a checkout another request wanted (RM-R16). */
  | Readonly<{ type: 'leaseHeld'; key: TurnAttemptKey; checkoutId: string }>
  | Readonly<{
      type: 'switchResolved';
      requestId: string;
      branch: string;
      /** `reroot` moves the workbench; `applyToLive` asks for head(branch) on live. */
      mode: 'reroot' | 'applyToLive';
      checkoutId: string;
    }>
  | Readonly<{ type: 'switchRefused'; requestId: string; branch: string; reason: string }>
  /**
   * An admission refused before or after placement, or an attempt of a run another attempt holds.
   *
   * `turnId`, `chatId` and `runId` repeat the key for today's hosts.
   */
  | Readonly<{
      type: 'turnRefused';
      key: TurnAttemptKey;
      turnId: string;
      chatId: string;
      runId: string;
      code: TurnFailureCode | 'TURN_ALREADY_LEASED' | undefined;
      reason: string;
    }>
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  | Readonly<{ type: 'removalOffered'; checkoutId: string }>
  /* P4: a refusal crosses as a code; the page that shows it owns the words. */
  | Readonly<{
      type: 'checkoutFailed';
      operation: CheckoutOperation;
      reason: string;
      code?: RevisionPortErrorCode;
      requestId?: string;
    }>
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

/* One attempt's actor and fact id (D14). */
const attemptIdOf = (key: TurnAttemptKey): string => `${key.runId}/${String(key.attempt)}`;

/*
 * RM-R5: a record's branch, head and head tree are the checkout actor's own,
 * from its last status; the registry supplies every other field and seeds a
 * checkout it has not reported yet.
 */
const viewOf = (context: ProjectRevisionsMachineContext, record: CheckoutRecord): CheckoutRecord => {
  const status = context.checkoutStatus[record.id];
  if (status === undefined) {
    return record;
  }
  const { headRevisionId: _head, headTreeId: _tree, ...rest } = record;
  return {
    ...rest,
    branch: status.branch,
    ...(status.headRevisionId === undefined ? {} : { headRevisionId: status.headRevisionId }),
    ...(status.headTreeId === undefined ? {} : { headTreeId: status.headTreeId }),
  };
};

const viewsOf = (context: ProjectRevisionsMachineContext): readonly CheckoutRecord[] =>
  context.checkouts.map((record) => viewOf(context, record));

const selectedRecord = (context: ProjectRevisionsMachineContext): CheckoutRecord | undefined => {
  const record = context.checkouts.find((checkout) => checkout.id === context.selectedCheckoutId);
  return record === undefined ? undefined : viewOf(context, record);
};

/**
 * Which of this root's attempts is recording this checkout's bytes right now (W6-a2 R1).
 *
 * Only this root's own unsettled attempts: the registry's `leaseRunIds` lags
 * a retirement, and a trigger-only cut reads the lease records at mint time,
 * never a cached list (D10). Another window's or host's lease is the fresh
 * fence's to answer (`nothingToSave{heldBy}`, RM-R16). Read from root context
 * only (RM-R7).
 *
 * @param context - The root's own context.
 * @param checkoutId - The checkout a cut names.
 * @returns The attempt holding it, or `undefined`.
 */
const heldByTurn = (context: ProjectRevisionsMachineContext, checkoutId: string): TurnAttemptKey | undefined =>
  Object.values(context.turnFacts).find((fact) => fact.checkoutId === checkoutId && !fact.settled)?.key;

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
/*
 * Every root transition stays in `ready` and returns at most a patch. The
 * handlers' parameters and results are named because an inline handler's
 * types are expanded from the whole setup, once per handler, which overflows
 * declaration emit (TS7056; xstate-policy K-17).
 */
type RootTransition = Readonly<{ context?: ProjectRevisionsPatch }>;
type RootArgs<K extends ProjectRevisionsMachineEvent['type']> = Readonly<{
  context: ProjectRevisionsMachineContext;
  event: Extract<ProjectRevisionsMachineEvent, Readonly<{ type: K }>>;
  self: ProjectRevisionsSelf;
  children: Readonly<{ sync?: AnyActorRef }>;
  guards: Readonly<{
    registryUnanswered: (context: ProjectRevisionsMachineContext) => boolean;
    runHeldByOtherAttempt: (context: ProjectRevisionsMachineContext, key: TurnAttemptKey) => boolean;
  }>;
}>;

/* An attempt's actor and facts leave together, on `turnRetired` or `turnRefused`. */
const dropTurn = (
  context: ProjectRevisionsMachineContext,
  enq: ProjectRevisionsEnqueue,
  key: TurnAttemptKey,
): ProjectRevisionsPatch => {
  const id = attemptIdOf(key);
  const ref = context.turnRefs[id];
  if (ref !== undefined) {
    enq.stop(ref);
  }
  return {
    turnRefs: Object.fromEntries(Object.entries(context.turnRefs).filter(([held]) => held !== id)),
    turnFacts: Object.fromEntries(Object.entries(context.turnFacts).filter(([held]) => held !== id)),
    retiredAttempts: context.retiredAttempts.includes(id) ? context.retiredAttempts : [...context.retiredAttempts, id],
  };
};

/* Update one attempt's facts, if the root still knows it. */
const withFact = (
  context: ProjectRevisionsMachineContext,
  key: TurnAttemptKey,
  patch: Partial<TurnFact>,
): ProjectRevisionsPatch => {
  const id = attemptIdOf(key);
  const fact = context.turnFacts[id];
  return fact === undefined ? {} : { turnFacts: { ...context.turnFacts, [id]: { ...fact, ...patch } } };
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

type CutAnswer = Extract<
  ProjectRevisionsMachineEvent,
  { type: 'revisionMinted' | 'nothingToSave' | 'cutFailed' | 'casLost' | 'cutCancelled' }
>;

/*
 * A cut's answer goes to the attempt it names, or — when no turn asked — to
 * the `branch` child, which settles only on the id it asked under (RM-R1).
 */
const answerCut = (context: ProjectRevisionsMachineContext, enq: ProjectRevisionsEnqueue, event: CutAnswer): void => {
  if (event.turn === undefined) {
    if (event.type !== 'cutCancelled') {
      enq.sendTo('branch', event);
    }
    return;
  }
  const ref = context.turnRefs[attemptIdOf(event.turn.key)];
  if (ref === undefined) {
    return;
  }
  if (event.type !== 'cutFailed') {
    enq.sendTo(ref, event);
    return;
  }
  /* `CHECKOUT_UNKNOWN` is a branch verb's code; a turn phrases the store's own. */
  const { code, ...rest } = event;
  enq.sendTo(ref, { ...rest, ...(code === undefined || code === 'CHECKOUT_UNKNOWN' ? {} : { code }) });
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
 * A record naming this run, which a restarted root adopts into a new actor (RM-R14).
 * Never one this root retired itself: the registry lists the run until its own retirement lands.
 */
const leasedCheckoutOf = (context: ProjectRevisionsMachineContext, key: TurnAttemptKey): CheckoutRecord | undefined =>
  context.retiredAttempts.includes(attemptIdOf(key))
    ? undefined
    : context.checkouts.find((checkout) => checkout.leaseRunIds.includes(key.runId));

/* Spawn one attempt's actor, fresh or adopted, and record its facts. */
const spawnTurn = (
  context: ProjectRevisionsMachineContext,
  enq: ProjectRevisionsEnqueue,
  { self, admission }: Readonly<{ self: ProjectRevisionsSelf; admission: Admission }>,
): Readonly<{ ref: ActorRefFrom<typeof turnMachine>; patch: ProjectRevisionsPatch }> => {
  const { key } = admission;
  const adopt = leasedCheckoutOf(context, key);
  const id = attemptIdOf(key);
  const checkoutId = adopt?.id ?? admission.checkoutId;
  const ref = enq.spawn('turn', {
    id: `turn:${key.runId}:${String(key.attempt)}`,
    input: {
      key,
      ...(checkoutId === undefined ? {} : { checkoutId }),
      /* The record's own head bounds the search; the find effect reads it when this names none (RM-R14). */
      ...(adopt === undefined ? {} : { adopt: { checkoutId: adopt.id } }),
      parentRef: self,
    },
  });
  const fact: TurnFact = {
    key,
    checkoutId,
    legacy: admission.legacy === true,
    placed: adopt !== undefined,
    settled: false,
  };
  return {
    ref,
    patch: { turnRefs: { ...context.turnRefs, [id]: ref }, turnFacts: { ...context.turnFacts, [id]: fact } },
  };
};

/*
 * The actor a turn verb addresses: the live one, or one adopted from a lease
 * record a restarted root finds for the key (RM-R14). `undefined` when the
 * attempt has neither.
 */
const actorFor = (
  context: ProjectRevisionsMachineContext,
  enq: ProjectRevisionsEnqueue,
  { self, key, legacy }: Readonly<{ self: ProjectRevisionsSelf; key: TurnAttemptKey; legacy?: true }>,
): Readonly<{ ref: ActorRefFrom<typeof turnMachine> | undefined; patch: ProjectRevisionsPatch }> => {
  const ref = context.turnRefs[attemptIdOf(key)];
  if (ref !== undefined) {
    return { ref, patch: {} };
  }
  /* An adoption on today's command is acknowledged by the root, as its admission would have been (RM-S9). */
  return leasedCheckoutOf(context, key) === undefined
    ? { ref: undefined, patch: {} }
    : spawnTurn(context, enq, { self, admission: { key, ...(legacy === undefined ? {} : { legacy }) } });
};

/* A settlement reaches the host; a legacy attempt is acknowledged here, since today's commands send no `acknowledge` (RM-S10). */
const settleTurn = (
  context: ProjectRevisionsMachineContext,
  enq: ProjectRevisionsEnqueue,
  key: TurnAttemptKey,
): ProjectRevisionsPatch => {
  const fact = context.turnFacts[attemptIdOf(key)];
  const ref = context.turnRefs[attemptIdOf(key)];
  if (fact?.legacy === true && ref !== undefined) {
    enq.sendTo(ref, { type: 'acknowledge' });
  }
  return withFact(context, key, { settled: true });
};

const keyOf = (
  event: Readonly<{ turnId: string; chatId: string; runId: string; attempt: number }>,
): TurnAttemptKey => ({
  chatId: event.chatId,
  turnId: event.turnId,
  runId: event.runId,
  attempt: event.attempt,
});

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
    registryUnanswered: (context: ProjectRevisionsMachineContext) => !context.registrySettled,
    /*
     * V9, T4-hyp1: a run id is its lease's own key (`.tau/runs/<runId>.json`),
     * so another attempt of the run, or the run under another turn id, while
     * one is live would write and retire its record. Read from root context (RM-R7).
     */
    runHeldByOtherAttempt: (context: ProjectRevisionsMachineContext, key: TurnAttemptKey) =>
      Object.values(context.turnFacts).some(
        (fact) =>
          fact.key.runId === key.runId &&
          (fact.key.attempt !== key.attempt || fact.key.turnId !== key.turnId || fact.key.chatId !== key.chatId),
      ),
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
    turnFacts: {},
    retiredAttempts: [],
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
       * host may publish (W13). No handler body: the transition itself is the
       * notification, and the host's own settled-value filter (`sameStatus`)
       * is what stops it becoming a repaint (A38, P28).
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
        /*
         * RM-R5: the registry's records replace the root's; the head diff that
         * sent `headChanged` is gone, because a record's head is the registry's
         * read at `loading` and never newer than the checkout's own.
         */
        checkoutsChanged: (
          { context, event, self }: RootArgs<'checkoutsChanged'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          const { checkouts } = event;
          const known = new Set(checkouts.map((checkout) => checkout.id));
          for (const [id, ref] of Object.entries(context.checkoutRefs)) {
            if (!known.has(id)) {
              enq.stop(ref);
            }
          }
          /* W3b: the registry's `kind === 'live'` record *is* the live checkout;
           * `input.liveCheckoutId` remains the override (W3d). */
          const liveId = context.liveCheckoutId ?? checkouts.find((checkout) => checkout.kind === 'live')?.id;
          const kept = Object.fromEntries(Object.entries(context.checkoutRefs).filter(([id]) => known.has(id)));
          for (const record of checkouts) {
            if (kept[record.id] !== undefined) {
              continue;
            }
            /* The registry's head is spawn input only; the actor re-reads from then on (RM-R5). */
            kept[record.id] = enq.spawn('checkout', {
              id: `checkout:${record.id}`,
              input: {
                checkoutId: record.id,
                ...(record.branch === undefined ? {} : { branch: record.branch }),
                ...(record.headRevisionId === undefined ? {} : { headRevisionId: record.headRevisionId }),
                /* I5's left-hand side, so the first cut after a rehydration can be recognised as a no-op (R3). */
                ...(record.headTreeId === undefined ? {} : { headTreeId: record.headTreeId }),
                parentRef: self,
              },
            });
          }
          const selected =
            context.selectedCheckoutId !== undefined && known.has(context.selectedCheckoutId)
              ? context.selectedCheckoutId
              : liveId;
          const checkoutStatus = Object.fromEntries(
            Object.entries(context.checkoutStatus).filter(([id]) => known.has(id)),
          );
          let next: ProjectRevisionsMachineContext = {
            ...context,
            checkouts,
            checkoutStatus,
            checkoutRefs: kept,
            chatCheckouts: Object.fromEntries(
              Object.entries(context.chatCheckouts).filter(([, checkoutId]) => known.has(checkoutId)),
            ),
            liveCheckoutId: liveId,
            selectedCheckoutId: selected,
          };
          /* R8: `restore`'s invoke input was evaluated before any record existed, so the first registry is announced. */
          if (
            selected !== undefined &&
            (context.checkouts.length === 0 ||
              selected !== context.selectedCheckoutId ||
              selectedRecord(next)?.headRevisionId !== selectedRecord(context)?.headRevisionId)
          ) {
            announceSelection(next, enq);
          }
          /* One conflict card per conflicted head the records justify (S33). */
          next = { ...next, ...syncResolutions(next, enq, self), registrySettled: true };
          /* RM-R11: the registry answered, with or without checkouts, so the admissions it held are released. */
          if (context.pendingAdmissions.length > 0) {
            next = { ...next, ...releaseAdmissions(next, enq) };
          }
          /* A retired attempt is remembered only while the registry still lists its run. */
          const listed = new Set(checkouts.flatMap((checkout) => checkout.leaseRunIds));
          return {
            context: {
              retiredAttempts: context.retiredAttempts.filter((id) => listed.has(id.slice(0, id.lastIndexOf('/')))),
              checkouts: next.checkouts,
              checkoutStatus: next.checkoutStatus,
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
        /* RM-R5: the checkout's own report is the root's branch and head for it. */
        checkoutStatusChanged: (
          { context, event }: RootArgs<'checkoutStatusChanged'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          const next = {
            ...context,
            checkoutStatus: {
              ...context.checkoutStatus,
              [event.checkoutId]: {
                status: event.status,
                branch: event.branch,
                headRevisionId: event.headRevisionId,
                headTreeId: event.headTreeId,
              },
            },
          };
          const before = selectedRecord(context);
          const after = selectedRecord(next);
          if (
            event.checkoutId === context.selectedCheckoutId &&
            (before?.headRevisionId !== after?.headRevisionId || before?.branch !== after?.branch)
          ) {
            announceSelection(next, enq);
          }
          return { context: { checkoutStatus: next.checkoutStatus } };
        },
        admitTurn: (
          { context, event, guards, self }: RootArgs<'admitTurn'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          if (guards.registryUnanswered(context)) {
            const { type: _type, ...admission } = event;
            return { context: { pendingAdmissions: [...context.pendingAdmissions, admission] } };
          }
          if (guards.runHeldByOtherAttempt(context, event.key)) {
            enq.emit({
              type: 'turnRefused',
              key: event.key,
              turnId: event.key.turnId,
              chatId: event.key.chatId,
              runId: event.key.runId,
              code: 'TURN_ALREADY_LEASED',
              reason: 'Another attempt of this run already holds its lease.',
            });
            return {};
          }
          const fact = context.turnFacts[attemptIdOf(event.key)];
          if (fact !== undefined) {
            /* TS-R2: a replayed admission is answered by the attempt it names, never a second actor. */
            if (fact.placed) {
              enq.emit({
                type: 'turnPlaced',
                key: fact.key,
                checkoutId: fact.checkoutId,
                branch: undefined,
                baseRevisionId: undefined,
              });
            }
            return {};
          }
          const { type: _type, ...admission } = event;
          return { context: spawnTurn(context, enq, { self, admission }).patch };
        },
        turnCompleted: (
          { context, event, self }: RootArgs<'turnCompleted'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          const { ref, patch } = actorFor(context, enq, {
            self,
            key: event.key,
            ...(event.legacy === undefined ? {} : { legacy: event.legacy }),
          });
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'turnCompleted' });
          }
          return { context: patch };
        },
        /*
         * T4-02: a turn-ending verb reaches the queue as well as the actor: an
         * admission whose caller stopped waiting must not be replayed later and
         * take a lease nothing will complete.
         */
        turnAbandoned: (
          { context, event, self }: RootArgs<'turnAbandoned'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          const { ref, patch } = actorFor(context, enq, {
            self,
            key: event.key,
            ...(event.legacy === undefined ? {} : { legacy: event.legacy }),
          });
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'turnAbandoned' });
          }
          const id = attemptIdOf(event.key);
          return {
            context: {
              ...patch,
              pendingAdmissions: context.pendingAdmissions.filter((admission) => attemptIdOf(admission.key) !== id),
            },
          };
        },
        /* RM-R10: the host recorded the settlement. With no actor, the record is dropped by the registry (TS-R5). */
        acknowledge: ({ context, event }: RootArgs<'acknowledge'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          const ref = context.turnRefs[attemptIdOf(event.key)];
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'acknowledge' });
            return {};
          }
          /* The registry retires the record only when it names this attempt and holder (TS-R5). */
          enq.sendTo('checkouts', { type: 'turnEnded', key: event.key, checkoutId: undefined });
          enq.emit({ type: 'turnRetired', key: event.key });
          return {};
        },
        turnPrepared: ({ context, event }: RootArgs<'turnPrepared'>): RootTransition => ({
          context: {
            chatCheckouts: { ...context.chatCheckouts, [event.key.chatId]: event.checkoutId },
            ...withFact(context, event.key, { checkoutId: event.checkoutId }),
          },
        }),
        leaseWritten: ({ event }: RootArgs<'leaseWritten'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('checkouts', { type: 'leaseWritten', checkoutId: event.checkoutId, runId: event.key.runId });
          /* RM-R16: a placement that lists another attempt's record says so. */
          for (const key of event.held ?? []) {
            enq.emit({ type: 'leaseHeld', key, checkoutId: event.checkoutId ?? '' });
          }
          return {};
        },
        leaseStale: ({ event }: RootArgs<'leaseStale'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('checkouts', event);
          return {};
        },
        turnPlaced: ({ context, event }: RootArgs<'turnPlaced'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.emit(event);
          return { context: withFact(context, event.key, { placed: true, checkoutId: event.checkoutId }) };
        },
        /* RM-R13: a legacy attempt gives up on a refused cut, so it settles `failed` as it did before W5. */
        turnCutRefused: (
          { context, event }: RootArgs<'turnCutRefused'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          enq.emit(event);
          const ref = context.turnRefs[attemptIdOf(event.key)];
          if (context.turnFacts[attemptIdOf(event.key)]?.legacy === true && ref !== undefined) {
            enq.sendTo(ref, { type: 'turnAbandoned' });
          }
          return {};
        },
        turnFinalized: (
          { context, event }: RootArgs<'turnFinalized'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          enq.emit(event);
          return { context: settleTurn(context, enq, keyOf(event)) };
        },
        turnConflicted: (
          { context, event }: RootArgs<'turnConflicted'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          enq.emit(event);
          return { context: settleTurn(context, enq, keyOf(event)) };
        },
        turnReleased: ({ context, event }: RootArgs<'turnReleased'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.emit(event);
          return { context: settleTurn(context, enq, event.key) };
        },
        /* RM-R10: the lease is retired, so the registry drops it and the actor leaves (L7 P-1). */
        turnRetired: ({ context, event }: RootArgs<'turnRetired'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('checkouts', { type: 'turnEnded', key: event.key, checkoutId: event.checkoutId });
          enq.emit({ type: 'turnRetired', key: event.key });
          return { context: dropTurn(context, enq, event.key) };
        },
        /* TS-R1: a refusal after the record retired it first; the registry's drop is idempotent either way. */
        turnRefused: ({ context, event }: RootArgs<'turnRefused'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          const checkoutId = context.turnFacts[attemptIdOf(event.key)]?.checkoutId;
          enq.sendTo('checkouts', { type: 'turnEnded', key: event.key, checkoutId });
          enq.emit({
            type: 'turnRefused',
            key: event.key,
            turnId: event.key.turnId,
            chatId: event.key.chatId,
            runId: event.key.runId,
            code: event.code,
            reason: event.reason ?? 'This turn could not be placed.',
          });
          return { context: dropTurn(context, enq, event.key) };
        },
        acknowledgeRefused: (
          { event }: RootArgs<'acknowledgeRefused'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          enq.emit(event);
          return {};
        },
        cut: ({ context, event }: RootArgs<'cut'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          const ref = event.checkoutId === undefined ? undefined : context.checkoutRefs[event.checkoutId];
          const turn = event.turn === undefined ? {} : { turn: event.turn };
          if (ref === undefined) {
            /* R5: an unanswered request is a requester that waits forever, so it is answered by id (RM-R11). */
            const failure = {
              type: 'cutFailed',
              checkoutId: event.checkoutId ?? '',
              trigger: event.trigger,
              requestId: event.requestId,
              ...turn,
              reason: `This project has no checkout ${event.checkoutId ?? '(none named)'}.`,
              code: 'CHECKOUT_UNKNOWN',
            } as const;
            answerCut(context, enq, failure);
            /* A host's own save or close waits on the emitted answer; a branch verb's recording cut is its own. */
            if (event.turn === undefined && event.trigger !== 'switch') {
              enq.emit(failure);
            }
            return {};
          }
          /*
           * A trigger-only cut never takes a running turn's bytes (a2 R1): the
           * attempt is already recording them, so the honest answer is the one
           * an unchanged tree gets, naming the attempt that holds it (RM-R16).
           */
          if (event.turn === undefined) {
            const heldBy = heldByTurn(context, event.checkoutId ?? '');
            if (heldBy !== undefined) {
              enq.raise({
                type: 'nothingToSave',
                checkoutId: event.checkoutId ?? '',
                trigger: event.trigger,
                requestId: event.requestId,
                heldBy,
              });
              return {};
            }
          }
          enq.sendTo(ref, {
            type: 'cut',
            requestId: event.requestId,
            trigger: event.trigger,
            ...turn,
            leaseIds: event.leaseIds,
          });
          return {};
        },
        /* RM-R4: a released attempt withdraws its queued cut; the checkout answers either way. */
        cancelCut: ({ context, event }: RootArgs<'cancelCut'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          const ref = event.checkoutId === undefined ? undefined : context.checkoutRefs[event.checkoutId];
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'cancelCut', requestId: event.requestId });
          }
          return {};
        },
        revisionMinted: (
          { children, context, event }: RootArgs<'revisionMinted'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          answerCut(context, enq, event);
          /* The scheduler hears every revision this project mints, with its branch, and nothing else decides when a push happens (D28, RM-S3). */
          const scheduler: AnyActorRef | undefined = children.sync;
          enq.sendTo(scheduler, {
            type: 'revisionMinted',
            checkoutId: event.checkoutId,
            trigger: event.trigger,
            revisionId: event.revisionId,
            branch: event.branch,
          });
          enq.emit(event);
          return {};
        },
        /* Re-emitted as well as routed (W6): a host's `save` and `close` wait for their own id here. */
        nothingToSave: (
          { context, event }: RootArgs<'nothingToSave'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          answerCut(context, enq, event);
          if (event.heldBy !== undefined) {
            enq.emit({ type: 'leaseHeld', key: event.heldBy, checkoutId: event.checkoutId });
          }
          enq.emit(event);
          return {};
        },
        cutFailed: ({ context, event }: RootArgs<'cutFailed'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          answerCut(context, enq, event);
          enq.emit(event);
          return {};
        },
        casLost: ({ context, event }: RootArgs<'casLost'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          answerCut(context, enq, event);
          enq.emit(event);
          return {};
        },
        cutCancelled: ({ context, event }: RootArgs<'cutCancelled'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          answerCut(context, enq, event);
          return {};
        },
        /* R9: the host drives the tree through the root, so the root owns the inbound routes as well as the outbound ones. */
        changed: ({ context, event }: RootArgs<'changed'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          const ref = context.checkoutRefs[event.checkoutId];
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'changed', paths: event.paths, generation: event.generation });
          }
          return {};
        },
        /* R11: registry facts a host has to show reach it through the root. */
        leaseRetired: ({ event }: RootArgs<'leaseRetired'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.emit(event);
          return {};
        },
        removalOffered: ({ event }: RootArgs<'removalOffered'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.emit(event);
          return {};
        },
        checkoutAdded: ({ event }: RootArgs<'checkoutAdded'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('branch', {
            type: 'checkoutAdded',
            requestId: event.requestId,
            checkoutId: event.checkout.id,
            checkoutRoot: event.checkout.root,
          });
          return {};
        },
        checkoutRemoved: ({ event }: RootArgs<'checkoutRemoved'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('branch', { type: 'checkoutRemoved', requestId: event.requestId });
          return {};
        },
        checkoutFailed: (
          { context, event }: RootArgs<'checkoutFailed'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          enq.emit(event);
          enq.sendTo('branch', {
            type: 'operationFailed',
            ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
            reason: event.reason,
            ...(event.code === undefined ? {} : { code: event.code }),
          });
          /* A registry that failed will never announce, so an admission held for
           * it is released; the turn's own `prepare` refuses it (I-EDIT). */
          if (context.pendingAdmissions.length === 0) {
            return { context: { registrySettled: true } };
          }
          return { context: { registrySettled: true, ...releaseAdmissions(context, enq) } };
        },
        /* RM-R5: a producer's fact is a hint; the checkout re-reads and reports its own head. */
        checkoutChanged: (
          { context, event }: RootArgs<'checkoutChanged'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          const ref = context.checkoutRefs[event.checkoutId];
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'headMoved' });
          }
          return {};
        },
        pinTo: ({ context, event }: RootArgs<'pinTo'>, enq: ProjectRevisionsEnqueue): RootTransition => {
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
        remote: ({ event }: RootArgs<'remote'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          /* Replacing a destination first retires the old scheduler. */
          if (event.event.type === 'connect') {
            enq.sendTo('sync', { type: 'remoteDisconnected' });
          }
          enq.sendTo('remote', event.event);
          return {};
        },
        branch: ({ context, event }: RootArgs<'branch'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          if (event.event.type !== 'create') {
            enq.sendTo('branch', event.event);
            return {};
          }
          /* P3: a branch starts from what the person sees, and only the root knows where they are standing. */
          const head = selectedRecord(context)?.headRevisionId;
          enq.sendTo('branch', {
            ...event.event,
            ...(context.selectedCheckoutId === undefined ? {} : { checkoutId: context.selectedCheckoutId }),
            ...(head === undefined ? {} : { head }),
          });
          return {};
        },
        publish: ({ event }: RootArgs<'publish'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('publish', event.event);
          return {};
        },
        sync: ({ event }: RootArgs<'sync'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('sync', event.event);
          return {};
        },
        /* The conflict card's verbs, addressed to one conflicted revision (S33). */
        resolution: ({ context, event }: RootArgs<'resolution'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          const ref = context.resolutionRefs[event.revisionId];
          if (ref !== undefined) {
            enq.sendTo(ref, event.event);
          }
          return {};
        },
        resolutionChanged: {},
        remoteConnected: ({ event }: RootArgs<'remoteConnected'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('sync', { type: 'remoteConnected', remote: event.name });
          return {};
        },
        remoteDisconnected: (_, enq) => {
          enq.sendTo('sync', { type: 'remoteDisconnected' });
          return {};
        },
        /* The merge moved the source branch onto a conflicted revision, so the registry is re-read (P41). */
        mergeConflicted: ({ event }: RootArgs<'mergeConflicted'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.emit(event);
          enq.sendTo('checkouts', { type: 'open' });
          return {};
        },
        branchMerged: (_, enq) => {
          enq.sendTo('checkouts', { type: 'open' });
          return {};
        },
        /* The head moved off the conflicted revision, so the registry is re-read
         * and `syncResolutions` retires the child on the answer. */
        conflictResolved: ({ event }: RootArgs<'conflictResolved'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.emit({ type: 'conflictResolved', revisionId: event.revisionId, branch: event.branch });
          enq.sendTo('checkouts', { type: 'open' });
          /* And the scheduler, or the Sync row would still read `Needs resolution` (W13 review 2 R6, P37). */
          enq.sendTo('sync', {
            type: 'conflictResolved',
            revisionId: event.revisionId,
            ...(event.branch === undefined ? {} : { ref: `refs/heads/${event.branch}` }),
          });
          return {};
        },
        conflictMaterialized: (
          { event }: RootArgs<'conflictMaterialized'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          enq.emit(event);
          return {};
        },
        conflictMaterializationFailed: (
          { event }: RootArgs<'conflictMaterializationFailed'>,
          enq: ProjectRevisionsEnqueue,
        ): RootTransition => {
          enq.emit(event);
          return {};
        },
        /* *Ask chat to resolve*: only a page or a CLI can start a chat, and both hold the root (A38). */
        turnRequested: ({ event }: RootArgs<'turnRequested'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.emit(event);
          return {};
        },
        /* The dialog asks the scheduler for its push through here, because siblings speak through the parent (A38). */
        syncNow: ({ event }: RootArgs<'syncNow'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('sync', {
            type: 'syncNow',
            pushId: event.pushId,
            ...(event.remote === undefined ? {} : { remote: event.remote }),
          });
          return {};
        },
        /* Verbatim to the machine that asked for the push, `outcome` included (W8 review R3, P39). */
        pushSettled: ({ event }: RootArgs<'pushSettled'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('publish', {
            type: 'pushSettled',
            pushId: event.pushId,
            outcome: event.outcome,
          });
          return {};
        },
        /* The registry's two verbs, which `branch` asks for through here rather than opening a second writer (P3). */
        addCheckout: ({ event }: RootArgs<'addCheckout'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('checkouts', event);
          return {};
        },
        removeCheckout: ({ event }: RootArgs<'removeCheckout'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          enq.sendTo('checkouts', event);
          return {};
        },
        followChat: ({ context, event }: RootArgs<'followChat'>, enq: ProjectRevisionsEnqueue): RootTransition => {
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
        switch: ({ context, event }: RootArgs<'switch'>, enq: ProjectRevisionsEnqueue): RootTransition => {
          const linked = viewsOf(context).find((checkout) => checkout.branch === event.branch);
          if (linked !== undefined) {
            const patch = {
              selectedCheckoutId: linked.id,
              follow: 'pinned',
              followedChatId: undefined,
            } satisfies ProjectRevisionsPatch;
            enq.emit({
              type: 'switchResolved',
              requestId: event.requestId,
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
              requestId: event.requestId,
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
            requestId: event.requestId,
            branch: event.branch,
            mode: 'applyToLive',
            checkoutId: liveRecord.id,
          });
          /* The resolution is not the application: `branch.machine` owns the
             verb's lifecycle, under the same request id (A38, I20; RM-R1). */
          enq.sendTo('branch', {
            type: 'switch',
            requestId: event.requestId,
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
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
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
  const selected = selectedRecord(context);
  const status =
    context.selectedCheckoutId === undefined ? undefined : context.checkoutStatus[context.selectedCheckoutId];
  return {
    projectId: context.projectId,
    checkoutId: context.selectedCheckoutId,
    checkoutRoot: selected?.root,
    branch: selected?.branch,
    registrySettled: context.registrySettled,
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
  const checkedOut = viewsOf(context).flatMap((checkout) =>
    checkout.branch === undefined
      ? []
      : [
          {
            name: checkout.branch,
            /* The live child's head first, as `headRevisionId` reads it: the
               registry record lags a save, and the row then counted the
               branch behind itself (D47). */
            head: context.checkoutStatus[checkout.id]?.headRevisionId ?? checkout.headRevisionId,
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
