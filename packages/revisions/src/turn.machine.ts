/**
 * `turn.machine` — one actor per turn, from placement to settled revision.
 *
 * It replaces the provider's prepare/finalize promise chain and the Node host's
 * per-run placement maps with one host-neutral lifecycle. It does **not**
 * mint: `finalizing` sends `cut` to the parent, which routes it to the turn's
 * `checkout.machine`, the only minter (F2). The live-tree lease is a held
 * resource, so it is a callback actor whose refusal arrives as `leaseRefused`
 * rather than as `onError` (F6). A dirty base is minted the same way, through
 * the checkout, before the lease is written (R10).
 */

import { assign, enqueueActions, fromCallback, fromPromise, setup } from 'xstate';
import type { AnyActorRef, AnyEventObject, SnapshotFrom } from 'xstate';

import type { RevisionPortErrorCode } from '#revision-port.js';

/** How long `finalizing` waits for its checkout to settle the cut. @public */
export const turnCutSettlementMilliseconds = 30_000;

/**
 * How many times a turn re-cuts after losing the head's compare-and-swap (D24).
 *
 * One. A loss means another writer advanced the branch between this turn's cut
 * and its publication; the checkout re-reads the head and returns to `dirty`,
 * so a single re-ask records onto what is there now. A *second* loss on the
 * same turn is contention this turn cannot win by trying harder — something
 * else is minting continuously — and retrying would keep an agent's lease open
 * indefinitely, so the turn fails with `cas-lost` and the person sees it.
 *
 * @public
 */
export const turnCasRetryLimit = 1;

/** How one turn ended. @public */
export type TurnOutcome = 'finalized' | 'conflicted' | 'released' | 'failed';

/**
 * Why a turn failed, as a page can act on it (P4).
 *
 * A refusal crosses every boundary as a code and the page owns the words
 * (`apps/ui/app/lib/revision-failure-copy.ts`), so the sentences here are
 * diagnostics for a console and a test, never copy. The port's own categories
 * are included because most of what fails a turn is the store refusing: the
 * four invoked actors reject with whatever the effects behind them raised, and
 * a `RevisionPortError` already says which kind of refusal it was. The four
 * that follow are the turn's own, which no port code names — a waited-out cut,
 * a waited-out base cut, a contended head, and a live tree somebody else holds.
 *
 * A failure nothing classified carries no code at all, and the page falls back
 * per subject rather than showing a sentence a person cannot act on (E5).
 *
 * @public
 */
export type TurnFailureCode =
  | RevisionPortErrorCode
  | 'BASE_CUT_TIMED_OUT'
  | 'CAS_LOST'
  | 'CUT_TIMED_OUT'
  | 'LEASE_UNAVAILABLE';

/** Input accepted when creating the turnMachine actor. @public */
export type TurnMachineInput = Readonly<{
  turnId: string;
  chatId: string;
  /** Run id this turn's lease is recorded under (`.tau/runs/<runId>.json`). */
  runId: string;
  /** The chat's checkout when it already has one; otherwise placement resolves it. */
  checkoutId?: string;
  /** The `project-revisions` root, which routes `cut` and its outcome. */
  parentRef?: AnyActorRef;
}>;

/** Serializable state owned by turnMachine. @public */
export type TurnMachineContext = Readonly<{
  turnId: string;
  chatId: string;
  runId: string;
  checkoutId: string | undefined;
  branch: string | undefined;
  baseRevisionId: string | undefined;
  /** Run ids of every lease on this turn's checkout, as the lease writer saw them. */
  leaseIds: readonly string[];
  /** Opaque handle to the captured turn tree the host is holding. */
  captureId: string | undefined;
  /** Set when `turnCompleted` arrived before the lease was granted (R6). */
  completionRequested: boolean;
  /** How many times this turn has already re-cut after losing the CAS (D24). */
  casRetries: number;
  /** True while the checkout's tree still has to be minted onto the base (D17). */
  dirtyBase: boolean;
  revisionId: string | undefined;
  outcome: TurnOutcome | undefined;
  /** The diagnostic: a console reads it, a person never does (E5). */
  reason: string | undefined;
  /** What the failure was, for the page that has to phrase it (P4). */
  code: TurnFailureCode | undefined;
  parentRef: AnyActorRef | undefined;
}>;

