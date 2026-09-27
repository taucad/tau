/**
 * `checkouts.machine` — one actor per project, owning the checkout registry.
 *
 * It replaces the provider's `reclaim`/`reclaimAll` and the workspace sweep a
 * Node host used to run at start. Records are the truth (I3): `open` rehydrates
 * from `listCheckouts`, never from a persisted snapshot, and retires no lease
 * (W8 TS-S7: reconciliation settles a dead holder's lease through the host). It enforces one checkout per branch, retires
 * leases without removing their checkouts (D17), and never removes a checkout a
 * lease still holds (A25, I9).
 *
 * Every add and remove names its request, is queued in any state, and is
 * answered by that id — `checkoutAdded`, `checkoutRemoved` or `checkoutFailed`
 * (RM-R1, RM-R11). A settled turn's lease leaves through one typed `turnEnded`
 * (RM-R10).
 */

import { createAsyncLogic, setup, types } from 'xstate';
import type { AnyActorRef, EnqueueObject, SnapshotFrom } from 'xstate';

import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';
import type { CheckoutRecord, RevisionPortErrorCode } from '#revision-port.js';
import type { TurnAttemptKey } from '#turn.types.js';

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
  /** The attempt a turn's retirement names, by run id; the effect retires only that attempt's record (TS-R5). */
  retirementKeys: Readonly<Record<string, TurnAttemptKey>>;
  /** Adds and removes in arrival order; the first is the one `adding` or `removing` serves (RM-R11). */
  pendingOperations: ReadonlyArray<
    | Readonly<{ kind: 'add'; requestId: string; branch: string; from: string }>
    | Readonly<{ kind: 'remove'; requestId: string; id: string }>
  >;
  /** Leases reported before the registry had records to put them on (R22). */
  pendingLeases: ReadonlyArray<Readonly<{ checkoutId: string | undefined; runId: string }>>;
  reason: string | undefined;
  /** The refusal's stable category, when the port named one (P4). */
  reasonCode: RevisionPortErrorCode | undefined;
  parentRef: AnyActorRef | undefined;
}>;

/** Events accepted by checkoutsMachine. @public */
export type CheckoutsMachineEvent =
  | Readonly<{ type: 'open' }>
  /* `requestId` is the asker's; every answer to the request echoes it (RM-R1). */
  | Readonly<{ type: 'addCheckout'; requestId: string; branch: string; from: string }>
  | Readonly<{ type: 'removeCheckout'; requestId: string; id: string }>
  | Readonly<{ type: 'leaseWritten'; checkoutId: string | undefined; runId: string }>
  /* An attempt retired, or was refused after writing its record: whatever its outcome, its lease leaves (RM-R10, L7 P-1). */
  | Readonly<{ type: 'turnEnded'; key: TurnAttemptKey; checkoutId: string | undefined }>;

/** Facts checkoutsMachine emits, and sends to its parent when they change the registry. @public */
export type CheckoutsMachineEmitted =
  /* A record's branch, head and head tree are the registry's read at `loading`; the root takes those from each checkout actor (RM-R5). */
  | Readonly<{ type: 'checkoutsChanged'; checkouts: readonly CheckoutRecord[] }>
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  | Readonly<{ type: 'removalOffered'; checkoutId: string }>
  /* P4: a refusal crosses as a code; the page that shows it owns the words. `requestId` names the add or remove it answers. */
  | Readonly<{
      type: 'checkoutFailed';
      operation: CheckoutOperation;
      reason: string;
      code?: RevisionPortErrorCode;
      requestId?: string;
    }>
  | Readonly<{ type: 'checkoutAdded'; requestId: string; checkout: CheckoutRecord }>
  | Readonly<{ type: 'checkoutRemoved'; requestId: string; checkoutId: string }>;

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

type CheckoutsEnqueue = EnqueueObject<CheckoutsMachineEvent, CheckoutsMachineEmitted>;

/* Emit a registry fact and send it to the parent, which routes it to the workbench (R11). */
const publish = (context: CheckoutsMachineContext, enq: CheckoutsEnqueue, fact: CheckoutsMachineEmitted): void => {
  enq.emit(fact);
  if (context.parentRef !== undefined) {
    enq.sendTo(context.parentRef, fact);
  }
};

