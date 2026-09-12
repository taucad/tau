/**
 * `checkout.machine` — one actor per checkout, and the only minter.
 *
 * Every revision on a checkout's branch is written here: turns, branch and
 * restore operations ask by sending `cut`, and the tree-hash gate (I5), the
 * compare-and-swap of the branch head (I7) and the lost-CAS re-read (D24) exist
 * exactly once. The write generation is what keeps a write that lands during a
 * mint from being lost: the mint returns to `dirty`, not `clean`.
 *
 * The machine imports nothing but XState. Hashing, writing, publishing and the
 * fence lock are injected actors the host supplies through `provide({ actors })`.
 */

import { assign, enqueueActions, fromCallback, fromPromise, setup } from 'xstate';
import type { AnyActorRef, AnyEventObject, SnapshotFrom } from 'xstate';

/** What asked for a cut. `save`, `hidden`, `close` and `idle` are wired by W6. @public */
export type CheckoutCutTrigger = 'turn' | 'save' | 'idle' | 'hidden' | 'close' | 'merge' | 'restore' | 'switch';

/** One outstanding request to mint a revision from this checkout. @public */
export type CheckoutCutRequest = Readonly<{
  trigger: CheckoutCutTrigger;
  /** The turn awaiting the outcome, when a turn asked. */
  turnId?: string;
  /** Run ids of the leases on this checkout when the request was made. */
  leaseIds: readonly string[];
}>;

/** Settled condition of one checkout, as its parent reads it. @public */
export type CheckoutStatus = 'clean' | 'dirty' | 'minting' | 'stale' | 'failed';

/** Input accepted when creating the checkoutMachine actor. @public */
export type CheckoutMachineInput = Readonly<{
  checkoutId: string;
  /** The branch this checkout tracks; `undefined` when it is detached. */
  branch?: string;
  /** Head revision recorded for the branch, rehydrated from records (I3). */
  headRevisionId?: string;
  /** Tree object id of that head — the left-hand side of the I5 gate. */
  headTreeId?: string;
  /** The `project-revisions` root, which routes outcomes back to the requester. */
  parentRef?: AnyActorRef;
}>;

/** Serializable state owned by checkoutMachine. @public */
export type CheckoutMachineContext = Readonly<{
  checkoutId: string;
  branch: string | undefined;
  headRevisionId: string | undefined;
  headTreeId: string | undefined;
  parentRef: AnyActorRef | undefined;
  /** Monotonic counter of content-change events, supplied by the seam. */
  writeGeneration: number;
  /** The write generation the running mint cut at. */
  cutGeneration: number;
  /** The request the current mint serves. */
  pending: CheckoutCutRequest | undefined;
  /** Requests that arrived while a mint was running, served in order. */
  queued: readonly CheckoutCutRequest[];
  /** Opaque handle to the cut the host is holding for `writeRevision`. */
  cutId: string | undefined;
  /** Tree object id the running mint cut. */
  cutTreeId: string | undefined;
  revisionId: string | undefined;
  reason: string | undefined;
}>;

/** Events accepted by checkoutMachine. @public */
export type CheckoutMachineEvent =
  /** One content-change event, never one per path (A38). */
  | Readonly<{ type: 'changed'; paths: readonly string[]; generation: number }>
  | Readonly<{ type: 'cut'; trigger: CheckoutCutTrigger; turnId?: string; leaseIds: readonly string[] }>
  | Readonly<{ type: 'headChanged'; revisionId: string; treeId: string }>
  | Readonly<{ type: 'fenceGranted' }>
  | Readonly<{ type: 'fenceRefused'; reason: string }>;

/** Facts checkoutMachine emits for observers and sends to its parent. @public */
export type CheckoutMachineEmitted =
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
  | Readonly<{
      type: 'checkoutStatusChanged';
      checkoutId: string;
      status: CheckoutStatus;
      headRevisionId?: string;
    }>;

/** Input of the injected `cut` actor: hash the checkout's versioned tree. @public */
export type CheckoutCutActorInput = Readonly<{ checkoutId: string; trigger: CheckoutCutTrigger }>;

/**
 * Output of the injected `cut` actor.
 *
 * `cutId` is an opaque handle to the tree the host is holding, so the tree
 * itself never enters machine context and the snapshot stays serializable.
 *
 * @public
 */
export type CheckoutCutActorOutput = Readonly<{ treeId: string; cutId: string }>;

