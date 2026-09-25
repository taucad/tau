/**
 * `turn.machine` — one actor per turn attempt, from placement to retired lease.
 *
 * It replaces the provider's prepare/finalize promise chain and the Node host's
 * per-run placement maps with one host-neutral lifecycle, and it refines
 * `specs/turn/TurnProtocol.tla` with every W5 knob at its target value.
 *
 * - **The attempt is the key** (D14, RM-R1). The actor serves one
 *   `TurnAttemptKey`; every fact it sends names it, and the cuts it asks for
 *   carry request ids derived from it. An answer to another id is ignored.
 * - **The record comes first** (RM-R12). Placement writes the lease record,
 *   holds the live-tree lease, and only then asks its checkout for the dirty
 *   base. A refusal after the record retires it before it is answered
 *   (`refusing`).
 * - **A release waits** (RM-R4). A release while an effect runs or a cut is
 *   asked is recorded, the cut is withdrawn with `cancelCut`, and the attempt
 *   leaves only when that effect or cut answers.
 * - **Settled until acknowledged** (RM-R10). The outcome is announced on
 *   entering `settled`, and the lease stays until `acknowledge`; a failed
 *   retirement refuses the acknowledgement and stays `settled`.
 * - **Every completion cuts** (RM-R13). A capture, merge or cut failure answers
 *   `turnCutRefused` (`CUT_FAILED`) and keeps the lease; a lost
 *   compare-and-swap first looks for the attempt's own result (find-or-cut,
 *   RM-R14), and an actor adopted from a lease record runs the same search
 *   before it serves a verb.
 *
 * It does **not** mint: it sends `cut` to the parent, which routes it to the
 * checkout, the only minter (F2). The live-tree lease is a callback actor whose
 * refusal arrives as `leaseRefused`, never as `onError` (F6).
 */

import { createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type { AnyActorRef, AnyEventObject, EnqueueObject, SnapshotFrom } from 'xstate';

import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';
import type { RevisionPortErrorCode } from '#revision-port.js';
import type { TurnAttemptKey, TurnCut, TurnLease } from '#turn.types.js';

/**
 * How many times a turn looks for its result and re-cuts after losing the head's compare-and-swap (D24).
 *
 * One. The checkout re-reads the head before it answers `casLost`, so one
 * re-ask records onto what is there now; a second loss is contention this
 * attempt cannot win by trying harder, and it answers `CUT_FAILED` with
 * `CAS_LOST`, keeping its lease for the host to retry (RM-R13).
 *
 * @public
 */
export const turnCasRetryLimit = 1;

/** How one turn ended. @public */
export type TurnOutcome = 'finalized' | 'conflicted' | 'released' | 'failed';

/**
 * Why a turn failed or was refused, as a page can act on it (P4).
 *
 * A refusal crosses every boundary as a code and the page owns the words
 * (`apps/ui/app/lib/revision-failure-copy.ts`), so the sentences here are
 * diagnostics for a console and a test, never copy. The port's own categories
 * are included because most of what fails a turn is the store refusing. The
 * turn's own: a contended head (`CAS_LOST`), a live tree somebody else holds
 * (`LEASE_UNAVAILABLE`), and a dirty base that could not be recorded
 * (`BASE_CUT_FAILED`).
 *
 * A failure nothing classified carries no code at all, and the page falls back
 * per subject rather than showing a sentence a person cannot act on (E5).
 *
 * @public
 */
export type TurnFailureCode = RevisionPortErrorCode | 'BASE_CUT_FAILED' | 'CAS_LOST' | 'LEASE_UNAVAILABLE';

/* What the attempt holds while its record exists: the checkout, and the head find-or-cut stops at. */
type TurnLeaseHold = Pick<TurnLease, 'checkoutId' | 'headRevisionId'>;

/** Input accepted when creating the turnMachine actor. @public */
export type TurnMachineInput = Readonly<{
  /** The attempt this actor serves; its actor id is `turn:${runId}:${attempt}`. */
  key: TurnAttemptKey;
  /** The chat's checkout when it already has one; otherwise placement resolves it. */
  checkoutId?: string;
  /** The `project-revisions` root, which routes `cut` and its outcome. */
  parentRef?: AnyActorRef;
  /** A lease record a restarted root adopts: the actor finds its revisions before it serves a verb (RM-R14). */
  adopt?: Pick<TurnLease, 'checkoutId' | 'headRevisionId'>;
}>;

/** Serializable state owned by turnMachine; `lease` is per-state context while the record exists (MC-R26). @public */
export type TurnMachineContext = Readonly<{
  key: TurnAttemptKey;
  checkoutId: string | undefined;
  branch: string | undefined;
  /** What the attempt builds on: the head placement found, or the base it minted. */
  baseRevisionId: string | undefined;
  /** The dirty base this attempt minted, kept apart from the head it descends from; a release names it. */
  mintedBaseRevisionId: string | undefined;
  /** Run ids of every lease on this turn's checkout, as the lease writer saw them. */
  leaseIds: readonly string[];
  /** Opaque handle to the captured turn tree the host is holding. */
  captureId: string | undefined;
  /** Set when `turnCompleted` arrived before the attempt was placed (R6). */
  completionRequested: boolean;
  /** How many times this completion has already looked again after losing the CAS (D24). */
  casRetries: number;
  /** The sequence the next cut's request id takes, so a stale answer names an older id. */
  cutSequence: number;
  /** True when placement found the checkout's tree differs from its head, so a base is minted (D17). */
  dirtyBase: boolean;
  /** A release arrived while an effect or cut was outstanding (RM-R4). */
  releasing: boolean;
  /** The attempt holds its lease and may be completed. */
  placed: boolean;
  /** The result an adopted attempt found of its own, so a completion settles without a cut (RM-R14). */
  foundRevisionId: string | undefined;
  /** Consecutive `CUT_FAILED` answers since the attempt last settled (TS-Q9). */
  cutFailures: number;
  revisionId: string | undefined;
  outcome: TurnOutcome | undefined;
  /** The diagnostic: a console reads it, a person never does (E5). */
  reason: string | undefined;
  /** What the failure was, for the page that has to phrase it (P4). */
  code: TurnFailureCode | undefined;
  /** The record a restarted root handed this actor, read once at start. */
  adopt: Pick<TurnLease, 'checkoutId' | 'headRevisionId'> | undefined;
  parentRef: AnyActorRef | undefined;
}>;

/** Events accepted by turnMachine; the root addresses the actor by key, so the events name none. @public */
export type TurnMachineEvent =
  /** `complete{cut: true}`: cut whatever the attempt's outcome (RM-R13). */
  | Readonly<{ type: 'turnCompleted' }>
  /** `complete{cut: false}`, the release (RM-R4). */
  | Readonly<{ type: 'turnAbandoned' }>
  /** The host recorded the settlement: retire the lease (RM-R10). */
  | Readonly<{ type: 'acknowledge' }>
  | Readonly<{ type: 'leaseGranted' }>
  | Readonly<{ type: 'leaseRefused'; reason: string }>
  | Readonly<{ type: 'revisionMinted'; requestId?: string; revisionId: string }>
  | Readonly<{ type: 'nothingToSave'; requestId?: string }>
  | Readonly<{ type: 'cutFailed'; requestId?: string; reason: string; code?: TurnFailureCode }>
  | Readonly<{ type: 'casLost'; requestId?: string }>
  | Readonly<{ type: 'cutCancelled'; requestId: string }>;

/** The host-attested settlement of one turn (A4). @public */
export type TurnSettlement = Readonly<{
  turnId: string;
  chatId: string;
  checkoutId: string | undefined;
  /** This turn's own lease, the only one its settlement may retire. */
  runId: string;
  /** The run's attempt (D10); the hosts forward it once W8 owns the settlement writer. */
  attempt: number;
  /** `undefined` when the turn changed nothing, so nothing was minted (I5). */
  revisionId: string | undefined;
  trigger: 'turn';
  /**
   * The branch the settling checkout tracks, or `undefined` when it is detached.
   *
   * Carried rather than read from the store's HEAD at settlement time: a turn on
   * a linked checkout settles onto its own branch while HEAD still names the
   * live one, so reading HEAD would label the card with the wrong branch
   * (W3c review R7).
   */
  branch: string | undefined;
  /** Every lease the writer saw on the checkout — provenance, not a retirement list. */
  runIds: readonly string[];
}>;

/** Facts turnMachine emits for cards and sends to its parent. @public */
export type TurnMachineEmitted =
  | (Readonly<{ type: 'turnFinalized' }> & TurnSettlement)
  | (Readonly<{ type: 'turnConflicted' }> & TurnSettlement);

/** Input of the injected `prepare` actor: resolve placement without branching. @public */
export type TurnPrepareActorInput = Readonly<{
  key: TurnAttemptKey;
  checkoutId?: string;
}>;

/**
 * Output of the injected `prepare` actor.
 *
 * `staleRunIds` are leases from a superseded authority epoch (N3); the machine
 * reports each to the parent as `leaseStale` so `checkouts` retires it (F13,
 * deleted with the sweep in W8's TS-S7).
 *
 * @public
 */
export type TurnPrepareActorOutput = Readonly<{
  checkoutId: string;
  branch: string | undefined;
  baseRevisionId: string | undefined;
  /** True when the checkout's tree differs from its head, so the base must be minted after the lease (D17, RM-R12). */
  dirty: boolean;
  staleRunIds: readonly string[];
}>;

/** Input of the injected `writeLease` actor. @public */
export type TurnWriteLeaseActorInput = Readonly<{
  key: TurnAttemptKey;
  checkoutId: string;
  /** The head placement read; the record keeps it, and find-or-cut stops there. */
  headRevisionId: string | undefined;
}>;

/** Output of the injected `writeLease` actor: the record written, and every lease on the checkout (own run first). @public */
export type TurnWriteLeaseActorOutput = Readonly<{
  lease: TurnLease;
  leaseIds: readonly string[];
  /** Other attempts' records on the checkout, which the root announces as `leaseHeld` (RM-R16). */
  held: readonly TurnAttemptKey[];
}>;

/** Input of the injected `retireLease` actor: drop the record only if it names this attempt (RM-S14). @public */
export type TurnRetireLeaseActorInput = Readonly<{
  key: TurnAttemptKey;
  checkoutId: string;
  outcome: TurnOutcome | 'refused';
}>;

/** Input of the injected `lease` actor: the live-tree lease this turn holds. @public */
export type TurnLeaseActorInput = Readonly<{ checkoutId: string; runId: string }>;

/** Input of the injected `capture` actor. @public */
export type TurnCaptureActorInput = Readonly<{ checkoutId: string; turnId: string }>;

/** Outcome of applying the captured turn tree to its checkout. @public */
export type TurnMergeActorOutput = Readonly<{
  status: 'recorded' | 'conflicted';
  /** The conflicted revision recorded on the source branch, when there is one (A22). */
  conflictRevisionId?: string;
}>;

/** Input of the injected `find` actor: find-or-cut's search along first parents (RM-R14). @public */
export type TurnFindActorInput = Readonly<{
  key: TurnAttemptKey;
  checkoutId: string;
  /** The lease's head; the walk stops before it, or at the root when absent. */
  stopAt: string | undefined;
}>;

/** What find-or-cut found: the attempt's own base and result, by `turnCut`. @public */
export type TurnFindActorOutput = Readonly<{ base?: string; result?: string }>;

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'The turn failed.';

/*
 * The port's own category, read structurally (P4).
 *
 * A machine may import only *types* from this package's contracts (I20, AC22),
 * so `instanceof RevisionPortError` is not available here; `branch.machine` and
 * `sync.machine` read the same field the same way.
 */
const describeFailureCode = (error: unknown): RevisionPortErrorCode | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a rejection is `unknown` until read.
  const { code } = error as Readonly<{ code?: unknown }>;
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed to the port's own union.
  return typeof code === 'string' ? (code as RevisionPortErrorCode) : undefined;
};

