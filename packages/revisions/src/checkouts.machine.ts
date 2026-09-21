/**
 * `checkouts.machine` — one actor per project, owning the checkout registry.
 *
 * It replaces the provider's `reclaim`/`reclaimAll` and the workspace sweep a
 * Node host used to run at start. Records are the truth (I3): `open` sweeps stale leases
 * against the authority epoch and then rehydrates from `listCheckouts`, never
 * from a persisted snapshot. It enforces one checkout per branch, retires
 * leases without removing their checkouts (D17), and never removes a checkout a
 * lease still holds (A25, I9).
 */

import { assign, enqueueActions, fromPromise, setup } from 'xstate';
import type { AnyActorRef, SnapshotFrom } from 'xstate';

import type { CheckoutRecord, RevisionPortErrorCode } from '#revision-port.js';
import type { TurnSettlement } from '#turn.machine.js';

/** What a registry operation was doing when it failed or was refused. @public */
export type CheckoutOperation = 'open' | 'add' | 'remove' | 'retire';

/** Input accepted when creating the checkoutsMachine actor. @public */
export type CheckoutsMachineInput = Readonly<{
  projectId: string;
  parentRef?: AnyActorRef;
}>;

/** Serializable state owned by checkoutsMachine. @public */
export type CheckoutsMachineContext = Readonly<{
  projectId: string;
  checkouts: readonly CheckoutRecord[];
  /** Run ids awaiting retirement, served one at a time in arrival order. */
  pendingRetirements: readonly string[];
  /** Leases reported before the registry had records to put them on (R22). */
  pendingLeases: ReadonlyArray<Readonly<{ checkoutId: string | undefined; runId: string }>>;
  /** The checkout `removing` is dropping. */
  removingId: string | undefined;
  reason: string | undefined;
  /** The refusal's stable category, when the port named one (P4). */
  reasonCode: RevisionPortErrorCode | undefined;
  parentRef: AnyActorRef | undefined;
}>;

/** Events accepted by checkoutsMachine. @public */
export type CheckoutsMachineEvent =
  | Readonly<{ type: 'open' }>
  | Readonly<{ type: 'addCheckout'; branch: string; from: string }>
  | Readonly<{ type: 'removeCheckout'; id: string }>
  | Readonly<{ type: 'leaseStale'; runId: string }>
  | Readonly<{ type: 'leaseWritten'; checkoutId: string | undefined; runId: string }>
  | (Readonly<{ type: 'turnFinalized' }> & TurnSettlement)
  /* A turn that ended without a settlement still had a lease (R12). */
  | Readonly<{ type: 'turnReleased'; turnId: string; checkoutId: string | undefined; runId: string }>;

/** Facts checkoutsMachine emits, and sends to its parent when they change the registry. @public */
export type CheckoutsMachineEmitted =
  | Readonly<{ type: 'checkoutsChanged'; checkouts: readonly CheckoutRecord[] }>
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  | Readonly<{ type: 'removalOffered'; checkoutId: string }>
  /* P4: a refusal crosses as a code; the page that shows it owns the words. */
  | Readonly<{ type: 'checkoutFailed'; operation: CheckoutOperation; reason: string; code?: RevisionPortErrorCode }>;

/** Output of the injected `sweepLeases` actor: the epoch comparison (F13). @public */
export type SweepLeasesActorOutput = Readonly<{ retiredRunIds: readonly string[] }>;

/** Output of the injected `listCheckouts` actor. @public */
export type ListCheckoutsActorOutput = Readonly<{ checkouts: readonly CheckoutRecord[] }>;

/** Output of the injected `addCheckout` actor. @public */
export type AddCheckoutActorOutput = Readonly<{ checkout: CheckoutRecord }>;

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'The checkout operation failed.';

/*
 * The port's own category, read structurally (P4).
 *
 * A machine may import only *types* from this package's contracts (I20, AC22),
 * so `instanceof RevisionPortError` is not available here; `sync.machine` reads
 * the same field the same way.
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

/**
 * Headless checkout registry for one project.
 *
 * @public
 */