/** Input of the injected `writeRevision` actor. @public */
export type CheckoutWriteRevisionActorInput = Readonly<{
  checkoutId: string;
  cutId: string;
  treeId: string;
  parents: readonly string[];
  trigger: CheckoutCutTrigger;
  turnId?: string;
  leaseIds: readonly string[];
}>;

/** Input of the injected `casHead` actor: publish the branch head expected-old (I7). @public */
export type CheckoutCasHeadActorInput = Readonly<{
  checkoutId: string;
  branch: string | undefined;
  expectedHead: string | undefined;
  head: string;
}>;

/** Outcome of one expected-old head publication. @public */
export type CheckoutCasHeadActorOutput = Readonly<{ status: 'updated' | 'conflicted'; head: string | undefined }>;

/** Input of the injected `fence` actor: the lock this checkout mints under. @public */
export type CheckoutFenceActorInput = Readonly<{ checkoutId: string }>;

/** Output of the injected `readHead` actor, used by the D24 re-read. @public */
export type CheckoutHead = Readonly<{ revisionId: string | undefined; treeId: string | undefined }>;

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'The cut failed.';

const announcement = (
  context: CheckoutMachineContext,
  fact:
    | Readonly<{ type: 'revisionMinted'; revisionId: string }>
    | Readonly<{ type: 'nothingToSave' }>
    | Readonly<{ type: 'cutFailed'; reason: string }>
    | Readonly<{ type: 'casLost' }>,
): CheckoutMachineEmitted | undefined => {
  const { pending } = context;
  if (pending === undefined) {
    return undefined;
  }
  const addressed = {
    checkoutId: context.checkoutId,
    trigger: pending.trigger,
    ...(pending.turnId === undefined ? {} : { turnId: pending.turnId }),
  };
  return { ...fact, ...addressed };
};

const requestFromEvent = (event: CheckoutMachineEvent): CheckoutCutRequest | undefined =>
  event.type === 'cut'
    ? {
        trigger: event.trigger,
        leaseIds: event.leaseIds,
        ...(event.turnId === undefined ? {} : { turnId: event.turnId }),
      }
    : undefined;

/**
 * Headless minting core for one checkout.
 *
 * @public
 */