/** Events accepted by turnMachine. @public */
export type TurnMachineEvent =
  | Readonly<{ type: 'turnCompleted' }>
  | Readonly<{ type: 'turnAbandoned' }>
  | Readonly<{ type: 'release' }>
  | Readonly<{ type: 'leaseGranted' }>
  | Readonly<{ type: 'leaseRefused'; reason: string }>
  | Readonly<{ type: 'revisionMinted'; trigger: string; turnId?: string; revisionId: string }>
  | Readonly<{ type: 'nothingToSave'; trigger: string; turnId?: string }>
  | Readonly<{ type: 'cutFailed'; trigger: string; turnId?: string; reason: string }>
  | Readonly<{ type: 'casLost'; trigger: string; turnId?: string }>;

/** The host-attested settlement of one turn (A4). @public */
export type TurnSettlement = Readonly<{
  turnId: string;
  chatId: string;
  checkoutId: string | undefined;
  /** This turn's own lease, the only one its settlement may retire. */
  runId: string;
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
  turnId: string;
  chatId: string;
  runId: string;
  checkoutId?: string;
}>;

/**
 * Output of the injected `prepare` actor.
 *
 * `staleRunIds` are leases from a superseded authority epoch (N3); the machine
 * reports each to the parent as `leaseStale` so `checkouts` retires it (F13).
 *
 * @public
 */
export type TurnPrepareActorOutput = Readonly<{
  checkoutId: string;
  branch: string | undefined;
  baseRevisionId: string | undefined;
  /** True when the checkout's tree differs from its head, so the base must be minted first (D17). */
  dirty: boolean;
  staleRunIds: readonly string[];
}>;

/** Input of the injected `writeLease` actor. @public */
export type TurnWriteLeaseActorInput = Readonly<{
  runId: string;
  turnId: string;
  chatId: string;
  checkoutId: string;
  baseRevisionId: string | undefined;
}>;