/* Records are read only at `loading`; their heads are spawn input only, so republishing them is harmless (RM-R5). */
const announceRegistry = (context: CheckoutsMachineContext, enq: CheckoutsEnqueue): void => {
  publish(context, enq, { type: 'checkoutsChanged', checkouts: context.checkouts });
  for (const checkout of context.checkouts) {
    if (checkout.removable === true) {
      publish(context, enq, { type: 'removalOffered', checkoutId: checkout.id });
    }
  }
};

const announceFailure = (
  context: CheckoutsMachineContext,
  enq: CheckoutsEnqueue,
  failure: Readonly<{
    operation: CheckoutOperation;
    reason?: string;
    code?: RevisionPortErrorCode;
    requestId?: string;
  }>,
): void => {
  const { operation, reason, code, requestId } = failure;
  /* R11: the root routes this to the workbench; an emit alone never
   * leaves this actor. */
  publish(context, enq, {
    type: 'checkoutFailed',
    operation,
    ...(requestId === undefined ? {} : { requestId }),
    reason: reason ?? context.reason ?? 'The checkout operation failed.',
    /* A reason this call authored is the guard's own sentence, not the
       port's, so it never carries the last port code (P4) — it names its
       own, or the page has nothing to phrase it from (review finding 3). */
    ...(reason === undefined
      ? context.reasonCode === undefined
        ? {}
        : { code: context.reasonCode }
      : code === undefined
        ? {}
        : { code }),
  });
};

/* A failed port call: remember why, then say so with the port's own category. */
const failOperation = (
  context: CheckoutsMachineContext,
  enq: CheckoutsEnqueue,
  failure: Readonly<{ error: unknown; operation: CheckoutOperation; requestId?: string }>,
): Partial<CheckoutsMachineContext> => {
  const { error, operation, requestId } = failure;
  const patch = { reason: describeFailure(error), reasonCode: describeFailureCode(error) };
  announceFailure({ ...context, ...patch }, enq, { operation, ...(requestId === undefined ? {} : { requestId }) });
  return patch;
};

type PendingOperation = CheckoutsMachineContext['pendingOperations'][number];

const operationOf = (
  event: Extract<CheckoutsMachineEvent, { type: 'addCheckout' | 'removeCheckout' }>,
): PendingOperation =>
  event.type === 'addCheckout'
    ? { kind: 'add', requestId: event.requestId, branch: event.branch, from: event.from }
    : { kind: 'remove', requestId: event.requestId, id: event.id };

const queueOperation = (
  context: CheckoutsMachineContext,
  event: Extract<CheckoutsMachineEvent, { type: 'addCheckout' | 'removeCheckout' }>,
): Partial<CheckoutsMachineContext> => ({ pendingOperations: [...context.pendingOperations, operationOf(event)] });

/* A registry that could not open answers every operation it holds, so no asker waits on it (RM-R11). */
const refuseOperations = (
  context: CheckoutsMachineContext,
  enq: CheckoutsEnqueue,
  operations: readonly PendingOperation[],
): void => {
  for (const operation of operations) {
    announceFailure(context, enq, {
      operation: operation.kind,
      requestId: operation.requestId,
      reason: context.reason ?? 'This project could not read its checkouts.',
      ...(context.reasonCode === undefined ? {} : { code: context.reasonCode }),
    });
  }
};

const queueRetirements = (
  context: CheckoutsMachineContext,
  event: CheckoutsMachineEvent,
): Partial<CheckoutsMachineContext> => {
  /* R2: `runIds` is the provenance set — every lease the writer saw on
   * the checkout. Retiring all of them takes the other chat's lease
   * (AC9), so a settlement retires only its own `runId`. */
  const runIds = event.type === 'turnEnded' ? [event.key.runId] : [];
  const added = runIds.filter((runId) => !context.pendingRetirements.includes(runId));
  const { [runIds[0] ?? '']: _replaced, ...keys } = context.retirementKeys;
  return {
    pendingRetirements: [...context.pendingRetirements, ...added],
    retirementKeys: event.type === 'turnEnded' ? { ...keys, [event.key.runId]: event.key } : keys,
  };
};