export const checkoutMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as CheckoutMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as CheckoutMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    emitted: {} as CheckoutMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as CheckoutMachineInput,
  },
  actors: {
    cut: fromPromise<CheckoutCutActorOutput, CheckoutCutActorInput>(async () => {
      throw new Error('checkoutMachine: the cut actor was not provided.');
    }),
    writeRevision: fromPromise<Readonly<{ revisionId: string }>, CheckoutWriteRevisionActorInput>(async () => {
      throw new Error('checkoutMachine: the writeRevision actor was not provided.');
    }),
    casHead: fromPromise<CheckoutCasHeadActorOutput, CheckoutCasHeadActorInput>(async () => {
      throw new Error('checkoutMachine: the casHead actor was not provided.');
    }),
    readHead: fromPromise<CheckoutHead, CheckoutFenceActorInput>(async () => {
      throw new Error('checkoutMachine: the readHead actor was not provided.');
    }),
    /*
     * The fence the mint runs under. It is a held resource, so it is a callback
     * actor: acquisition failure arrives as `fenceRefused`, never as `onError`.
     */
    fence: fromCallback<AnyEventObject, CheckoutFenceActorInput>(({ sendBack }) => {
      sendBack({ type: 'fenceRefused', reason: 'checkoutMachine: the fence actor was not provided.' });
      return () => undefined;
    }),
  },
  guards: {
    /* I5: a revision is minted only when the cut's tree differs from the head's. */
    treeUnchanged: ({ context }, params: Readonly<{ treeId: string }>) => params.treeId === context.headTreeId,
    /* F4: a write that landed during the mint leaves the checkout dirty. */
    writeGenerationUnchanged: ({ context }) => context.writeGeneration === context.cutGeneration,
    casConflicted: (_, params: Readonly<{ status: 'updated' | 'conflicted' }>) => params.status === 'conflicted',
    hasQueuedCut: ({ context }) => context.queued.length > 0,
  },
  actions: {
    recordWrite: assign({
      writeGeneration: ({ context, event }) =>
        event.type === 'changed' ? Math.max(context.writeGeneration, event.generation) : context.writeGeneration,
    }),
    adoptHead: assign({
      headRevisionId: ({ context, event }) =>
        event.type === 'headChanged' ? event.revisionId : context.headRevisionId,
      headTreeId: ({ context, event }) => (event.type === 'headChanged' ? event.treeId : context.headTreeId),
    }),
    takeRequest: assign({
      pending: ({ context, event }) => requestFromEvent(event) ?? context.pending,
      cutId: undefined,
      cutTreeId: undefined,
      revisionId: undefined,
      reason: undefined,
    }),
    queueRequest: assign({
      queued: ({ context, event }) => {
        const request = requestFromEvent(event);
        return request === undefined ? context.queued : [...context.queued, request];
      },
    }),
    takeQueuedRequest: assign({
      pending: ({ context }) => context.queued[0],
      queued: ({ context }) => context.queued.slice(1),
      cutId: undefined,
      cutTreeId: undefined,
      revisionId: undefined,
      reason: undefined,
    }),
    /* Send a settled status to the parent, which coalesces it into its projection. */
    reportStatus: enqueueActions(({ context, enqueue }, params: Readonly<{ status: CheckoutStatus }>) => {
      if (context.parentRef === undefined) {
        return;
      }
      const fact: CheckoutMachineEmitted = {
        type: 'checkoutStatusChanged',
        checkoutId: context.checkoutId,
        status: params.status,
        ...(context.headRevisionId === undefined ? {} : { headRevisionId: context.headRevisionId }),
      };
      enqueue.sendTo(context.parentRef, fact);
    }),
  },
}).createMachine({
  id: 'checkout',
  context: ({ input }) => ({
    checkoutId: input.checkoutId,
    branch: input.branch,
    headRevisionId: input.headRevisionId,
    headTreeId: input.headTreeId,
    parentRef: input.parentRef,
    writeGeneration: 0,
    cutGeneration: 0,
    pending: undefined,
    queued: [],
    cutId: undefined,
    cutTreeId: undefined,
    revisionId: undefined,
    reason: undefined,
  }),
  initial: 'clean',
  on: {
    /* One event per content-change event, whatever its path count (A38, F9). */
    changed: { actions: 'recordWrite' },
    headChanged: { actions: 'adoptHead' },
    /* Reached only from `minting`, `stale` and `rereading`; the resting states
     * below take `cut` straight into a mint. */
    cut: { actions: 'queueRequest' },
  },
  states: {
    clean: {
      entry: [{ type: 'reportStatus', params: { status: 'clean' } }],
      always: { guard: 'hasQueuedCut', target: 'minting', actions: 'takeQueuedRequest' },
      on: {
        changed: { target: 'dirty', actions: 'recordWrite' },
        cut: { target: 'minting', actions: 'takeRequest' },
      },
    },
    dirty: {
      entry: [{ type: 'reportStatus', params: { status: 'dirty' } }],
      always: { guard: 'hasQueuedCut', target: 'minting', actions: 'takeQueuedRequest' },
      on: {
        cut: { target: 'minting', actions: 'takeRequest' },
      },
    },
    minting: {
      entry: [
        assign({ cutGeneration: ({ context }) => context.writeGeneration }),
        { type: 'reportStatus', params: { status: 'minting' } },
      ],
      invoke: {
        id: 'fence',
        src: 'fence',
        input: ({ context }) => ({ checkoutId: context.checkoutId }),
      },
      initial: 'acquiring',
      states: {
        acquiring: {
          on: {
            fenceGranted: { target: 'cutting' },
            fenceRefused: {
              target: '#checkout.failed',
              actions: assign({ reason: ({ event }) => event.reason }),
            },
          },
        },
        cutting: {
          invoke: {
            src: 'cut',
            input: ({ context }) => ({
              checkoutId: context.checkoutId,
              trigger: context.pending?.trigger ?? 'save',
            }),
            onDone: [
              {
                guard: { type: 'treeUnchanged', params: ({ event }) => ({ treeId: event.output.treeId }) },
                target: 'settled',
                actions: enqueueActions(({ context, enqueue }) => {
                  const fact = announcement(context, { type: 'nothingToSave' });
                  if (fact === undefined) {
                    return;
                  }
                  enqueue.emit(fact);
                  if (context.parentRef !== undefined) {
                    enqueue.sendTo(context.parentRef, fact);
                  }
                }),
              },
              {
                target: 'writing',
                actions: assign({
                  cutId: ({ event }) => event.output.cutId,
                  cutTreeId: ({ event }) => event.output.treeId,
                }),
              },
            ],
            onError: {
              target: '#checkout.failed',
              actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
            },
          },
        },
        writing: {
          invoke: {
            src: 'writeRevision',
            input: ({ context }) => ({
              checkoutId: context.checkoutId,
              cutId: context.cutId ?? '',
              treeId: context.cutTreeId ?? '',
              parents: context.headRevisionId === undefined ? [] : [context.headRevisionId],
              trigger: context.pending?.trigger ?? 'save',
              ...(context.pending?.turnId === undefined ? {} : { turnId: context.pending.turnId }),
              leaseIds: context.pending?.leaseIds ?? [],
            }),
            onDone: {
              target: 'publishing',
              actions: assign({ revisionId: ({ event }) => event.output.revisionId }),
            },
            onError: {
              target: '#checkout.failed',
              actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
            },
          },
        },
        publishing: {
          invoke: {
            src: 'casHead',
            input: ({ context }) => ({
              checkoutId: context.checkoutId,
              branch: context.branch,
              expectedHead: context.headRevisionId,
              head: context.revisionId ?? '',
            }),
            onDone: [
              {
                guard: { type: 'casConflicted', params: ({ event }) => ({ status: event.output.status }) },
                target: '#checkout.stale',
                actions: enqueueActions(({ context, enqueue }) => {
                  const fact = announcement(context, { type: 'casLost' });
                  if (fact === undefined) {
                    return;
                  }
                  enqueue.emit(fact);
                  if (context.parentRef !== undefined) {
                    enqueue.sendTo(context.parentRef, fact);
                  }
                }),
              },
              {
                target: 'settled',
                actions: [
                  assign({
                    headRevisionId: ({ context }) => context.revisionId,
                    headTreeId: ({ context }) => context.cutTreeId,
                  }),
                  enqueueActions(({ context, enqueue }) => {
                    const fact = announcement(context, {
                      type: 'revisionMinted',
                      revisionId: context.revisionId ?? '',
                    });
                    if (fact === undefined) {
                      return;
                    }
                    enqueue.emit(fact);
                    if (context.parentRef !== undefined) {
                      enqueue.sendTo(context.parentRef, fact);
                    }
                  }),
                ],
              },
            ],
            onError: {
              target: '#checkout.failed',
              actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
            },
          },
        },
        settled: { type: 'final' },
      },
      /* F4: only an unchanged write generation may return to `clean`. */
      onDone: [{ guard: 'writeGenerationUnchanged', target: 'clean' }, { target: 'dirty' }],
    },
    stale: {
      entry: [{ type: 'reportStatus', params: { status: 'stale' } }],
      always: { target: 'rereading' },
    },
    rereading: {
      invoke: {
        src: 'readHead',
        input: ({ context }) => ({ checkoutId: context.checkoutId }),
        onDone: {
          target: 'dirty',
          actions: assign({
            headRevisionId: ({ event }) => event.output.revisionId,
            headTreeId: ({ event }) => event.output.treeId,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
        },
      },
    },
    /* Non-terminal: a full disk must not stop this checkout for good. */
    failed: {
      entry: [
        enqueueActions(({ context, enqueue }) => {
          const fact = announcement(context, {
            type: 'cutFailed',
            reason: context.reason ?? 'The cut failed.',
          });
          if (fact === undefined) {
            return;
          }
          enqueue.emit(fact);
          if (context.parentRef !== undefined) {
            enqueue.sendTo(context.parentRef, fact);
          }
        }),
        { type: 'reportStatus', params: { status: 'failed' } },
      ],
      on: {
        changed: { target: 'dirty', actions: 'recordWrite' },
        cut: { target: 'minting', actions: 'takeRequest' },
      },
    },
  },
});

/**
 * Selects whether this checkout has edits its head does not carry.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True unless the checkout is clean.
 * @public
 */
export const selectCheckoutDirty = (snapshot: SnapshotFrom<typeof checkoutMachine>): boolean =>
  !snapshot.matches('clean');

/**
 * Selects the revision this checkout's branch currently names.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The head revision id, or `undefined` on an unborn branch.
 * @public
 */
export const selectCheckoutHead = (snapshot: SnapshotFrom<typeof checkoutMachine>): string | undefined =>
  snapshot.context.headRevisionId;
