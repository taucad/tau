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

import { createAsyncLogic, setup, types } from 'xstate';
import type { AnyActorRef, EnqueueObject, SnapshotFrom } from 'xstate';

import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';
import type { CheckoutRecord, ConflictRecord, RevisionPortErrorCode } from '#revision-port.js';
import type { TurnSettlement } from '#turn.machine.js';

/** What a registry operation was doing when it failed or was refused. @public */
export type CheckoutOperation = 'open' | 'add' | 'remove' | 'retire';

/** Input accepted when creating the checkoutsMachine actor. @public */
export type CheckoutsMachineInput = Readonly<{
  projectId: string;
  parentRef?: AnyActorRef;
}>;

/* The fields of {@link CheckoutsMachineContext}, named by the interface below. */
type CheckoutsMachineContextFields = Readonly<{
  projectId: string;
  checkouts: readonly CheckoutRecord[];
  /** Every conflicted revision no decision has landed yet, as the last listing read them (D14). */
  conflicts: readonly ConflictRecord[];
  /** Run ids awaiting retirement, served one at a time in arrival order. */
  pendingRetirements: readonly string[];
  /** Leases reported before the registry had records to put them on (R22). */
  pendingLeases: ReadonlyArray<Readonly<{ checkoutId: string | undefined; runId: string }>>;
  /**
   * `addCheckout`/`removeCheckout` in arrival order; the head is the one
   * `adding` or `removing` runs. A verb that arrives before the records load,
   * or while another verb or a retirement runs, waits here rather than being
   * dropped, so no caller waits out its bound for a busy registry (W4 a3c).
   */
  pendingVerbs: ReadonlyArray<Extract<CheckoutsMachineEvent, { type: 'addCheckout' | 'removeCheckout' }>>;
  reason: string | undefined;
  /** The refusal's stable category, when the port named one (P4). */
  reasonCode: RevisionPortErrorCode | undefined;
  parentRef: AnyActorRef | undefined;
}>;

/** Serializable state owned by checkoutsMachine. @public */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference it by name, where an alias is expanded into every transition of this machine and of any machine that holds it (K-17, TS7056)
export interface CheckoutsMachineContext extends CheckoutsMachineContextFields {}

/** Events accepted by checkoutsMachine. @public */
export type CheckoutsMachineEvent =
  | Readonly<{ type: 'open' }>
  | Readonly<{ type: 'addCheckout'; branch: string; from: string }>
  | Readonly<{ type: 'removeCheckout'; id: string }>
  | Readonly<{ type: 'leaseStale'; runId: string }>
  | Readonly<{ type: 'leaseWritten'; checkoutId: string | undefined; runId: string }>
  | (Readonly<{ type: 'turnFinalized' }> & TurnSettlement)
  /* A conflicted turn deleted its lease file as it settled, like a finalized one (RV-W5b F1). */
  | (Readonly<{ type: 'turnConflicted' }> & TurnSettlement)
  /* A turn that ended without a settlement still had a lease (R12). */
  | Readonly<{ type: 'turnReleased'; turnId: string; checkoutId: string | undefined; runId: string }>;

/** Facts checkoutsMachine emits, and sends to its parent when they change the registry. @public */
export type CheckoutsMachineEmitted =
  | Readonly<{ type: 'checkoutsChanged'; checkouts: readonly CheckoutRecord[]; conflicts: readonly ConflictRecord[] }>
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  | Readonly<{ type: 'removalOffered'; checkoutId: string }>
  /* P4: a refusal crosses as a code; the page that shows it owns the words. */
  | Readonly<{ type: 'checkoutFailed'; operation: CheckoutOperation; reason: string; code?: RevisionPortErrorCode }>;

/** Output of the injected `sweepLeases` actor: the epoch comparison (F13). @public */
export type SweepLeasesActorOutput = Readonly<{ retiredRunIds: readonly string[] }>;