/*
 * A lease for a checkout no record names is dropped here, exactly as one
 * arriving while `ready` always was. R30: a lease whose retirement is
 * already queued never lands at all — it is cancelled against that
 * retirement, so no phantom run id can survive on a record.
 */
const applyLeases = (context: CheckoutsMachineContext): Partial<CheckoutsMachineContext> => {
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
};

const dropRetiredLease = (context: CheckoutsMachineContext): Partial<CheckoutsMachineContext> => {
  const runId = context.pendingRetirements[0];
  return {
    checkouts:
      runId === undefined
        ? context.checkouts
        : context.checkouts.map((checkout) =>
            checkout.leaseRunIds.includes(runId)
              ? { ...checkout, leaseRunIds: checkout.leaseRunIds.filter((held) => held !== runId) }
              : checkout,
          ),
  };
};

const withoutKey = (
  context: CheckoutsMachineContext,
  runId: string | undefined,
): CheckoutsMachineContext['retirementKeys'] =>
  Object.fromEntries(Object.entries(context.retirementKeys).filter(([held]) => held !== runId));

const completeRetirement = (
  context: CheckoutsMachineContext,
  enq: CheckoutsEnqueue,
): Partial<CheckoutsMachineContext> => {
  const runId = context.pendingRetirements[0];
  if (runId !== undefined) {
    publish(context, enq, { type: 'leaseRetired', runId });
  }
  return { pendingRetirements: context.pendingRetirements.slice(1), retirementKeys: withoutKey(context, runId) };
};