type TurnEnqueue = EnqueueObject<TurnMachineEvent, TurnMachineEmitted>;
type Leased = Readonly<{ lease: TurnLeaseHold }>;

const settlement = (context: TurnMachineContext): TurnSettlement => ({
  turnId: context.key.turnId,
  chatId: context.key.chatId,
  checkoutId: context.checkoutId,
  runId: context.key.runId,
  attempt: context.key.attempt,
  revisionId: context.revisionId,
  trigger: 'turn',
  branch: context.branch,
  runIds: context.leaseIds,
});

const tell = (context: TurnMachineContext, enq: TurnEnqueue, event: AnyEventObject): void => {
  if (context.parentRef !== undefined) {
    enq.sendTo(context.parentRef, event);
  }
};

/* A cut's request id: the attempt, which revision it is, and its sequence (RM-R1). */
const cutIdOf = (context: TurnMachineContext, turnCut: TurnCut, sequence: number): string =>
  `${context.key.runId}/${String(context.key.attempt)}/${turnCut}/${String(sequence)}`;

/* The id of the cut this state is waiting on: the last one asked. */
const pendingCutId = (context: TurnMachineContext, turnCut: TurnCut): string =>
  cutIdOf(context, turnCut, context.cutSequence - 1);

/* Ask the checkout for one of the attempt's two revisions; the patch advances the sequence. */
const askCut = (context: TurnMachineContext, enq: TurnEnqueue, turnCut: TurnCut) => {
  tell(context, enq, {
    type: 'cut',
    requestId: cutIdOf(context, turnCut, context.cutSequence),
    trigger: 'turn',
    checkoutId: context.checkoutId,
    turn: { key: context.key, turnCut },
    leaseIds: context.leaseIds,
  });
  return { cutSequence: context.cutSequence + 1 };
};

/*
 * The one announcement of an outcome, on landing in `settled` (RM-R10, P4).
 *
 * `turnFinalized` and `turnConflicted` are cards, so they are emitted as well
 * as sent; a release or a failure only reaches the root, which the host phrases
 * from the code rather than the diagnostic (E5).
 */
const announce = (context: TurnMachineContext, enq: TurnEnqueue): void => {
  if (context.outcome === 'finalized' || context.outcome === 'conflicted') {
    const fact: TurnMachineEmitted = {
      type: context.outcome === 'finalized' ? 'turnFinalized' : 'turnConflicted',
      ...settlement(context),
    };
    enq.emit(fact);
    tell(context, enq, fact);
    return;
  }
  tell(context, enq, {
    type: 'turnReleased',
    key: context.key,
    turnId: context.key.turnId,
    chatId: context.key.chatId,
    runId: context.key.runId,
    attempt: context.key.attempt,
    checkoutId: context.checkoutId,
    outcome: context.outcome ?? 'failed',
    reason: context.reason,
    code: context.code,
    /* A base this attempt minted, so a release still names what it recorded. */
    ...(context.mintedBaseRevisionId === undefined ? {} : { revisionId: context.mintedBaseRevisionId }),
  });
};