export const checkoutsMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as CheckoutsMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as CheckoutsMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    emitted: {} as CheckoutsMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as CheckoutsMachineInput,
  },
  actors: {
    listCheckouts: fromPromise<ListCheckoutsActorOutput, Readonly<{ projectId: string }>>(async () => {
      throw new Error('checkoutsMachine: the listCheckouts actor was not provided.');
    }),
    addCheckout: fromPromise<AddCheckoutActorOutput, Readonly<{ projectId: string; branch: string; from: string }>>(
      async () => {
        throw new Error('checkoutsMachine: the addCheckout actor was not provided.');
      },
    ),
    removeCheckout: fromPromise<void, Readonly<{ projectId: string; id: string }>>(async () => {
      throw new Error('checkoutsMachine: the removeCheckout actor was not provided.');
    }),
    sweepLeases: fromPromise<SweepLeasesActorOutput, Readonly<{ projectId: string }>>(async () => {
      throw new Error('checkoutsMachine: the sweepLeases actor was not provided.');
    }),
    retireLease: fromPromise<void, Readonly<{ projectId: string; runId: string }>>(async () => {
      throw new Error('checkoutsMachine: the retireLease actor was not provided.');
    }),
  },
  guards: {
    /* One checkout per branch (I18): a branch that has one cannot get another. */
    branchIsFree: ({ context }, params: Readonly<{ branch: string }>) =>
      !context.checkouts.some((checkout) => checkout.branch === params.branch),
    /* A25/I9: a checkout a lease holds is never removed. */
    checkoutIsFree: ({ context }, params: Readonly<{ id: string }>) =>
      context.checkouts.some((checkout) => checkout.id === params.id && checkout.leaseRunIds.length === 0),
    hasPendingRetirement: ({ context }) => context.pendingRetirements.length > 0,
    hasPendingLease: ({ context }) => context.pendingLeases.length > 0,
    /* A lease naming no known record — or one whose turn has already ended —
     * changes nothing, so it must not churn the host with a re-announcement. */
    hasApplicableLease: ({ context }) =>
      context.pendingLeases.some(
        (lease) =>
          !context.pendingRetirements.includes(lease.runId) &&
          context.checkouts.some(
            (checkout) => checkout.id === lease.checkoutId && !checkout.leaseRunIds.includes(lease.runId),
          ),
      ),
    /* R23/R30: a turn can end before it ever wrote a lease, and a settlement can
     * arrive before the registry has records to retire against. The test is
     * therefore made at drain time, against records ∪ the lease buffer, not when
     * the event is received. */
    hasPhantomRetirement: ({ context }) =>
      context.pendingRetirements.some(
        (runId) =>
          !context.checkouts.some((checkout) => checkout.leaseRunIds.includes(runId)) &&
          !context.pendingLeases.some((lease) => lease.runId === runId),
      ),
  },
  actions: {
    announceRegistry: enqueueActions(({ context, enqueue }) => {
      const fact: CheckoutsMachineEmitted = { type: 'checkoutsChanged', checkouts: context.checkouts };
      enqueue.emit(fact);
      if (context.parentRef !== undefined) {
        enqueue.sendTo(context.parentRef, fact);
      }
      for (const checkout of context.checkouts) {
        if (checkout.removable === true) {
          const offer: CheckoutsMachineEmitted = { type: 'removalOffered', checkoutId: checkout.id };
          enqueue.emit(offer);
          if (context.parentRef !== undefined) {
            enqueue.sendTo(context.parentRef, offer);
          }
        }
      }
    }),
    announceFailure: enqueueActions(
      ({ context, enqueue }, params: Readonly<{ operation: CheckoutOperation; reason?: string }>) => {
        const fact: CheckoutsMachineEmitted = {
          type: 'checkoutFailed',
          operation: params.operation,
          reason: params.reason ?? context.reason ?? 'The checkout operation failed.',
          /* A reason this call authored is the guard's own sentence, not the
             port's, so it never carries the last port code (P4). */
          ...(params.reason === undefined && context.reasonCode !== undefined ? { code: context.reasonCode } : {}),
        };
        enqueue.emit(fact);
        /* R11: the root routes this to the workbench; an emit alone never
         * leaves this actor. */
        if (context.parentRef !== undefined) {
          enqueue.sendTo(context.parentRef, fact);
        }
      },
    ),
    queueRetirements: assign({
      pendingRetirements: ({ context, event }) => {
        /* R2: `runIds` is the provenance set — every lease the writer saw on
         * the checkout. Retiring all of them takes the other chat's lease
         * (AC9), so a settlement retires only its own `runId`. */
        const runIds =
          event.type === 'leaseStale' || event.type === 'turnFinalized' || event.type === 'turnReleased'
            ? [event.runId]
            : [];
        const added = runIds.filter((runId) => !context.pendingRetirements.includes(runId));
        return [...context.pendingRetirements, ...added];
      },
    }),
    /* R1: a lease written inside a turn is invisible to the `listCheckouts`
     * output the registry loaded earlier, so the turn reports it. R22: it can
     * arrive before there is any record to put it on, so it is always buffered
     * and applied from one place. */
    bufferLease: assign({
      pendingLeases: ({ context, event }) =>
        event.type === 'leaseWritten'
          ? [...context.pendingLeases, { checkoutId: event.checkoutId, runId: event.runId }]
          : context.pendingLeases,
    }),
    /*
     * A lease for a checkout no record names is dropped here, exactly as one
     * arriving while `ready` always was. R30: a lease whose retirement is
     * already queued never lands at all — it is cancelled against that
     * retirement, so no phantom run id can survive on a record.
     */
    applyLeases: assign(({ context }) => {
      const retiring = new Set(context.pendingRetirements);
      const landing = context.pendingLeases.filter((lease) => !retiring.has(lease.runId));
      const cancelled = new Set(
        context.pendingLeases.filter((lease) => retiring.has(lease.runId)).map((lease) => lease.runId),
      );
      return {
        checkouts: context.checkouts.map((checkout) => {
          const added = landing
            .filter((lease) => lease.checkoutId === checkout.id && !checkout.leaseRunIds.includes(lease.runId))
            .map((lease) => lease.runId);
          return added.length === 0 ? checkout : { ...checkout, leaseRunIds: [...checkout.leaseRunIds, ...added] };
        }),
        pendingLeases: [],
        pendingRetirements: context.pendingRetirements.filter((runId) => !cancelled.has(runId)),
      };
    }),
    dropPhantomRetirements: assign({
      pendingRetirements: ({ context }) =>
        context.pendingRetirements.filter((runId) =>
          context.checkouts.some((checkout) => checkout.leaseRunIds.includes(runId)),
        ),
    }),
    dropRetiredLease: assign({
      checkouts: ({ context }) => {
        const runId = context.pendingRetirements[0];
        return runId === undefined
          ? context.checkouts
          : context.checkouts.map((checkout) =>
              checkout.leaseRunIds.includes(runId)
                ? { ...checkout, leaseRunIds: checkout.leaseRunIds.filter((held) => held !== runId) }
                : checkout,
            );
      },
    }),
    completeRetirement: enqueueActions(({ context, enqueue }) => {
      const runId = context.pendingRetirements[0];
      if (runId !== undefined) {
        const fact: CheckoutsMachineEmitted = { type: 'leaseRetired', runId };
        enqueue.emit(fact);
        if (context.parentRef !== undefined) {
          enqueue.sendTo(context.parentRef, fact);
        }
      }
      enqueue.assign({ pendingRetirements: context.pendingRetirements.slice(1) });
    }),
  },
}).createMachine({
  id: 'checkouts',
  context: ({ input }) => ({
    projectId: input.projectId,
    checkouts: [],
    pendingRetirements: [],
    pendingLeases: [],
    removingId: undefined,
    reason: undefined,
    reasonCode: undefined,
    parentRef: input.parentRef,
  }),
  initial: 'idle',
  /*
   * R22/R30: the producer of a lease and its three consumers are buffered the
   * same way, in every state. Anything conditional on being `ready` is dropped
   * in the window between `open` and the first `listCheckouts`, and the two
   * halves have to agree or a run id is left on a record whose turn is gone.
   */
  on: {
    leaseWritten: { actions: 'bufferLease' },
    leaseStale: { actions: 'queueRetirements' },
    turnFinalized: { actions: 'queueRetirements' },
    turnReleased: { actions: 'queueRetirements' },
  },
  states: {
    idle: {
      on: { open: { target: 'recovering' } },
    },
    recovering: {
      invoke: {
        src: 'sweepLeases',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: {
          target: 'loading',
          actions: enqueueActions(({ context, enqueue, event }) => {
            for (const runId of event.output.retiredRunIds) {
              const fact: CheckoutsMachineEmitted = { type: 'leaseRetired', runId };
              enqueue.emit(fact);
              if (context.parentRef !== undefined) {
                enqueue.sendTo(context.parentRef, fact);
              }
            }
          }),
        },
        onError: {
          target: 'failed',
          actions: [
            assign({
              reason: ({ event }) => describeFailure(event.error),
              reasonCode: ({ event }) => describeFailureCode(event.error),
            }),
            { type: 'announceFailure', params: { operation: 'open' } },
          ],
        },
      },
    },
    loading: {
      invoke: {
        src: 'listCheckouts',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: {
          target: 'ready',
          actions: [assign({ checkouts: ({ event }) => event.output.checkouts }), 'announceRegistry'],
        },
        /* R2/W6: a registry that could not load used to rest here silently, so
         * a host waiting on the first announcement waited out its whole bound
         * with nothing to show a person. `failed` is still where it rests; it
         * now says so on the way. */
        onError: {
          target: 'failed',
          actions: [
            assign({
              reason: ({ event }) => describeFailure(event.error),
              reasonCode: ({ event }) => describeFailureCode(event.error),
            }),
            { type: 'announceFailure', params: { operation: 'open' } },
          ],
        },
      },
    },
    failed: {
      on: { open: { target: 'recovering' } },
    },
    ready: {
      initial: 'idle',
      on: {
        /* Records are the truth, so a reopen re-reads them. */
        open: { target: 'loading' },
      },
      states: {
        idle: {
          /* Leases first, so a lease that just landed is not mistaken for a
           * phantom; then the phantoms; then the retirement itself. */
          always: [
            { guard: 'hasApplicableLease', actions: ['applyLeases', 'announceRegistry'] },
            { guard: 'hasPendingLease', actions: 'applyLeases' },
            { guard: 'hasPhantomRetirement', actions: 'dropPhantomRetirements' },
            { guard: 'hasPendingRetirement', target: 'retiring' },
          ],
          on: {
            addCheckout: [
              {
                guard: { type: 'branchIsFree', params: ({ event }) => ({ branch: event.branch }) },
                target: 'adding',
              },
              {
                actions: {
                  type: 'announceFailure',
                  params: { operation: 'add', reason: 'That branch already has a checkout.' },
                },
              },
            ],
            removeCheckout: [
              {
                guard: { type: 'checkoutIsFree', params: ({ event }) => ({ id: event.id }) },
                target: 'removing',
                actions: assign({ removingId: ({ event }) => event.id }),
              },
              {
                /* Policy Rule 1: *lease* and *checkout* are engineering terms
                 * and this sentence reaches a toast and the CLI. What the
                 * person can act on is which branch is busy. */
                actions: {
                  type: 'announceFailure',
                  params: ({ context, event }) => ({
                    operation: 'remove',
                    reason: `An agent is working in ${
                      context.checkouts.find((checkout) => checkout.id === event.id)?.branch ?? 'this branch'
                    }.`,
                  }),
                },
              },
            ],
          },
        },
        adding: {
          invoke: {
            src: 'addCheckout',
            input: ({ context, event }) => ({
              projectId: context.projectId,
              branch: event.type === 'addCheckout' ? event.branch : '',
              from: event.type === 'addCheckout' ? event.from : '',
            }),
            onDone: {
              target: 'idle',
              actions: [
                assign({ checkouts: ({ context, event }) => [...context.checkouts, event.output.checkout] }),
                'announceRegistry',
              ],
            },
            onError: {
              target: 'idle',
              actions: [
                assign({
                  reason: ({ event }) => describeFailure(event.error),
                  reasonCode: ({ event }) => describeFailureCode(event.error),
                }),
                { type: 'announceFailure', params: { operation: 'add' } },
              ],
            },
          },
        },
        removing: {
          invoke: {
            src: 'removeCheckout',
            input: ({ context }) => ({ projectId: context.projectId, id: context.removingId ?? '' }),
            onDone: {
              target: 'idle',
              actions: [
                assign({
                  checkouts: ({ context }) =>
                    context.checkouts.filter((checkout) => checkout.id !== context.removingId),
                  removingId: undefined,
                }),
                'announceRegistry',
              ],
            },
            onError: {
              target: 'idle',
              actions: [
                assign({
                  reason: ({ event }) => describeFailure(event.error),
                  reasonCode: ({ event }) => describeFailureCode(event.error),
                }),
                { type: 'announceFailure', params: { operation: 'remove' } },
              ],
            },
          },
        },
        retiring: {
          invoke: {
            src: 'retireLease',
            input: ({ context }) => ({
              projectId: context.projectId,
              runId: context.pendingRetirements[0] ?? '',
            }),
            onDone: {
              target: 'idle',
              actions: ['dropRetiredLease', 'completeRetirement', 'announceRegistry'],
            },
            onError: {
              target: 'idle',
              actions: [
                assign({
                  reason: ({ event }) => describeFailure(event.error),
                  reasonCode: ({ event }) => describeFailureCode(event.error),
                  pendingRetirements: ({ context }) => context.pendingRetirements.slice(1),
                }),
                { type: 'announceFailure', params: { operation: 'retire' } },
              ],
            },
          },
        },
      },
    },
  },
});

/**
 * Selects every checkout the registry knows, in record order.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The checkout records.
 * @public
 */
export const selectCheckouts = (snapshot: SnapshotFrom<typeof checkoutsMachine>): readonly CheckoutRecord[] =>
  snapshot.context.checkouts;

/**
 * Selects the run ids of every lease holding a checkout, keyed by checkout id.
 *
 * This is the lease set D10's switch guard reads.
 *
 * @param snapshot - Current machine snapshot.
 * @returns Held run ids by checkout id.
 * @public
 */
export const selectLeaseSet = (
  snapshot: SnapshotFrom<typeof checkoutsMachine>,
): Readonly<Record<string, readonly string[]>> =>
  Object.fromEntries(snapshot.context.checkouts.map((checkout) => [checkout.id, checkout.leaseRunIds]));

/**
 * The actor set a host provides for `checkoutsMachine` (S37).
 *
 * Taken from the machine's own `provide` parameter so an implementation that
 * drifts from an actor's input or output is a type error at the host, not a
 * runtime surprise inside a state.
 *
 * @public
 */
export type CheckoutsActors = NonNullable<Parameters<typeof checkoutsMachine.provide>[0]['actors']>;