/** Output of the injected `listCheckouts` actor. @public */
export type ListCheckoutsActorOutput = Readonly<{
  checkouts: readonly CheckoutRecord[];
  /** Read from the conflict lines by ancestry (D14). */
  conflicts: readonly ConflictRecord[];
}>;

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

const announceRegistry = (context: CheckoutsMachineContext, enq: CheckoutsEnqueue): void => {
  publish(context, enq, { type: 'checkoutsChanged', checkouts: context.checkouts, conflicts: context.conflicts });
  for (const checkout of context.checkouts) {
    if (checkout.removable === true) {
      publish(context, enq, { type: 'removalOffered', checkoutId: checkout.id });
    }
  }
};

const announceFailure = (
  context: CheckoutsMachineContext,
  enq: CheckoutsEnqueue,
  failure: Readonly<{ operation: CheckoutOperation; reason?: string; code?: RevisionPortErrorCode }>,
): void => {
  const { operation, reason, code } = failure;
  /* R11: the root routes this to the workbench; an emit alone never
   * leaves this actor. */
  publish(context, enq, {
    type: 'checkoutFailed',
    operation,
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
  failure: Readonly<{ error: unknown; operation: CheckoutOperation }>,
): Partial<CheckoutsMachineContext> => {
  const { error, operation } = failure;
  const patch = { reason: describeFailure(error), reasonCode: describeFailureCode(error) };
  announceFailure({ ...context, ...patch }, enq, { operation });
  return patch;
};

/* The checkout `removing` drops: the head verb's. */
const removingId = (context: CheckoutsMachineContext): string => {
  const verb = context.pendingVerbs[0];
  return verb?.type === 'removeCheckout' ? verb.id : '';
};

/* A verb the registry's own guards refuse: one checkout per branch (I18), and
 * never a checkout a lease holds (A25/I9). */
const refuseVerb = (
  context: CheckoutsMachineContext,
  enq: CheckoutsEnqueue,
  verb: CheckoutsMachineContext['pendingVerbs'][number],
): void => {
  if (verb.type === 'addCheckout') {
    announceFailure(context, enq, {
      operation: 'add',
      reason: 'That branch already has a checkout.',
      code: 'CHECKOUT_CONFLICT',
    });
    return;
  }
  /* Policy Rule 1: *lease* and *checkout* are engineering terms and this
   * sentence reaches a toast and the CLI. What the person can act on is
   * which branch is busy. */
  announceFailure(context, enq, {
    operation: 'remove',
    reason: `An agent is working in ${
      context.checkouts.find((checkout) => checkout.id === verb.id)?.branch ?? 'this branch'
    }.`,
  });
};

const queueRetirements = (
  context: CheckoutsMachineContext,
  event: CheckoutsMachineEvent,
): Partial<CheckoutsMachineContext> => {
  /* R2: `runIds` is the provenance set — every lease the writer saw on
   * the checkout. Retiring all of them takes the other chat's lease
   * (AC9), so a settlement retires only its own `runId`. */
  const runIds =
    event.type === 'leaseStale' ||
    event.type === 'turnFinalized' ||
    event.type === 'turnConflicted' ||
    event.type === 'turnReleased'
      ? [event.runId]
      : [];
  const added = runIds.filter((runId) => !context.pendingRetirements.includes(runId));
  return { pendingRetirements: [...context.pendingRetirements, ...added] };
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

const completeRetirement = (
  context: CheckoutsMachineContext,
  enq: CheckoutsEnqueue,
): Partial<CheckoutsMachineContext> => {
  const runId = context.pendingRetirements[0];
  if (runId !== undefined) {
    publish(context, enq, { type: 'leaseRetired', runId });
  }
  return { pendingRetirements: context.pendingRetirements.slice(1) };
};

/* Drop the head retirement's lease from the record, say so, and re-announce the registry. */
const retire = (context: CheckoutsMachineContext, enq: CheckoutsEnqueue): Partial<CheckoutsMachineContext> => {
  const dropped = { ...context, ...dropRetiredLease(context) };
  const completed = { ...dropped, ...completeRetirement(dropped, enq) };
  announceRegistry(completed, enq);
  return { checkouts: completed.checkouts, pendingRetirements: completed.pendingRetirements };
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
    sweepLeases: createAsyncLogic<SweepLeasesActorOutput, Readonly<{ projectId: string }>>({
      run: async () => {
        throw new Error('checkoutsMachine: the sweepLeases actor was not provided.');
      },
    }),
    retireLease: createAsyncLogic<void, Readonly<{ projectId: string; runId: string }>>({
      run: async () => {
        throw new Error('checkoutsMachine: the retireLease actor was not provided.');
      },
    }),
  },
  guards: {
    /* One checkout per branch (I18): a branch that has one cannot get another. */
    branchIsFree: (context: CheckoutsMachineContext, branch: string) =>
      !context.checkouts.some((checkout) => checkout.branch === branch),
    /* The checkout this add asks for is already on disk: an `open` cancelled
     * the add after it landed. A checkout's id is its branch's, so the same
     * branch at the same base is that very checkout; the live one never is. */
    alreadyAdded: (context: CheckoutsMachineContext, verb: Readonly<{ branch: string; from: string }>) =>
      verb.from !== '' &&
      context.checkouts.some(
        (checkout) =>
          checkout.kind === 'linked' && checkout.branch === verb.branch && checkout.headRevisionId === verb.from,
      ),
    /* A25/I9: a checkout a lease holds is never removed. */
    checkoutIsFree: (context: CheckoutsMachineContext, id: string) =>
      context.checkouts.some((checkout) => checkout.id === id && checkout.leaseRunIds.length === 0),
    hasPendingRetirement: (context: CheckoutsMachineContext) => context.pendingRetirements.length > 0,
    hasPendingLease: (context: CheckoutsMachineContext) => context.pendingLeases.length > 0,
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
    conflicts: [],
    pendingRetirements: [],
    pendingLeases: [],
    pendingVerbs: [],
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
    leaseStale: { context: ({ context, event }) => queueRetirements(context, event) },
    turnFinalized: { context: ({ context, event }) => queueRetirements(context, event) },
    turnConflicted: { context: ({ context, event }) => queueRetirements(context, event) },
    turnReleased: { context: ({ context, event }) => queueRetirements(context, event) },
    addCheckout: { context: ({ context, event }) => ({ pendingVerbs: [...context.pendingVerbs, event] }) },
    removeCheckout: { context: ({ context, event }) => ({ pendingVerbs: [...context.pendingVerbs, event] }) },
  },
  states: {
    idle: {
      on: { open: { target: 'recovering' } },
    },
    recovering: {
      invoke: {
        src: 'sweepLeases',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: ({ context, event }, enq) => {
          for (const runId of event.output.retiredRunIds) {
            publish(context, enq, { type: 'leaseRetired', runId });
          }
          return { target: 'loading' };
        },
        onError: ({ context, event }, enq) => ({
          target: 'failed',
          context: { ...failOperation(context, enq, { error: event.error, operation: 'open' }), pendingVerbs: [] },
        }),
      },
    },
    loading: {
      invoke: {
        src: 'listCheckouts',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: ({ context, event }, enq) => {
          const patch = { checkouts: event.output.checkouts, conflicts: event.output.conflicts };
          announceRegistry({ ...context, ...patch }, enq);
          return { target: 'ready', context: patch };
        },
        /* R2/W6: a registry that could not load used to rest here silently, so
         * a host waiting on the first announcement waited out its whole bound
         * with nothing to show a person. `failed` is still where it rests; it
         * now says so on the way. */
        onError: ({ context, event }, enq) => ({
          target: 'failed',
          context: { ...failOperation(context, enq, { error: event.error, operation: 'open' }), pendingVerbs: [] },
        }),
      },
    },
    /* A registry that could not open answers each verb with that refusal at
     * once; a verb queued before the open failed was answered by the open's own. */
    failed: {
      on: {
        open: { target: 'recovering' },
        addCheckout: ({ context }, enq) => {
          announceFailure(context, enq, { operation: 'add' });
          return {};
        },
        removeCheckout: ({ context }, enq) => {
          announceFailure(context, enq, { operation: 'remove' });
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
            /* Then the verbs, one at a time: a removal queued behind a
             * retirement sees the lease that retirement dropped. */
            const verb = context.pendingVerbs[0];
            if (verb === undefined) {
              return undefined;
            }
            if (verb.type === 'addCheckout' && guards.alreadyAdded(context, verb)) {
              /* Done, not refused: the announcement is what settles the asker. */
              announceRegistry(context, enq);
              return { context: { pendingVerbs: context.pendingVerbs.slice(1) } };
            }
            if (verb.type === 'addCheckout' && guards.branchIsFree(context, verb.branch)) {
              return { target: 'adding' };
            }
            if (verb.type === 'removeCheckout' && guards.checkoutIsFree(context, verb.id)) {
              return { target: 'removing' };
            }
            refuseVerb(context, enq, verb);
            return { context: { pendingVerbs: context.pendingVerbs.slice(1) } };
          },
        },
        adding: {
          invoke: {
            src: 'addCheckout',
            input: ({ context }) => {
              const verb = context.pendingVerbs[0];
              return {
                projectId: context.projectId,
                branch: verb?.type === 'addCheckout' ? verb.branch : '',
                from: verb?.type === 'addCheckout' ? verb.from : '',
              };
            },
            onDone: ({ context, event }, enq) => {
              const patch = {
                checkouts: [...context.checkouts, event.output.checkout],
                pendingVerbs: context.pendingVerbs.slice(1),
              };
              announceRegistry({ ...context, ...patch }, enq);
              return { target: 'idle', context: patch };
            },
            onError: ({ context, event }, enq) => ({
              target: 'idle',
              context: {
                ...failOperation(context, enq, { error: event.error, operation: 'add' }),
                pendingVerbs: context.pendingVerbs.slice(1),
              },
            }),
          },
        },
        removing: {
          invoke: {
            src: 'removeCheckout',
            input: ({ context }) => ({ projectId: context.projectId, id: removingId(context) }),
            onDone: ({ context }, enq) => {
              const patch = {
                checkouts: context.checkouts.filter((checkout) => checkout.id !== removingId(context)),
                pendingVerbs: context.pendingVerbs.slice(1),
              };
              announceRegistry({ ...context, ...patch }, enq);
              return { target: 'idle', context: patch };
            },
            onError: ({ context, event }, enq) => ({
              target: 'idle',
              context: {
                ...failOperation(context, enq, { error: event.error, operation: 'remove' }),
                pendingVerbs: context.pendingVerbs.slice(1),
              },
            }),
          },
        },
        retiring: {
          invoke: {
            src: 'retireLease',
            input: ({ context }) => ({
              projectId: context.projectId,
              runId: context.pendingRetirements[0] ?? '',
            }),
            onDone: ({ context }, enq) => ({ target: 'idle', context: retire(context, enq) }),
            /* A lease whose file this host could not delete is still not a lease
             * this host holds, and `sweepLeases` owns the file: keeping the run
             * id on the record pinned the checkout as leased — Discard and the
             * switch guard refusing it — until the project was reopened
             * (L2-F11). The failure is still said. */
            onError: ({ context, event }, enq) => {
              const failure = { reason: describeFailure(event.error), reasonCode: describeFailureCode(event.error) };
              announceFailure({ ...context, ...failure }, enq, { operation: 'retire' });
              return { target: 'idle', context: { ...failure, ...retire(context, enq) } };
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