type SettleFields = Readonly<{
  lease: TurnLeaseHold | undefined;
  outcome: TurnOutcome;
  revisionId?: string;
  code?: TurnFailureCode;
  reason?: string;
}>;

/* `End`: settle with an outcome, announcing it once (RM-R10). */
const settle = (context: TurnMachineContext, enq: TurnEnqueue, fields: SettleFields) => {
  announce({ ...context, ...fields }, enq);
  return { target: 'settled', context: fields } as const;
};

type LeasedStep = Readonly<{ lease: TurnLeaseHold; patch?: Partial<TurnMachineContext> }>;

/* `Released`: a release after a refused cut gives up on the cut, so the attempt failed. */
const released = (
  context: TurnMachineContext,
  enq: TurnEnqueue,
  { lease, patch = {} }: Readonly<{ lease: TurnLeaseHold | undefined; patch?: Partial<TurnMachineContext> }>,
) => {
  const next = { ...context, ...patch };
  const ended = settle(next, enq, { lease, outcome: next.cutFailures > 0 ? 'failed' : 'released' });
  return { target: ended.target, context: { ...patch, ...ended.context } } as const;
};

/* `Refuse` before the record exists: answered at once. */
const refuseUnleased = (code: TurnFailureCode | undefined, reason: string) =>
  ({ target: 'refused', context: { code, reason } }) as const;

/* `Refuse` after the record: `refusing` retires it before the refusal is answered (TS-R1). */
const refuseLeased = (lease: TurnLeaseHold, code: TurnFailureCode, reason: string) =>
  ({ target: 'refusing', context: { lease, code, reason } }) as const;

/* `Place`: the attempt holds its lease; a buffered completion starts at once. */
const place = (context: TurnMachineContext, enq: TurnEnqueue, { lease, patch = {} }: LeasedStep) => {
  const next = { ...context, ...patch };
  tell(context, enq, {
    type: 'turnPlaced',
    key: context.key,
    checkoutId: next.checkoutId,
    branch: next.branch,
    baseRevisionId: next.baseRevisionId,
  });
  const target = context.completionRequested ? 'capturing' : 'held';
  return { target, context: { ...patch, lease, placed: true } } as const;
};

/* `CutRefused` (RM-R13): the cut did not land, so the attempt keeps its lease and the host may complete again. */
const refuseCut = (
  context: TurnMachineContext,
  enq: TurnEnqueue,
  { lease, code, reason }: Readonly<{ lease: TurnLeaseHold; code: TurnFailureCode | undefined; reason: string }>,
) => {
  const cutFailures = context.cutFailures + 1;
  tell(context, enq, { type: 'turnCutRefused', key: context.key, code, reason, cutFailures });
  return {
    target: 'held',
    context: { lease, code, reason, completionRequested: false, casRetries: 0, cutFailures },
  } as const;
};

/* `CompleteHeld`: a found result settles without a cut; otherwise capture. */
const completeHeld = (
  context: TurnMachineContext,
  enq: TurnEnqueue,
  { lease, result, patch = {} }: LeasedStep & Readonly<{ result: string | undefined }>,
) => {
  if (result === undefined) {
    return { target: 'capturing', context: { ...patch, lease } } as const;
  }
  const ended = settle({ ...context, ...patch }, enq, { lease, outcome: 'finalized', revisionId: result });
  return { target: ended.target, context: { ...patch, ...ended.context } } as const;
};

const pairs = (states: readonly string[], eventTypes: readonly string[]): Array<readonly [string, string]> =>
  states.flatMap((state) => eventTypes.map((eventType) => [state, eventType] as const));

/**
 * Events a state declares it ignores (MC-R17, MC-R18, RM-R11): each stale by construction,
 * except `held`'s `leaseRefused`, which is ignored by design (F6).
 *
 * - A cut answer outside `basing` and `requesting`: the attempt waits on no
 *   cut there, and every answer names the request it answers (RM-R1). In those
 *   two states an answer for another id is dropped after the id check.
 * - A lease fact outside `acquiring` and `held`: the lease actor runs only in
 *   those two. In `held` a repeated grant is stale too.
 * - A repeated `turnCompleted` once the attempt is completing or settled, and a
 *   `turnAbandoned` once it has settled: the host resends, the attempt is past it.
 *
 * @public
 */
export const turnIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ...pairs(
    [
      'resolving',
      'writingLease',
      'acquiring',
      'held',
      'adopting',
      'finding',
      'capturing',
      'merging',
      'settled',
      'retiring',
      'refusing',
    ],
    ['revisionMinted', 'nothingToSave', 'cutFailed', 'casLost', 'cutCancelled'],
  ),
  ...pairs(
    [
      'resolving',
      'writingLease',
      'adopting',
      'finding',
      'basing',
      'capturing',
      'merging',
      'requesting',
      'settled',
      'retiring',
      'refusing',
    ],
    ['leaseGranted', 'leaseRefused'],
  ),
  ['held', 'leaseGranted'],
  /*
   * Ignored by design, not stale (F6, RM-A17): the lease actor is live in
   * `held`, but a refusal after the grant is too late to act on. The attempt
   * already holds its record and settles through its own verbs.
   */
  ['held', 'leaseRefused'],
  ...pairs(['finding', 'capturing', 'merging', 'requesting', 'settled', 'retiring', 'refusing'], ['turnCompleted']),
  ...pairs(['settled', 'retiring', 'refusing'], ['turnAbandoned']),
];