const checkoutsMachineDefinition = setup({
  schemas: {
    context: types<CheckoutsMachineContext>(),
    events: eventSchemas<CheckoutsMachineEvent>(),
    emitted: eventSchemas<CheckoutsMachineEmitted>(),
    input: types<CheckoutsMachineInput>(),
  },
  actors: {
    listCheckouts: createAsyncLogic<ListCheckoutsActorOutput, Readonly<{ projectId: string }>>({
      run: async () => {
        throw new Error('checkoutsMachine: the listCheckouts actor was not provided.');
      },
    }),
    addCheckout: createAsyncLogic<
      AddCheckoutActorOutput,
      Readonly<{ projectId: string; branch: string; from: string }>
    >({
      run: async () => {
        throw new Error('checkoutsMachine: the addCheckout actor was not provided.');
      },
    }),
    removeCheckout: createAsyncLogic<void, Readonly<{ projectId: string; id: string }>>({
      run: async () => {
        throw new Error('checkoutsMachine: the removeCheckout actor was not provided.');
      },
    }),
    retireLease: createAsyncLogic<void, Readonly<{ projectId: string; runId: string; key?: TurnAttemptKey }>>({
      run: async () => {
        throw new Error('checkoutsMachine: the retireLease actor was not provided.');
      },
    }),
  },
  guards: {
    /* One checkout per branch (I18): a branch that has one cannot get another. */
    branchIsFree: (context: CheckoutsMachineContext, branch: string) =>
      !context.checkouts.some((checkout) => checkout.branch === branch),
    /* A25/I9: a checkout a lease holds is never removed. */
    checkoutIsFree: (context: CheckoutsMachineContext, id: string) =>
      context.checkouts.some((checkout) => checkout.id === id && checkout.leaseRunIds.length === 0),
    hasPendingRetirement: (context: CheckoutsMachineContext) => context.pendingRetirements.length > 0,
    hasPendingLease: (context: CheckoutsMachineContext) => context.pendingLeases.length > 0,
    hasPendingOperation: (context: CheckoutsMachineContext) => context.pendingOperations.length > 0,
    /* A lease naming no known record — or one whose turn has already ended —
     * changes nothing, so it must not churn the host with a re-announcement. */
    hasApplicableLease: (context: CheckoutsMachineContext) =>
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
    hasPhantomRetirement: (context: CheckoutsMachineContext) =>
      context.pendingRetirements.some(
        (runId) =>
          !context.checkouts.some((checkout) => checkout.leaseRunIds.includes(runId)) &&
          !context.pendingLeases.some((lease) => lease.runId === runId),
      ),
  },
}).createMachine({
  id: 'checkouts',
  context: ({ input }) => ({
    projectId: input.projectId,
    checkouts: [],
    pendingRetirements: [],
    retirementKeys: {},
    pendingLeases: [],
    pendingOperations: [],
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
   *
   * R1: a lease written inside a turn is invisible to the `listCheckouts`
   * output the registry loaded earlier, so the turn reports it. R22: it can
   * arrive before there is any record to put it on, so it is always buffered
   * and applied from one place.
   */
  on: {
    leaseWritten: {
      context: ({ context, event }) => ({
        pendingLeases: [...context.pendingLeases, { checkoutId: event.checkoutId, runId: event.runId }],
      }),
    },
    turnEnded: { context: ({ context, event }) => queueRetirements(context, event) },
    /* Queued in every state and served from `ready.idle`, answered by id either way (RM-R11). */
    addCheckout: { context: ({ context, event }) => queueOperation(context, event) },
    removeCheckout: { context: ({ context, event }) => queueOperation(context, event) },
  },
  states: {
    /* No epoch sweep on open (W8 TS-S7): a lease retires only on `acknowledge`, after its settlement row (I25). */
    idle: {
      on: { open: { target: 'loading' } },
    },
    loading: {
      /* A reopen asks for records written after this read began: read again. */
      on: { open: { target: 'loading', reenter: true } },
      invoke: {
        src: 'listCheckouts',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: ({ context, event }, enq) => {
          const patch = { checkouts: event.output.checkouts };
          announceRegistry({ ...context, ...patch }, enq);
          return { target: 'ready', context: patch };
        },
        /* R2/W6: a registry that could not load used to rest here silently, so
         * a host waiting on the first announcement waited out its whole bound
         * with nothing to show a person. `failed` is still where it rests; it
         * now says so on the way. */
        onError: ({ context, event }, enq) => ({
          target: 'failed',
          context: failOperation(context, enq, { error: event.error, operation: 'open' }),
        }),
      },
    },
    failed: {
      entry: ({ context }, enq) => {
        refuseOperations(context, enq, context.pendingOperations);
        return { context: { pendingOperations: [] } };
      },
      on: {
        open: { target: 'loading' },
        addCheckout: ({ context, event }, enq) => {
          refuseOperations(context, enq, [operationOf(event)]);
          return {};
        },
        removeCheckout: ({ context, event }, enq) => {
          refuseOperations(context, enq, [operationOf(event)]);
          return {};
        },
      },
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
          always: ({ context, guards }, enq) => {
            if (guards.hasApplicableLease(context)) {
              const patch = applyLeases(context);
              announceRegistry({ ...context, ...patch }, enq);
              return { context: patch };
            }
            if (guards.hasPendingLease(context)) {
              return { context: applyLeases(context) };
            }
            if (guards.hasPhantomRetirement(context)) {
              return {
                context: {
                  pendingRetirements: context.pendingRetirements.filter((runId) =>
                    context.checkouts.some((checkout) => checkout.leaseRunIds.includes(runId)),
                  ),
                },
              };
            }
            if (guards.hasPendingRetirement(context)) {
              return { target: 'retiring' };
            }
            if (!guards.hasPendingOperation(context)) {
              return undefined;
            }
            const [operation, ...rest] = context.pendingOperations;
            if (operation?.kind === 'add') {
              if (guards.branchIsFree(context, operation.branch)) {
                return { target: 'adding' };
              }
              announceFailure(context, enq, {
                operation: 'add',
                requestId: operation.requestId,
                reason: 'That branch already has a checkout.',
                code: 'CHECKOUT_CONFLICT',
              });
              return { context: { pendingOperations: rest } };
            }
            if (operation !== undefined && guards.checkoutIsFree(context, operation.id)) {
              return { target: 'removing' };
            }
            /* Policy Rule 1: *lease* and *checkout* are engineering terms
             * and this sentence reaches a toast and the CLI. What the
             * person can act on is which branch is busy. */
            announceFailure(context, enq, {
              operation: 'remove',
              ...(operation === undefined ? {} : { requestId: operation.requestId }),
              reason: `An agent is working in ${
                context.checkouts.find((checkout) => checkout.id === (operation?.kind === 'remove' ? operation.id : ''))
                  ?.branch ?? 'this branch'
              }.`,
            });
            return { context: { pendingOperations: rest } };
          },
        },
        adding: {
          invoke: {
            src: 'addCheckout',
            input: ({ context }) => {
              const operation = context.pendingOperations[0];
              return {
                projectId: context.projectId,
                branch: operation?.kind === 'add' ? operation.branch : '',
                from: operation?.kind === 'add' ? operation.from : '',
              };
            },
            onDone: ({ context, event }, enq) => {
              const patch = {
                checkouts: [...context.checkouts, event.output.checkout],
                pendingOperations: context.pendingOperations.slice(1),
              };
              announceRegistry({ ...context, ...patch }, enq);
              publish(context, enq, {
                type: 'checkoutAdded',
                requestId: context.pendingOperations[0]?.requestId ?? '',
                checkout: event.output.checkout,
              });
              return { target: 'idle', context: patch };
            },
            onError: ({ context, event }, enq) => ({
              target: 'idle',
              context: {
                ...failOperation(context, enq, {
                  error: event.error,
                  operation: 'add',
                  requestId: context.pendingOperations[0]?.requestId ?? '',
                }),
                pendingOperations: context.pendingOperations.slice(1),
              },
            }),
          },
        },
        removing: {
          invoke: {
            src: 'removeCheckout',
            input: ({ context }) => {
              const operation = context.pendingOperations[0];
              return { projectId: context.projectId, id: operation?.kind === 'remove' ? operation.id : '' };
            },
            onDone: ({ context }, enq) => {
              const operation = context.pendingOperations[0];
              const removed = operation?.kind === 'remove' ? operation.id : '';
              const patch = {
                checkouts: context.checkouts.filter((checkout) => checkout.id !== removed),
                pendingOperations: context.pendingOperations.slice(1),
              };
              announceRegistry({ ...context, ...patch }, enq);
              publish(context, enq, {
                type: 'checkoutRemoved',
                requestId: operation?.requestId ?? '',
                checkoutId: removed,
              });
              return { target: 'idle', context: patch };
            },
            onError: ({ context, event }, enq) => ({
              target: 'idle',
              context: {
                ...failOperation(context, enq, {
                  error: event.error,
                  operation: 'remove',
                  requestId: context.pendingOperations[0]?.requestId ?? '',
                }),
                pendingOperations: context.pendingOperations.slice(1),
              },
            }),
          },
        },
        retiring: {
          invoke: {
            src: 'retireLease',
            input: ({ context }) => {
              const runId = context.pendingRetirements[0] ?? '';
              const key = context.retirementKeys[runId];
              return { projectId: context.projectId, runId, ...(key === undefined ? {} : { key }) };
            },
            onDone: ({ context }, enq) => {
              const dropped = { ...context, ...dropRetiredLease(context) };
              const completed = { ...dropped, ...completeRetirement(dropped, enq) };
              announceRegistry(completed, enq);
              return {
                target: 'idle',
                context: {
                  checkouts: completed.checkouts,
                  pendingRetirements: completed.pendingRetirements,
                  retirementKeys: completed.retirementKeys,
                },
              };
            },
            onError: ({ context, event }, enq) => {
              const patch = {
                reason: describeFailure(event.error),
                reasonCode: describeFailureCode(event.error),
                pendingRetirements: context.pendingRetirements.slice(1),
                retirementKeys: withoutKey(context, context.pendingRetirements[0]),
              };
              announceFailure({ ...context, ...patch }, enq, { operation: 'retire' });
              return { target: 'idle', context: patch };
            },
          },
        },
      },
    },
  },
});

type CheckoutsMachineDefinition = typeof checkoutsMachineDefinition;

/**
 * The type of {@link checkoutsMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface CheckoutsMachine extends CheckoutsMachineDefinition {}

/**
 * Headless checkout registry for one project.
 *
 * @public
 */
export const checkoutsMachine: CheckoutsMachine = checkoutsMachineDefinition;

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
export type CheckoutsActors = MachineActors<typeof checkoutsMachine>;
