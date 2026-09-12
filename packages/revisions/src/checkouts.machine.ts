/**
 * `checkouts.machine` — one actor per project, owning the checkout registry.
 *
 * It replaces the provider's `reclaim`/`reclaimAll` and the Node host's
 * `sweepTurnWorkspaces`. Records are the truth (I3): `open` sweeps stale leases
 * against the authority epoch and then rehydrates from `listCheckouts`, never
 * from a persisted snapshot. It enforces one checkout per branch, retires
 * leases without removing their checkouts (D17), and never removes a checkout a
 * lease still holds (A25, I9).
 */

import { assign, enqueueActions, fromPromise, setup } from 'xstate';
import type { AnyActorRef, SnapshotFrom } from 'xstate';

import type { TurnSettlement } from '#turn.machine.js';

/**
 * One row of the checkout registry, as this machine needs it.
 *
 * The structural minimum until `Checkout` lands on the revision port in W3a;
 * W3c unifies the two.
 *
 * @public
 */
export type CheckoutRecord = Readonly<{
  id: string;
  /** The branch this checkout tracks; `undefined` when it is detached. */
  branch: string | undefined;
  headRevisionId?: string;
  /** Run ids of the leases currently holding this checkout. */
  leaseRunIds: readonly string[];
  /** Set by the host when its policy would offer this checkout for removal. */
  removable?: boolean;
}>;

/** What a registry operation was doing when it failed or was refused. @public */
export type CheckoutOperation = 'add' | 'remove' | 'retire';

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
  /** The checkout `removing` is dropping. */
  removingId: string | undefined;
  reason: string | undefined;
  parentRef: AnyActorRef | undefined;
}>;

/** Events accepted by checkoutsMachine. @public */
export type CheckoutsMachineEvent =
  | Readonly<{ type: 'open' }>
  | Readonly<{ type: 'addCheckout'; branch: string; from: string }>
  | Readonly<{ type: 'removeCheckout'; id: string }>
  | Readonly<{ type: 'leaseStale'; runId: string }>
  | (Readonly<{ type: 'turnFinalized' }> & TurnSettlement);

/** Facts checkoutsMachine emits, and sends to its parent when they change the registry. @public */
export type CheckoutsMachineEmitted =
  | Readonly<{ type: 'checkoutsChanged'; checkouts: readonly CheckoutRecord[] }>
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  | Readonly<{ type: 'removalOffered'; checkoutId: string }>
  | Readonly<{ type: 'checkoutFailed'; operation: CheckoutOperation; reason: string }>;

/** Output of the injected `sweepLeases` actor: the epoch comparison (F13). @public */
export type SweepLeasesActorOutput = Readonly<{ retiredRunIds: readonly string[] }>;

/** Output of the injected `listCheckouts` actor. @public */
export type ListCheckoutsActorOutput = Readonly<{ checkouts: readonly CheckoutRecord[] }>;

/** Output of the injected `addCheckout` actor. @public */
export type AddCheckoutActorOutput = Readonly<{ checkout: CheckoutRecord }>;

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'The checkout operation failed.';

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
          enqueue.emit({ type: 'removalOffered', checkoutId: checkout.id });
        }
      }
    }),
    announceFailure: enqueueActions(
      ({ context, enqueue }, params: Readonly<{ operation: CheckoutOperation; reason?: string }>) => {
        enqueue.emit({
          type: 'checkoutFailed',
          operation: params.operation,
          reason: params.reason ?? context.reason ?? 'The checkout operation failed.',
        });
      },
    ),
    queueRetirements: assign({
      pendingRetirements: ({ context, event }) => {
        const runIds = event.type === 'leaseStale' ? [event.runId] : event.type === 'turnFinalized' ? event.runIds : [];
        const added = runIds.filter((runId) => !context.pendingRetirements.includes(runId));
        return [...context.pendingRetirements, ...added];
      },
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
        enqueue.emit({ type: 'leaseRetired', runId });
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
    removingId: undefined,
    reason: undefined,
    parentRef: input.parentRef,
  }),
  initial: 'idle',
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
          actions: enqueueActions(({ enqueue, event }) => {
            for (const runId of event.output.retiredRunIds) {
              enqueue.emit({ type: 'leaseRetired', runId });
            }
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
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
        onError: {
          target: 'failed',
          actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
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
        leaseStale: { actions: 'queueRetirements' },
        turnFinalized: { actions: 'queueRetirements' },
      },
      states: {
        idle: {
          always: { guard: 'hasPendingRetirement', target: 'retiring' },
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
                actions: {
                  type: 'announceFailure',
                  params: { operation: 'remove', reason: 'A lease still holds that checkout.' },
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
                assign({ reason: ({ event }) => describeFailure(event.error) }),
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
                assign({ reason: ({ event }) => describeFailure(event.error) }),
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