const turnMachineDefinition = setup({
  schemas: {
    context: types<TurnMachineContext>(),
    events: eventSchemas<TurnMachineEvent>(),
    emitted: eventSchemas<TurnMachineEmitted>(),
    input: types<TurnMachineInput>(),
    /* MC-R28: `holdsLease` backs `selectTurnHoldsLease`. */
    tags: types<'holdsLease'>(),
  },
  /* MC-R26: the record is state context only while it exists. */
  states: {
    admitting: {},
    resolving: {},
    writingLease: {},
    acquiring: { schemas: { context: types<Leased>() } },
    basing: { schemas: { context: types<Leased>() } },
    held: { schemas: { context: types<Leased>() } },
    adopting: { schemas: { context: types<Leased>() } },
    capturing: { schemas: { context: types<Leased>() } },
    merging: { schemas: { context: types<Leased>() } },
    requesting: { schemas: { context: types<Leased>() } },
    finding: { schemas: { context: types<Leased>() } },
    settled: { schemas: { context: types<Readonly<{ lease: TurnLeaseHold | undefined }>>() } },
    retiring: { schemas: { context: types<Leased>() } },
    refusing: { schemas: { context: types<Leased>() } },
    retired: {},
    refused: {},
  },
  actors: {
    prepare: createAsyncLogic<TurnPrepareActorOutput, TurnPrepareActorInput>({
      run: async () => {
        throw new Error('turnMachine: the prepare actor was not provided.');
      },
    }),
    writeLease: createAsyncLogic<TurnWriteLeaseActorOutput, TurnWriteLeaseActorInput>({
      run: async () => {
        throw new Error('turnMachine: the writeLease actor was not provided.');
      },
    }),
    retireLease: createAsyncLogic<void, TurnRetireLeaseActorInput>({
      run: async () => {
        throw new Error('turnMachine: the retireLease actor was not provided.');
      },
    }),
    capture: createAsyncLogic<Readonly<{ captureId: string }>, TurnCaptureActorInput>({
      run: async () => {
        throw new Error('turnMachine: the capture actor was not provided.');
      },
    }),
    merge: createAsyncLogic<
      TurnMergeActorOutput,
      Readonly<{ checkoutId: string; captureId: string; baseRevisionId: string | undefined }>
    >({
      run: async () => {
        throw new Error('turnMachine: the merge actor was not provided.');
      },
    }),
    find: createAsyncLogic<TurnFindActorOutput, TurnFindActorInput>({
      run: async () => {
        throw new Error('turnMachine: the find actor was not provided.');
      },
    }),
    /* The live-tree lease, held while the attempt waits to be placed and while it is held. */
    lease: createCallbackLogic<AnyEventObject, TurnLeaseActorInput>(({ sendBack }) => {
      sendBack({ type: 'leaseRefused', reason: 'turnMachine: the lease actor was not provided.' });
      return () => undefined;
    }),
  },
  guards: {
    casRetryAvailable: (context: TurnMachineContext) => context.casRetries < turnCasRetryLimit,
    answersCut: (context: TurnMachineContext, requestId: string | undefined, turnCut: TurnCut) =>
      requestId !== undefined && requestId === pendingCutId(context, turnCut),
  },
}).createMachine({
  id: 'turn',
  context: ({ input }) => ({
    key: input.key,
    checkoutId: input.checkoutId ?? input.adopt?.checkoutId,
    branch: undefined,
    baseRevisionId: undefined,
    mintedBaseRevisionId: undefined,
    leaseIds: [],
    captureId: undefined,
    completionRequested: false,
    casRetries: 0,
    cutSequence: 0,
    dirtyBase: false,
    releasing: false,
    placed: input.adopt !== undefined,
    foundRevisionId: undefined,
    cutFailures: 0,
    revisionId: undefined,
    outcome: undefined,
    reason: undefined,
    code: undefined,
    adopt: input.adopt,
    parentRef: input.parentRef,
  }),
  initial: 'admitting',
  /*
   * An acknowledgement before the attempt settled is refused `REVISIONS_BUSY`
   * (wait) rather than dropped (RM-R11). Everything else a state does not take
   * is on {@link turnIgnoredEvents}: stale by construction.
   */
  on: {
    acknowledge: ({ context }, enq) => {
      tell(context, enq, {
        type: 'acknowledgeRefused',
        key: context.key,
        code: 'REVISIONS_BUSY',
        reason: 'This turn has not settled yet.',
      });
      return {};
    },
  },
  states: {
    /* A transient split: an adopted record searches first, a fresh attempt places (RM-R14). */
    admitting: {
      always: ({ context }) =>
        context.adopt === undefined
          ? { target: 'resolving' }
          : { target: 'adopting', context: { lease: context.adopt } },
    },

    resolving: {
      invoke: {
        src: 'prepare',
        input: ({ context }) => ({
          key: context.key,
          ...(context.checkoutId === undefined ? {} : { checkoutId: context.checkoutId }),
        }),
        onDone: ({ context, event }, enq) => {
          if (context.releasing) {
            return settle(context, enq, { lease: undefined, outcome: 'released' });
          }
          tell(context, enq, {
            type: 'turnPrepared',
            key: context.key,
            checkoutId: event.output.checkoutId,
            branch: event.output.branch,
          });
          /* F13: a lease from a superseded epoch is retired on the next prepare, and `checkouts` owns that. */
          for (const runId of event.output.staleRunIds) {
            tell(context, enq, { type: 'leaseStale', runId });
          }
          return {
            target: 'writingLease',
            context: {
              checkoutId: event.output.checkoutId,
              branch: event.output.branch,
              baseRevisionId: event.output.baseRevisionId,
              dirtyBase: event.output.dirty,
            },
          };
        },
        onError: ({ event }) => refuseUnleased(describeFailureCode(event.error), describeFailure(event.error)),
      },
      on: {
        turnCompleted: { context: { completionRequested: true } },
        turnAbandoned: { context: { releasing: true } },
      },
    },

    /* RM-R12: the record, naming the attempt and the head, before any mint. */
    writingLease: {
      invoke: {
        src: 'writeLease',
        input: ({ context }) => ({
          key: context.key,
          checkoutId: context.checkoutId ?? '',
          headRevisionId: context.baseRevisionId,
        }),
        onDone: ({ context, event }, enq) => {
          /* R1: the registry cannot see a lease it did not write, so the turn says so. */
          tell(context, enq, {
            type: 'leaseWritten',
            key: context.key,
            checkoutId: context.checkoutId,
            leaseIds: event.output.leaseIds,
            held: event.output.held,
          });
          const { leaseIds } = event.output;
          if (context.releasing) {
            return settle({ ...context, leaseIds }, enq, { lease: event.output.lease, outcome: 'released' });
          }
          return { target: 'acquiring', context: { lease: event.output.lease, leaseIds } };
        },
        onError: ({ event }) => refuseUnleased(describeFailureCode(event.error), describeFailure(event.error)),
      },
      on: {
        turnCompleted: { context: { completionRequested: true } },
        turnAbandoned: { context: { releasing: true } },
      },
    },

    /* R6: the record exists but the live tree is not yet held, so nothing is cut or captured. */
    acquiring: {
      invoke: {
        src: 'lease',
        input: ({ context }) => ({ checkoutId: context.checkoutId ?? '', runId: context.key.runId }),
      },
      on: {
        leaseGranted: ({ context }, enq) =>
          context.dirtyBase
            ? { target: 'basing', context: { lease: context.lease, ...askCut(context, enq, 'base') } }
            : place(context, enq, { lease: context.lease }),
        leaseRefused: ({ context, event }) => refuseLeased(context.lease, 'LEASE_UNAVAILABLE', event.reason),
        turnCompleted: { context: { completionRequested: true } },
        turnAbandoned: ({ context }, enq) => released(context, enq, { lease: context.lease }),
      },
    },

    /* D17: the dirty base is minted through the checkout, after the record (RM-R12). */
    basing: {
      on: {
        revisionMinted: ({ context, event, guards }, enq) => {
          if (!guards.answersCut(context, event.requestId, 'base')) {
            return {};
          }
          const patch = { baseRevisionId: event.revisionId, mintedBaseRevisionId: event.revisionId };
          return context.releasing
            ? released(context, enq, { lease: context.lease, patch })
            : place(context, enq, { lease: context.lease, patch });
        },
        nothingToSave: ({ context, event, guards }, enq) => {
          if (!guards.answersCut(context, event.requestId, 'base')) {
            return {};
          }
          return context.releasing
            ? released(context, enq, { lease: context.lease })
            : place(context, enq, { lease: context.lease });
        },
        cutFailed: ({ context, event, guards }, enq) => {
          if (!guards.answersCut(context, event.requestId, 'base')) {
            return {};
          }
          return context.releasing
            ? released(context, enq, { lease: context.lease })
            : refuseLeased(context.lease, 'BASE_CUT_FAILED', event.reason);
        },
        /* D24: the checkout re-read the head, so one re-ask records onto it. */
        casLost: ({ context, event, guards }, enq) => {
          if (!guards.answersCut(context, event.requestId, 'base')) {
            return {};
          }
          if (context.releasing) {
            return released(context, enq, { lease: context.lease });
          }
          return guards.casRetryAvailable(context)
            ? { context: { casRetries: context.casRetries + 1, ...askCut(context, enq, 'base') } }
            : refuseLeased(context.lease, 'BASE_CUT_FAILED', 'Something else changed this project first.');
        },
        cutCancelled: ({ context, event, guards }, enq) =>
          context.releasing && guards.answersCut(context, event.requestId, 'base')
            ? released(context, enq, { lease: context.lease })
            : {},
        turnCompleted: { context: { completionRequested: true } },
        /* RM-R4: withdraw the cut and wait for its answer. */
        turnAbandoned: ({ context }, enq) => {
          if (!context.releasing) {
            tell(context, enq, {
              type: 'cancelCut',
              requestId: pendingCutId(context, 'base'),
              checkoutId: context.checkoutId,
            });
          }
          return { context: { releasing: true } };
        },
      },
    },

    held: {
      tags: ['holdsLease'],
      invoke: {
        src: 'lease',
        input: ({ context }) => ({ checkoutId: context.checkoutId ?? '', runId: context.key.runId }),
      },
      on: {
        /* The retry count resets on each completion, so the base's retry never spends the result's. */
        turnCompleted: ({ context }, enq) =>
          completeHeld(context, enq, {
            lease: context.lease,
            result: context.foundRevisionId,
            patch: { casRetries: 0 },
          }),
        turnAbandoned: ({ context }, enq) => released(context, enq, { lease: context.lease }),
      },
    },

    /* RM-R14: an adopted record finds its own base and result before it serves a verb. */
    adopting: {
      invoke: {
        src: 'find',
        input: ({ context }) => ({
          key: context.key,
          checkoutId: context.lease.checkoutId,
          stopAt: context.lease.headRevisionId,
        }),
        onDone: ({ context, event }, enq) => {
          if (context.releasing) {
            return settle(context, enq, { lease: context.lease, outcome: 'released' });
          }
          const patch = {
            foundRevisionId: event.output.result,
            completionRequested: false,
            ...(event.output.base === undefined ? {} : { mintedBaseRevisionId: event.output.base }),
          };
          return context.completionRequested
            ? completeHeld(context, enq, { lease: context.lease, result: event.output.result, patch })
            : { target: 'held', context: { ...patch, lease: context.lease } };
        },
        /* A search that could not run found nothing: the result cut's compare-and-swap still guards a second mint. */
        onError: ({ context }, enq) => {
          if (context.releasing) {
            return settle(context, enq, { lease: context.lease, outcome: 'released' });
          }
          return context.completionRequested
            ? completeHeld(context, enq, {
                lease: context.lease,
                result: undefined,
                patch: { completionRequested: false },
              })
            : { target: 'held', context: { lease: context.lease, completionRequested: false } };
        },
      },
      on: {
        turnCompleted: { context: { completionRequested: true } },
        turnAbandoned: { context: { releasing: true } },
      },
    },

    capturing: {
      invoke: {
        src: 'capture',
        input: ({ context }) => ({ checkoutId: context.checkoutId ?? '', turnId: context.key.turnId }),
        onDone: ({ context, event }, enq) =>
          context.releasing
            ? settle(context, enq, { lease: context.lease, outcome: 'released' })
            : { target: 'merging', context: { lease: context.lease, captureId: event.output.captureId } },
        onError: ({ context, event }, enq) =>
          refuseCut(context, enq, {
            lease: context.lease,
            code: describeFailureCode(event.error),
            reason: describeFailure(event.error),
          }),
      },
      on: {
        turnAbandoned: { context: { releasing: true } },
      },
    },

    merging: {
      invoke: {
        src: 'merge',
        input: ({ context }) => ({
          checkoutId: context.checkoutId ?? '',
          captureId: context.captureId ?? '',
          baseRevisionId: context.baseRevisionId ?? context.mintedBaseRevisionId ?? context.lease.headRevisionId,
        }),
        onDone: ({ context, event }, enq) => {
          if (event.output.status === 'conflicted') {
            return settle(context, enq, {
              lease: context.lease,
              outcome: 'conflicted',
              ...(event.output.conflictRevisionId === undefined ? {} : { revisionId: event.output.conflictRevisionId }),
            });
          }
          return context.releasing
            ? settle(context, enq, { lease: context.lease, outcome: 'released' })
            : { target: 'requesting', context: { lease: context.lease, ...askCut(context, enq, 'result') } };
        },
        onError: ({ context, event }, enq) =>
          refuseCut(context, enq, {
            lease: context.lease,
            code: describeFailureCode(event.error),
            reason: describeFailure(event.error),
          }),
      },
      on: {
        turnAbandoned: { context: { releasing: true } },
      },
    },

    /* The mint itself belongs to `checkout.machine`; this turn only asks. */
    requesting: {
      on: {
        revisionMinted: ({ context, event, guards }, enq) =>
          guards.answersCut(context, event.requestId, 'result')
            ? settle(context, enq, { lease: context.lease, outcome: 'finalized', revisionId: event.revisionId })
            : {},
        nothingToSave: ({ context, event, guards }, enq) => {
          if (!guards.answersCut(context, event.requestId, 'result')) {
            return {};
          }
          return context.releasing
            ? settle(context, enq, { lease: context.lease, outcome: 'released' })
            : settle(context, enq, { lease: context.lease, outcome: 'finalized' });
        },
        cutFailed: ({ context, event, guards }, enq) => {
          if (!guards.answersCut(context, event.requestId, 'result')) {
            return {};
          }
          return context.releasing
            ? settle(context, enq, { lease: context.lease, outcome: 'released' })
            : refuseCut(context, enq, { lease: context.lease, code: event.code, reason: event.reason });
        },
        /* RM-R14: another writer may have published this attempt's result; look before re-cutting. */
        casLost: ({ context, event, guards }, enq) => {
          if (!guards.answersCut(context, event.requestId, 'result')) {
            return {};
          }
          return context.releasing
            ? settle(context, enq, { lease: context.lease, outcome: 'released' })
            : { target: 'finding', context: { lease: context.lease } };
        },
        cutCancelled: ({ context, event, guards }, enq) =>
          context.releasing && guards.answersCut(context, event.requestId, 'result')
            ? settle(context, enq, { lease: context.lease, outcome: 'released' })
            : {},
        turnAbandoned: ({ context }, enq) => {
          if (!context.releasing) {
            tell(context, enq, {
              type: 'cancelCut',
              requestId: pendingCutId(context, 'result'),
              checkoutId: context.checkoutId,
            });
          }
          return { context: { releasing: true } };
        },
      },
    },

    /* Find-or-cut after a lost compare-and-swap: the ref lock makes the winner's head visible (RM-R15). */
    finding: {
      invoke: {
        src: 'find',
        input: ({ context }) => ({
          key: context.key,
          checkoutId: context.checkoutId ?? context.lease.checkoutId,
          stopAt: context.lease.headRevisionId,
        }),
        onDone: ({ context, event, guards }, enq) => {
          if (event.output.result !== undefined) {
            return settle(context, enq, {
              lease: context.lease,
              outcome: 'finalized',
              revisionId: event.output.result,
            });
          }
          return guards.casRetryAvailable(context)
            ? {
                target: 'requesting',
                context: {
                  lease: context.lease,
                  casRetries: context.casRetries + 1,
                  ...askCut(context, enq, 'result'),
                },
              }
            : refuseCut(context, enq, {
                lease: context.lease,
                code: 'CAS_LOST',
                reason: 'Something else changed this project first.',
              });
        },
        onError: ({ context, guards }, enq) =>
          guards.casRetryAvailable(context)
            ? {
                target: 'requesting',
                context: {
                  lease: context.lease,
                  casRetries: context.casRetries + 1,
                  ...askCut(context, enq, 'result'),
                },
              }
            : refuseCut(context, enq, {
                lease: context.lease,
                code: 'CAS_LOST',
                reason: 'Something else changed this project first.',
              }),
      },
      on: {
        turnAbandoned: { context: { releasing: true } },
      },
    },

    /* RM-R10: the outcome is announced; the lease stays until the host acknowledges it. */
    settled: {
      on: {
        acknowledge: ({ context }) =>
          context.lease === undefined
            ? { target: 'retired' }
            : { target: 'retiring', context: { lease: context.lease } },
      },
    },

    retiring: {
      invoke: {
        src: 'retireLease',
        input: ({ context }) => ({
          key: context.key,
          checkoutId: context.lease.checkoutId,
          outcome: context.outcome ?? 'failed',
        }),
        onDone: { target: 'retired' },
        /* The record is still there, so the acknowledgement is refused and the attempt stays settled. */
        onError: ({ context, event }, enq) => {
          tell(context, enq, {
            type: 'acknowledgeRefused',
            key: context.key,
            code: describeFailureCode(event.error),
            reason: describeFailure(event.error),
          });
          return { target: 'settled', context: { lease: context.lease } };
        },
      },
    },

    /* TS-R1: a refusal after the record retires it first; a failed retirement still answers, and reconciliation finds the record. */
    refusing: {
      invoke: {
        src: 'retireLease',
        input: ({ context }) => ({
          key: context.key,
          checkoutId: context.lease.checkoutId,
          outcome: 'refused',
        }),
        onDone: { target: 'refused' },
        onError: { target: 'refused' },
      },
    },

    retired: {
      type: 'final',
      entry: ({ context }, enq) => {
        tell(context, enq, { type: 'turnRetired', key: context.key, checkoutId: context.checkoutId });
      },
    },

    refused: {
      type: 'final',
      entry: ({ context }, enq) => {
        tell(context, enq, { type: 'turnRefused', key: context.key, code: context.code, reason: context.reason });
      },
    },
  },
});

type TurnMachineDefinition = typeof turnMachineDefinition;

/**
 * The type of {@link turnMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface TurnMachine extends TurnMachineDefinition {}

/**
 * Headless lifecycle of one turn attempt.
 *
 * @public
 */
export const turnMachine: TurnMachine = turnMachineDefinition;

/**
 * Selects whether this turn still holds its checkout.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True only while the attempt is placed and waiting to be completed (R6).
 * @public
 */
export const selectTurnHoldsLease = (snapshot: SnapshotFrom<typeof turnMachine>): boolean =>
  snapshot.hasTag('holdsLease');

/**
 * The actor set a host provides for `turnMachine` (S37).
 *
 * Taken from the machine's own `provide` parameter so an implementation that
 * drifts from an actor's input or output is a type error at the host, not a
 * runtime surprise inside a state.
 *
 * @public
 */
export type TurnActors = MachineActors<typeof turnMachine>;
