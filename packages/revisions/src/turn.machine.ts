/**
 * `turn.machine` — one actor per turn, from placement to settled revision.
 *
 * It replaces the provider's prepare/finalize promise chain and the Node host's
 * `withTurnRevisions` maps with one host-neutral lifecycle. It does **not**
 * mint: `finalizing` sends `cut` to the parent, which routes it to the turn's
 * `checkout.machine`, the only minter (F2). The live-tree lease is a held
 * resource, so it is a callback actor whose refusal arrives as `leaseRefused`
 * rather than as `onError` (F6).
 */

import { assign, enqueueActions, fromCallback, fromPromise, setup } from 'xstate';
import type { AnyActorRef, AnyEventObject, SnapshotFrom } from 'xstate';

/** How long `finalizing` waits for its checkout to settle the cut. @public */
export const turnCutSettlementMilliseconds = 30_000;

/** How one turn ended. @public */
export type TurnOutcome = 'finalized' | 'conflicted' | 'released' | 'failed';

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
  revisionId: string | undefined;
  outcome: TurnOutcome | undefined;
  reason: string | undefined;
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
  | Readonly<{ type: 'cutFailed'; trigger: string; turnId?: string; reason: string }>;

/** The host-attested settlement of one turn (A4). @public */
export type TurnSettlement = Readonly<{
  turnId: string;
  chatId: string;
  checkoutId: string | undefined;
  /** `undefined` when the turn changed nothing, so nothing was minted (I5). */
  revisionId: string | undefined;
  trigger: 'turn';
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

const settlement = (context: TurnMachineContext): TurnSettlement => ({
  turnId: context.turnId,
  chatId: context.chatId,
  checkoutId: context.checkoutId,
  revisionId: context.revisionId,
  trigger: 'turn',
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
  },
  actions: {
    failWith: assign({
      outcome: 'failed',
      reason: ({ event }) =>
        'reason' in event && typeof event.reason === 'string' ? event.reason : 'The turn failed.',
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
    revisionId: undefined,
    outcome: undefined,
    reason: undefined,
    parentRef: input.parentRef,
  }),
  initial: 'preparing',
  states: {
    preparing: {
      initial: 'resolving',
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
              target: 'writingLease',
              actions: [
                assign({
                  checkoutId: ({ event }) => event.output.checkoutId,
                  branch: ({ event }) => event.output.branch,
                  baseRevisionId: ({ event }) => event.output.baseRevisionId,
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
              actions: assign({ leaseIds: ({ event }) => event.output.leaseIds }),
            },
            onError: {
              target: '#turn.failed',
              actions: assign({
                outcome: 'failed',
                reason: ({ event }) => describeFailure(event.error),
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
        leaseRefused: { target: 'retiring', actions: 'failWith' },
        turnCompleted: { target: 'finalizing' },
        turnAbandoned: { target: 'retiring', actions: assign({ outcome: 'released' }) },
        release: { target: 'retiring', actions: assign({ outcome: 'released' }) },
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
            cutFailed: { target: '#turn.retiring', actions: 'failWith' },
          },
          after: {
            cutSettlement: {
              target: '#turn.retiring',
              actions: assign({
                outcome: 'failed',
                reason: 'The checkout did not settle the cut in time.',
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
        onError: {
          target: 'failed',
          actions: assign({
            outcome: 'failed',
            reason: ({ context, event }) => context.reason ?? describeFailure(event.error),
          }),
        },
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
    released: { type: 'final' },
    failed: { type: 'final' },
  },
});

/**
 * Selects whether this turn still holds its checkout.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True while the turn is leased or finalizing.
 * @public
 */
export const selectTurnHoldsLease = (snapshot: SnapshotFrom<typeof turnMachine>): boolean =>
  snapshot.matches('leased') || snapshot.matches('finalizing');

/**
 * Selects the revision this turn minted.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The minted revision id, or `undefined` when the turn changed nothing.
 * @public
 */
export const selectTurnRevisionId = (snapshot: SnapshotFrom<typeof turnMachine>): string | undefined =>
  snapshot.context.revisionId;