/** Input of the injected `retireLease` actor. @public */
export type TurnRetireLeaseActorInput = Readonly<{
  runId: string;
  turnId: string;
  checkoutId: string | undefined;
  outcome: TurnOutcome;
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

const settlement = (context: TurnMachineContext): TurnSettlement => ({
  turnId: context.turnId,
  chatId: context.chatId,
  checkoutId: context.checkoutId,
  runId: context.runId,
  revisionId: context.revisionId,
  trigger: 'turn',
  branch: context.branch,
  runIds: context.leaseIds,
});

/**
 * Headless lifecycle of one turn.
 *
 * @public
 */
export const turnMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as TurnMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as TurnMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    emitted: {} as TurnMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as TurnMachineInput,
  },
  actors: {
    prepare: fromPromise<TurnPrepareActorOutput, TurnPrepareActorInput>(async () => {
      throw new Error('turnMachine: the prepare actor was not provided.');
    }),
    writeLease: fromPromise<Readonly<{ leaseIds: readonly string[] }>, TurnWriteLeaseActorInput>(async () => {
      throw new Error('turnMachine: the writeLease actor was not provided.');
    }),
    retireLease: fromPromise<void, TurnRetireLeaseActorInput>(async () => {
      throw new Error('turnMachine: the retireLease actor was not provided.');
    }),
    capture: fromPromise<Readonly<{ captureId: string }>, TurnCaptureActorInput>(async () => {
      throw new Error('turnMachine: the capture actor was not provided.');
    }),
    merge: fromPromise<
      TurnMergeActorOutput,
      Readonly<{ checkoutId: string; captureId: string; baseRevisionId: string | undefined }>
    >(async () => {
      throw new Error('turnMachine: the merge actor was not provided.');
    }),
    /* The live-tree lease, held for the whole `leased` state. */
    lease: fromCallback<AnyEventObject, TurnLeaseActorInput>(({ sendBack }) => {
      sendBack({ type: 'leaseRefused', reason: 'turnMachine: the lease actor was not provided.' });
      return () => undefined;
    }),
  },
  delays: {
    cutSettlement: turnCutSettlementMilliseconds,
  },
  guards: {
    outcomeIs: ({ context }, params: Readonly<{ outcome: TurnOutcome }>) => context.outcome === params.outcome,
    mergeConflicted: (_, params: Readonly<{ status: 'recorded' | 'conflicted' }>) => params.status === 'conflicted',
    completionRequested: ({ context }) => context.completionRequested,
    casRetryAvailable: ({ context }) => context.casRetries < turnCasRetryLimit,
  },
  actions: {
    failWith: assign({
      outcome: 'failed',
      reason: ({ event }) =>
        'reason' in event && typeof event.reason === 'string' ? event.reason : 'The turn failed.',
      /* `cutFailed` passes none: the checkout answers a sentence and no code,
       * so the page falls back rather than inventing a category (E5). */
      code: (_, params: Readonly<{ code?: TurnFailureCode }>) => params.code,
    }),
    announceRelease: enqueueActions(({ context, enqueue }) => {
      if (context.parentRef === undefined) {
        return;
      }
      enqueue.sendTo(context.parentRef, {
        type: 'turnReleased',
        turnId: context.turnId,
        chatId: context.chatId,
        checkoutId: context.checkoutId,
        runId: context.runId,
        outcome: context.outcome ?? 'failed',
        /* The host phrases this for a person from the code, so the turn carries
         * both rather than the host inferring "something went wrong" from a
         * missing event — and never shows the diagnostic itself (P4, E5). */
        reason: context.reason,
        code: context.code,
      });
    }),
    announceSettlement: enqueueActions(
      ({ context, enqueue }, params: Readonly<{ type: TurnMachineEmitted['type'] }>) => {
        const fact: TurnMachineEmitted = { type: params.type, ...settlement(context) };
        enqueue.emit(fact);
        if (context.parentRef !== undefined) {
          enqueue.sendTo(context.parentRef, fact);
        }
      },
    ),
  },
}).createMachine({
  id: 'turn',
  context: ({ input }) => ({
    turnId: input.turnId,
    chatId: input.chatId,
    runId: input.runId,
    checkoutId: input.checkoutId,
    branch: undefined,
    baseRevisionId: undefined,
    leaseIds: [],
    captureId: undefined,
    completionRequested: false,
    casRetries: 0,
    dirtyBase: false,
    revisionId: undefined,
    outcome: undefined,
    reason: undefined,
    code: undefined,
    parentRef: input.parentRef,
  }),
  initial: 'preparing',
  states: {
    preparing: {
      initial: 'resolving',
      /* R21: nothing is leased yet, so ending here retires nothing. */
      on: {
        release: { target: 'released', actions: assign({ outcome: 'released' }) },
        turnAbandoned: { target: 'released', actions: assign({ outcome: 'released' }) },
        /*
         * A fast turn finishes before its placement does.
         *
         * The dirty-base pre-mint (D17) is a full cut, so `preparing` routinely
         * outlasts a turn that wrote nothing, and a `turnCompleted` that landed
         * here used to be dropped — which left the turn leased until its bound
         * expired. Both hosts compensated by holding the completion until
         * `onPlacement`; the machine owns it instead, and `leased.held` replays
         * it through the `completionRequested` guard R6 already added.
         */
        turnCompleted: { actions: assign({ completionRequested: true }) },
      },
      states: {
        resolving: {
          invoke: {
            src: 'prepare',
            input: ({ context }) => ({
              turnId: context.turnId,
              chatId: context.chatId,
              runId: context.runId,
              ...(context.checkoutId === undefined ? {} : { checkoutId: context.checkoutId }),
            }),
            onDone: {
              target: 'basing',
              actions: [
                assign({
                  checkoutId: ({ event }) => event.output.checkoutId,
                  branch: ({ event }) => event.output.branch,
                  baseRevisionId: ({ event }) => event.output.baseRevisionId,
                  dirtyBase: ({ event }) => event.output.dirty,
                }),
                enqueueActions(({ context, enqueue, event }) => {
                  if (context.parentRef === undefined) {
                    return;
                  }
                  enqueue.sendTo(context.parentRef, {
                    type: 'turnPrepared',
                    turnId: context.turnId,
                    chatId: context.chatId,
                    checkoutId: event.output.checkoutId,
                    branch: event.output.branch,
                  });
                  /* F13: a lease from a superseded epoch is retired on the next
                   * prepare, and `checkouts` owns that retirement. */
                  for (const runId of event.output.staleRunIds) {
                    enqueue.sendTo(context.parentRef, { type: 'leaseStale', runId });
                  }
                }),
              ],
            },
            onError: {
              target: '#turn.failed',
              actions: assign({
                outcome: 'failed',
                reason: ({ event }) => describeFailure(event.error),
                code: ({ event }) => describeFailureCode(event.error),
              }),
            },
          },
        },
        /* D17: the turn may not lease a dirty tree, and it may not mint one
         * either — `checkout.machine` is the sole minter (F2), so it asks. */
        basing: {
          always: { guard: ({ context }) => !context.dirtyBase, target: 'writingLease' },
          entry: enqueueActions(({ context, enqueue }) => {
            if (context.parentRef === undefined || !context.dirtyBase) {
              return;
            }
            enqueue.sendTo(context.parentRef, {
              /*
               * `turn`, not `save`: this mint is the first act of *this* turn.
               *
               * With two chats on one checkout, the later turn's base mint
               * absorbs whatever the earlier chat had in flight. Calling that a
               * user save would credit a person for an agent's bytes and leave
               * the turn with no revision of its own on the History row; the
               * effects module fills the lease set that was held at the time,
               * so the row shows both chats and no turn "loses" its revision.
               */
              type: 'cut',
              trigger: 'turn',
              turnId: context.turnId,
              checkoutId: context.checkoutId,
              leaseIds: context.leaseIds,
            });
          }),
          on: {
            revisionMinted: {
              target: 'writingLease',
              actions: assign({ baseRevisionId: ({ event }) => event.revisionId, dirtyBase: false }),
            },
            nothingToSave: { target: 'writingLease', actions: assign({ dirtyBase: false }) },
            cutFailed: { target: '#turn.failed', actions: { type: 'failWith', params: {} } },
            /* D24: the checkout re-read the head, so one re-ask records onto it. */
            casLost: [
              {
                guard: 'casRetryAvailable',
                target: 'basing',
                reenter: true,
                actions: assign({ casRetries: ({ context }) => context.casRetries + 1 }),
              },
              {
                target: '#turn.failed',
                actions: assign({ outcome: 'failed', reason: 'cas-lost', code: 'CAS_LOST' }),
              },
            ],
          },
          /* R21: a wait on another actor needs the same bound `requesting` has. */
          after: {
            cutSettlement: {
              target: '#turn.failed',
              actions: assign({
                outcome: 'failed',
                reason: 'The checkout did not settle the base cut in time.',
                code: 'BASE_CUT_TIMED_OUT',
              }),
            },
          },
        },
        writingLease: {
          invoke: {
            src: 'writeLease',
            input: ({ context }) => ({
              runId: context.runId,
              turnId: context.turnId,
              chatId: context.chatId,
              checkoutId: context.checkoutId ?? '',
              baseRevisionId: context.baseRevisionId,
            }),
            onDone: {
              target: '#turn.leased',
              actions: [
                assign({ leaseIds: ({ event }) => event.output.leaseIds }),
                /* R1: the registry cannot see a lease it did not write itself,
                 * so the D10 switch guard and the A25/I9 removal guard stay
                 * blind unless the turn says so. */
                enqueueActions(({ context, enqueue }) => {
                  if (context.parentRef === undefined) {
                    return;
                  }
                  enqueue.sendTo(context.parentRef, {
                    type: 'leaseWritten',
                    checkoutId: context.checkoutId,
                    runId: context.runId,
                  });
                }),
              ],
            },
            onError: {
              target: '#turn.failed',
              actions: assign({
                outcome: 'failed',
                reason: ({ event }) => describeFailure(event.error),
                code: ({ event }) => describeFailureCode(event.error),
              }),
            },
          },
        },
      },
    },
    leased: {
      invoke: {
        id: 'lease',
        src: 'lease',
        input: ({ context }) => ({ checkoutId: context.checkoutId ?? '', runId: context.runId }),
      },
      on: {
        leaseRefused: { target: 'retiring', actions: { type: 'failWith', params: { code: 'LEASE_UNAVAILABLE' } } },
        turnAbandoned: { target: 'retiring', actions: assign({ outcome: 'released' }) },
        release: { target: 'retiring', actions: assign({ outcome: 'released' }) },
      },
      initial: 'acquiring',
      states: {
        /* R6: the lease file exists but the callback has not confirmed it, so
         * the turn may not capture yet; a completion that lands here waits. */
        acquiring: {
          on: {
            leaseGranted: { target: 'held' },
            turnCompleted: { actions: assign({ completionRequested: true }) },
          },
        },
        held: {
          always: { guard: 'completionRequested', target: '#turn.finalizing' },
          on: { turnCompleted: { target: '#turn.finalizing' } },
        },
      },
    },
    finalizing: {
      initial: 'capturing',
      on: {
        release: { target: 'retiring', actions: assign({ outcome: 'released' }) },
        turnAbandoned: { target: 'retiring', actions: assign({ outcome: 'released' }) },
      },
      states: {
        capturing: {
          invoke: {
            src: 'capture',
            input: ({ context }) => ({ checkoutId: context.checkoutId ?? '', turnId: context.turnId }),
            onDone: {
              target: 'merging',
              actions: assign({ captureId: ({ event }) => event.output.captureId }),
            },
            onError: {
              target: '#turn.retiring',
              actions: assign({
                outcome: 'failed',
                reason: ({ event }) => describeFailure(event.error),
                code: ({ event }) => describeFailureCode(event.error),
              }),
            },
          },
        },
        merging: {
          invoke: {
            src: 'merge',
            input: ({ context }) => ({
              checkoutId: context.checkoutId ?? '',
              captureId: context.captureId ?? '',
              baseRevisionId: context.baseRevisionId,
            }),
            onDone: [
              {
                guard: { type: 'mergeConflicted', params: ({ event }) => ({ status: event.output.status }) },
                target: '#turn.retiring',
                actions: assign({
                  outcome: 'conflicted',
                  revisionId: ({ event }) => event.output.conflictRevisionId,
                }),
              },
              { target: 'requesting' },
            ],
            onError: {
              target: '#turn.retiring',
              actions: assign({
                outcome: 'failed',
                reason: ({ event }) => describeFailure(event.error),
                code: ({ event }) => describeFailureCode(event.error),
              }),
            },
          },
        },
        /* The mint itself belongs to `checkout.machine`; this turn only asks. */
        requesting: {
          entry: enqueueActions(({ context, enqueue }) => {
            if (context.parentRef === undefined) {
              return;
            }
            enqueue.sendTo(context.parentRef, {
              type: 'cut',
              trigger: 'turn',
              turnId: context.turnId,
              checkoutId: context.checkoutId,
              leaseIds: context.leaseIds,
            });
          }),
          on: {
            revisionMinted: {
              target: '#turn.retiring',
              actions: assign({
                outcome: 'finalized',
                revisionId: ({ event }) => event.revisionId,
              }),
            },
            nothingToSave: { target: '#turn.retiring', actions: assign({ outcome: 'finalized' }) },
            cutFailed: { target: '#turn.retiring', actions: { type: 'failWith', params: {} } },
            /*
             * D24: one re-cut, then fail.
             *
             * The checkout answered `casLost` *after* re-reading the head, so
             * the re-ask is queued on a checkout that already knows where the
             * branch is. Re-entering also restarts the settlement bound, which
             * is right: the previous wait was spent on a cut that was thrown
             * away.
             */
            casLost: [
              {
                guard: 'casRetryAvailable',
                target: 'requesting',
                reenter: true,
                actions: assign({ casRetries: ({ context }) => context.casRetries + 1 }),
              },
              {
                target: '#turn.retiring',
                actions: assign({ outcome: 'failed', reason: 'cas-lost', code: 'CAS_LOST' }),
              },
            ],
          },
          after: {
            cutSettlement: {
              target: '#turn.retiring',
              actions: assign({
                outcome: 'failed',
                reason: 'The checkout did not settle the cut in time.',
                code: 'CUT_TIMED_OUT',
              }),
            },
          },
        },
      },
    },
    retiring: {
      invoke: {
        src: 'retireLease',
        input: ({ context }) => ({
          runId: context.runId,
          turnId: context.turnId,
          checkoutId: context.checkoutId,
          outcome: context.outcome ?? 'failed',
        }),
        onDone: [
          { guard: { type: 'outcomeIs', params: { outcome: 'conflicted' } }, target: 'conflicted' },
          { guard: { type: 'outcomeIs', params: { outcome: 'released' } }, target: 'released' },
          { guard: { type: 'outcomeIs', params: { outcome: 'failed' } }, target: 'failed' },
          { target: 'finalized' },
        ],
        /* R7: the settlement is host-attested (A4) and the revision is already
         * on disk, so a failed lease cleanup may not retract it. The orphan
         * lease is `sweepLeases`' problem (F13). */
        onError: [
          { guard: { type: 'outcomeIs', params: { outcome: 'conflicted' } }, target: 'conflicted' },
          { guard: { type: 'outcomeIs', params: { outcome: 'released' } }, target: 'released' },
          { guard: { type: 'outcomeIs', params: { outcome: 'failed' } }, target: 'failed' },
          { target: 'finalized' },
        ],
      },
    },
    finalized: {
      type: 'final',
      entry: [{ type: 'announceSettlement', params: { type: 'turnFinalized' } }],
    },
    conflicted: {
      type: 'final',
      entry: [{ type: 'announceSettlement', params: { type: 'turnConflicted' } }],
    },
    /* R12: the root drops the turn ref and `checkouts` drops the lease only if
     * it hears that the turn ended. */
    released: { type: 'final', entry: 'announceRelease' },
    failed: { type: 'final', entry: 'announceRelease' },
  },
});

/**
 * Selects whether this turn still holds its checkout.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True only once the lease callback has granted it (R6).
 * @public
 */
export const selectTurnHoldsLease = (snapshot: SnapshotFrom<typeof turnMachine>): boolean =>
  snapshot.matches({ leased: 'held' });

/**
 * Selects the revision this turn minted.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The minted revision id, or `undefined` when the turn changed nothing.
 * @public
 */
export const selectTurnRevisionId = (snapshot: SnapshotFrom<typeof turnMachine>): string | undefined =>
  snapshot.context.revisionId;

/**
 * The actor set a host provides for `turnMachine` (S37).
 *
 * Taken from the machine's own `provide` parameter so an implementation that
 * drifts from an actor's input or output is a type error at the host, not a
 * runtime surprise inside a state.
 *
 * @public
 */
export type TurnActors = NonNullable<Parameters<typeof turnMachine.provide>[0]['actors']>;
