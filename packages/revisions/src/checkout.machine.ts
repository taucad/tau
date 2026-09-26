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

import { createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type { AnyActorRef, AnyEventObject, EnqueueObject, SnapshotFrom } from 'xstate';

import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';

/** What asked for a cut. @public */
export type CheckoutCutTrigger = 'turn' | 'save' | 'idle' | 'hidden' | 'close' | 'merge' | 'restore' | 'switch';

/**
 * How long a checkout stays quiet before it mints an `idle` revision (S30).
 *
 * Five minutes, from the architecture's checkpoint table and S30. It is the
 * default of {@link CheckoutMachineInput.idleWindow} rather than a constant the
 * machine reads, because the window is policy: a host — and the operator's own
 * ruling — revises it by passing a different value, never by editing a machine.
 *
 * @public
 */
export const checkoutIdleWindowMilliseconds = 5 * 60 * 1000;

/**
 * How many requests may wait behind one running mint.
 *
 * Trigger-only requests coalesce, so this bounds only turn-bearing ones, which
 * cannot coalesce without a turn losing its answer. A host that produced more
 * than this many concurrent turns on one checkout is already broken; refusing
 * the excess is how it finds out (W3b review R13).
 *
 * @public
 */
export const checkoutQueuedCutLimit = 16;

/** One outstanding request to mint a revision from this checkout. @public */
export type CheckoutCutRequest = Readonly<{
  trigger: CheckoutCutTrigger;
  /** The turn awaiting the outcome, when a turn asked. */
  turnId?: string;
  /** Run ids of the leases on this checkout when the request was made. */
  leaseIds: readonly string[];
  /** The revision whose tree a restore applied, when this cut records that restore (D1). */
  restoredFrom?: string;
  /** The requester's own id for this cut, echoed on its answer so a late one is never another's (N2). */
  requestId?: string;
}>;

/** Settled condition of one checkout, as its parent reads it. @public */
export type CheckoutStatus = 'clean' | 'dirty' | 'minting' | 'stale' | 'failed';

/** Input accepted when creating the checkoutMachine actor. @public */
export type CheckoutMachineInput = Readonly<{
  checkoutId: string;
  /** The branch this checkout tracks; `undefined` only when the store names none for it. */
  branch?: string;
  /** Head revision recorded for the branch, rehydrated from records (I3). */
  headRevisionId?: string;
  /** Tree object id of that head — the left-hand side of the I5 gate. */
  headTreeId?: string;
  /**
   * Quiet window before an `idle` revision, in milliseconds.
   *
   * Keyed by checkout because the timer lives in this actor: two tabs on one
   * shared checkout run one window between them, not one each (S30).
   */
  idleWindow?: number;
  /** The `project-revisions` root, which routes outcomes back to the requester. */
  parentRef?: AnyActorRef;
}>;

/* The fields of {@link CheckoutMachineContext}, named by the interface below. */
type CheckoutMachineContextFields = Readonly<{
  checkoutId: string;
  branch: string | undefined;
  headRevisionId: string | undefined;
  headTreeId: string | undefined;
  /** Quiet window before an `idle` revision, in milliseconds. */
  idleWindow: number;
  parentRef: AnyActorRef | undefined;
  /** Monotonic counter of content-change events, supplied by the seam. */
  writeGeneration: number;
  /** The write generation the running mint cut at. */
  cutGeneration: number;
  /**
   * The paths written since the last cut took them (NS15, E1).
   *
   * `undefined` is "unknown": the next capture reads every file. A checkout
   * spawns there and returns there whenever its head moves, so the first capture
   * against any head is a whole one (D4, I6).
   */
  changedPaths: readonly string[] | undefined;
  /** The paths the running mint took; a mint that fails gives them back. */
  cutPaths: readonly string[] | undefined;
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
  /**
   * Whether the spawn-time comparison of the live tree with the head's has run (D4).
   *
   * Once per actor: a checkout rehydrated from records trusts nothing about the
   * bytes under it until that one capture answers, and every later `clean` is a
   * state this actor reached itself. A head that moves before it answers asks
   * again against the new head rather than abandoning it (M5).
   */
  treeCompared: boolean;
}>;

/** Serializable state owned by checkoutMachine. @public */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference it by name, where an alias is expanded into every transition of this machine and of any machine that holds it (K-17, TS7056)
export interface CheckoutMachineContext extends CheckoutMachineContextFields {}

/** Events accepted by checkoutMachine. @public */
export type CheckoutMachineEvent =
  /** One content-change event, never one per path (A38). */
  | Readonly<{ type: 'changed'; paths: readonly string[]; generation: number }>
  | Readonly<{
      type: 'cut';
      trigger: CheckoutCutTrigger;
      turnId?: string;
      leaseIds: readonly string[];
      restoredFrom?: string;
      requestId?: string;
    }>
  | Readonly<{ type: 'headChanged'; revisionId: string; treeId: string }>
  /** The branch this checkout tracks is now another name: a live Switch or a rename (N9). */
  | Readonly<{ type: 'lineChanged'; branch: string }>
  | Readonly<{ type: 'fenceGranted' }>
  | Readonly<{ type: 'fenceRefused'; reason: string }>;

/** Facts checkoutMachine emits for observers and sends to its parent. @public */
export type CheckoutMachineEmitted =
  | Readonly<{
      type: 'revisionMinted';
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      requestId?: string;
      revisionId: string;
    }>
  | Readonly<{
      type: 'nothingToSave';
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      requestId?: string;
    }>
  | Readonly<{
      type: 'cutFailed';
      checkoutId: string;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      requestId?: string;
      reason: string;
    }>
  | Readonly<{ type: 'casLost'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string; requestId?: string }>
  | Readonly<{
      type: 'checkoutStatusChanged';
      checkoutId: string;
      status: CheckoutStatus;
      headRevisionId?: string;
    }>;

/**
 * Input of the injected `cut` actor: hash the checkout's versioned tree.
 *
 * `changedPaths` names every path written since the previous cut, or is absent
 * when that is unknown; a host whose change feed is complete re-reads only those (E1).
 *
 * @public
 */
export type CheckoutCutActorInput = Readonly<{
  checkoutId: string;
  trigger: CheckoutCutTrigger;
  changedPaths?: readonly string[] | undefined;
  /** The write generation the cut takes: every change event up to it is in the cut. */
  generation?: number;
}>;

/** Input of the injected `captureTree` actor: hash the live tree without holding it (D4). @public */
export type CheckoutCaptureTreeActorInput = Readonly<{
  checkoutId: string;
  changedPaths?: readonly string[] | undefined;
  /**
   * The write generation the comparison covers. A cut over the same one may
   * take the comparison's capture rather than read the same files again (E1).
   */
  generation?: number;
}>;

/** Output of the injected `captureTree` actor. @public */
export type CheckoutCaptureTreeActorOutput = Readonly<{ treeId: string }>;

/**
 * Output of the injected `cut` actor.
 *
 * `cutId` is an opaque handle to the tree the host is holding, so the tree
 * itself never enters machine context and the snapshot stays serializable.
 *
 * @public
 */
export type CheckoutCutActorOutput = Readonly<{
  treeId: string;
  cutId: string;
  /**
   * The host found nothing of this checkout's own to record: an unborn line
   * whose files are only generated setup or the bytes its open is about to
   * bring (E2E-D defect A). Minted, they would be a root the pull then merges
   * as unrelated history.
   */
  nothingToSave?: boolean;
}>;

/** Input of the injected `writeRevision` actor. @public */
export type CheckoutWriteRevisionActorInput = Readonly<{
  checkoutId: string;
  cutId: string;
  treeId: string;
  parents: readonly string[];
  trigger: CheckoutCutTrigger;
  turnId?: string;
  leaseIds: readonly string[];
  /** The revision a restore applied; only a `restore` cut that records one carries it (D1). */
  restoredFrom?: string;
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
    ...(pending.requestId === undefined ? {} : { requestId: pending.requestId }),
  };
  return { ...fact, ...addressed };
};

const requestFromEvent = (event: CheckoutMachineEvent): CheckoutCutRequest | undefined =>
  event.type === 'cut'
    ? {
        trigger: event.trigger,
        leaseIds: event.leaseIds,
        ...(event.turnId === undefined ? {} : { turnId: event.turnId }),
        ...(event.restoredFrom === undefined ? {} : { restoredFrom: event.restoredFrom }),
        ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
      }
    : undefined;

/* The wishes that only ever mean "record what is on disk". An operation's own
 * cut (`restore`, `switch`, `merge`) is a step its machine is waiting on by
 * trigger, so it never collapses into one of these (D1). */
const ambientTriggers: ReadonlySet<CheckoutCutTrigger> = new Set(['save', 'idle', 'hidden', 'close']);

/* The ambient triggers by strength: a stronger one records everything a weaker one asked for (RV-W2b #4). */
const ambientStrength = new Map<CheckoutCutTrigger, number>([
  ['idle', 0],
  ['save', 1],
  ['hidden', 2],
  ['close', 3],
]);

/**
 * Whether an answer to a cut with trigger `answered` also answers a waiter for `awaited`.
 *
 * Queued ambient requests collapse into the strongest of them (R13), so a
 * waiter for `save` or `hidden` may be answered by the `close` that absorbed
 * it. An operation's or a turn's trigger is answered only by itself.
 *
 * @param answered - The trigger the answer carries.
 * @param awaited - The trigger the waiter asked with.
 * @returns Whether the waiter may settle on this answer.
 * @public
 */
export const satisfiesCut = (answered: CheckoutCutTrigger, awaited: CheckoutCutTrigger): boolean => {
  const answeredStrength = ambientStrength.get(answered);
  const awaitedStrength = ambientStrength.get(awaited);
  return answeredStrength === undefined || awaitedStrength === undefined
    ? answered === awaited
    : answeredStrength >= awaitedStrength;
};

/**
 * Whether a cut request, or the answer to one, is ambient: `save`, `idle`, `hidden` or `close` with no turn.
 *
 * The line every host draws for its *save* channel: a turn's cut is answered
 * in its chat and an operation's own cut (`restore`, `switch`, `merge`) by the
 * child that asked, so neither may also read as a failed save (M3).
 *
 * @param request - A request, or an answer addressed with one's trigger and turn.
 * @returns Whether no turn and no operation is waiting on it.
 * @public
 */
export const isAmbientCut = (request: Readonly<{ trigger: CheckoutCutTrigger; turnId?: string }>): boolean =>
  request.turnId === undefined && ambientTriggers.has(request.trigger);

type CheckoutEnqueue = EnqueueObject<CheckoutMachineEvent, CheckoutMachineEmitted>;

/* Emit one addressed fact and send it to the parent; a fact with no pending request has no one to answer. */
const announce = (
  context: CheckoutMachineContext,
  enq: CheckoutEnqueue,
  fact: Parameters<typeof announcement>[1],
): void => {
  const addressed = announcement(context, fact);
  if (addressed === undefined) {
    return;
  }
  enq.emit(addressed);
  if (context.parentRef !== undefined) {
    enq.sendTo(context.parentRef, addressed);
  }
};

/* Whether a `headChanged` names a head other than the one this checkout already has (RV-W2b #3). */
const movedHead = (
  context: CheckoutMachineContext,
  event: Extract<CheckoutMachineEvent, { type: 'headChanged' }>,
): boolean => event.revisionId !== context.headRevisionId;

/*
 * A moved head also forgets the changed paths, so the capture that compares
 * the files with it reads all of them. Nothing about a head enters a capture —
 * the files a switch or a fast-forward writes reach `changed` like any other
 * write — so this is belt and braces for a host whose applies bypass its feed,
 * paid once per head move, not per save.
 */
const adoptHead = (event: Extract<CheckoutMachineEvent, { type: 'headChanged' }>): Partial<CheckoutMachineContext> => ({
  headRevisionId: event.revisionId,
  headTreeId: event.treeId,
  changedPaths: undefined,
});

/* ponytail: past this many distinct paths a whole capture is as cheap as the list; the next one reads everything. */
const changedPathLimit = 1024;

/* Two changed-path sets as one; unknown absorbs everything (E1). */
const unionPaths = (
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): readonly string[] | undefined => {
  if (left === undefined || right === undefined) {
    return undefined;
  }
  const union = [...new Set([...left, ...right])];
  return union.length > changedPathLimit ? undefined : union;
};

const recordWrite = (
  context: CheckoutMachineContext,
  event: Extract<CheckoutMachineEvent, { type: 'changed' }>,
): Partial<CheckoutMachineContext> => ({
  writeGeneration: Math.max(context.writeGeneration, event.generation),
  changedPaths: unionPaths(context.changedPaths, event.paths),
});

const takeRequest = (
  context: CheckoutMachineContext,
  event: CheckoutMachineEvent,
): Partial<CheckoutMachineContext> => ({
  pending: requestFromEvent(event) ?? context.pending,
  cutId: undefined,
  cutTreeId: undefined,
  revisionId: undefined,
  reason: undefined,
});

/*
 * R13: a burst of trigger-only requests is one request.
 *
 * `Mod+S` held down, an idle window that fires while the tab is being
 * hidden, and `hidden` followed by `pagehide` all describe the same wish —
 * "record what is on disk" — and the checkout can only honour it once. Two
 * consecutive ambient requests that no turn is waiting on therefore collapse
 * into the stronger trigger (`close` after `idle` is a close; a `save` after a
 * `close` is still a close), and {@link satisfiesCut} lets the absorbed
 * request's waiter settle on it (RV-W2b #4). A turn-bearing request never
 * collapses: its requester is waiting for an answer addressed to its own turn id.
 */
const queueRequest = (
  context: CheckoutMachineContext,
  event: CheckoutMachineEvent,
  enq: CheckoutEnqueue,
): Partial<CheckoutMachineContext> => {
  const request = requestFromEvent(event);
  if (request === undefined) {
    return {};
  }
  const last = context.queued.at(-1);
  if (last !== undefined && isAmbientCut(request) && isAmbientCut(last)) {
    const stronger = satisfiesCut(request.trigger, last.trigger) ? request : last;
    return { queued: [...context.queued.slice(0, -1), stronger] };
  }
  if (context.queued.length >= checkoutQueuedCutLimit) {
    announce({ ...context, pending: request }, enq, { type: 'cutFailed', reason: 'queue-full' });
    return {};
  }
  return { queued: [...context.queued, request] };
};

/* The idle window has no requester, so the request is synthesised here
 * rather than read off an event (S30). */
const takeIdleRequest = {
  pending: { trigger: 'idle', leaseIds: [] },
  cutId: undefined,
  cutTreeId: undefined,
  revisionId: undefined,
  reason: undefined,
} satisfies Partial<CheckoutMachineContext>;

const takeQueuedRequest = (context: CheckoutMachineContext): Partial<CheckoutMachineContext> => ({
  pending: context.queued[0],
  queued: context.queued.slice(1),
  cutId: undefined,
  cutTreeId: undefined,
  revisionId: undefined,
  reason: undefined,
});

/* R4: a request that waited behind a failed mint is still a request; the
 * queue is drained here, so nothing waits for a mint that will not run. */
const failQueuedRequests = (context: CheckoutMachineContext, enq: CheckoutEnqueue): Partial<CheckoutMachineContext> => {
  for (const request of context.queued) {
    announce({ ...context, pending: request }, enq, {
      type: 'cutFailed',
      reason: context.reason ?? 'The cut failed.',
    });
  }
  return { queued: [] };
};

/* Send a settled status to the parent, which coalesces it into its projection. */
const reportStatus = (context: CheckoutMachineContext, enq: CheckoutEnqueue, status: CheckoutStatus): void => {
  if (context.parentRef === undefined) {
    return;
  }
  const fact: CheckoutMachineEmitted = {
    type: 'checkoutStatusChanged',
    checkoutId: context.checkoutId,
    status,
    ...(context.headRevisionId === undefined ? {} : { headRevisionId: context.headRevisionId }),
  };
  enq.sendTo(context.parentRef, fact);
};

const checkoutMachineDefinition = setup({
  schemas: {
    context: types<CheckoutMachineContext>(),
    events: eventSchemas<CheckoutMachineEvent>(),
    emitted: eventSchemas<CheckoutMachineEmitted>(),
    input: types<CheckoutMachineInput>(),
  },
  actors: {
    cut: createAsyncLogic<CheckoutCutActorOutput, CheckoutCutActorInput>({
      run: async () => {
        throw new Error('checkoutMachine: the cut actor was not provided.');
      },
    }),
    writeRevision: createAsyncLogic<Readonly<{ revisionId: string }>, CheckoutWriteRevisionActorInput>({
      run: async () => {
        throw new Error('checkoutMachine: the writeRevision actor was not provided.');
      },
    }),
    casHead: createAsyncLogic<CheckoutCasHeadActorOutput, CheckoutCasHeadActorInput>({
      run: async () => {
        throw new Error('checkoutMachine: the casHead actor was not provided.');
      },
    }),
    readHead: createAsyncLogic<CheckoutHead, CheckoutFenceActorInput>({
      run: async () => {
        throw new Error('checkoutMachine: the readHead actor was not provided.');
      },
    }),
    /*
     * The fence the mint runs under. It is a held resource, so it is a callback
     * actor: acquisition failure arrives as `fenceRefused`, never as `onError`.
     */
    fence: createCallbackLogic<AnyEventObject, CheckoutFenceActorInput>(({ sendBack }) => {
      sendBack({ type: 'fenceRefused', reason: 'checkoutMachine: the fence actor was not provided.' });
      return () => undefined;
    }),
    /* A host that cannot compare trusts its records, which is what it did before D4. */
    captureTree: createAsyncLogic<CheckoutCaptureTreeActorOutput, CheckoutCaptureTreeActorInput>({
      run: async () => {
        throw new Error('checkoutMachine: the captureTree actor was not provided.');
      },
    }),
  },
  delays: {
    idleWindow: ({ context }) => context.idleWindow,
  },
  guards: {
    /* I5: a revision is minted only when the cut's tree differs from the head's. */
    treeUnchanged: (context: CheckoutMachineContext, treeId: string) => treeId === context.headTreeId,
    /* F4: a write that landed during the mint leaves the checkout dirty. */
    writeGenerationUnchanged: (context: CheckoutMachineContext) => context.writeGeneration === context.cutGeneration,
    hasQueuedCut: (context: CheckoutMachineContext) => context.queued.length > 0,
  },
}).createMachine({
  id: 'checkout',
  context: ({ input }) => ({
    checkoutId: input.checkoutId,
    branch: input.branch,
    headRevisionId: input.headRevisionId,
    headTreeId: input.headTreeId,
    idleWindow: input.idleWindow ?? checkoutIdleWindowMilliseconds,
    parentRef: input.parentRef,
    writeGeneration: 0,
    cutGeneration: 0,
    changedPaths: undefined,
    cutPaths: undefined,
    pending: undefined,
    queued: [],
    cutId: undefined,
    cutTreeId: undefined,
    revisionId: undefined,
    reason: undefined,
    /* Nothing to compare against on an unborn branch: every tree is new there. */
    treeCompared: input.headTreeId === undefined,
  }),
  initial: 'clean',
  on: {
    /* One event per content-change event, whatever its path count (A38, F9). */
    changed: { context: ({ context, event }) => recordWrite(context, event) },
    /*
     * I6: a head that moved under `dirty`, `stale`, `rereading` or `failed`
     * says nothing about the files, so they are compared with it — as D4 does
     * at spawn — rather than declared clean. `dirty` stays the reading until
     * the comparison proves otherwise. The checkout's own head arriving back
     * (a registry re-read after its own mint) is not a move at all.
     */
    headChanged: ({ context, event }) =>
      movedHead(context, event) ? { target: '.dirty.comparing', context: adoptHead(event) } : undefined,
    /* The line, not the files: whatever this checkout was doing, its next CAS names the new branch (N9). */
    lineChanged: { context: ({ event }) => ({ branch: event.branch }) },
    /* Reached only from `minting`, `stale` and `rereading`; the resting states
     * below take `cut` straight into a mint. */
    cut: ({ context, event }, enq) => ({ context: queueRequest(context, event, enq) }),
  },
  states: {
    clean: {
      entry: ({ context }, enq) => {
        reportStatus(context, enq, 'clean');
      },
      always: ({ context, guards }) =>
        guards.hasQueuedCut(context) ? { target: 'minting', context: takeQueuedRequest(context) } : undefined,
      on: {
        /*
         * A write to a clean checkout is compared before it is called an edit
         * (FX1 M). A host reports its own applies to the feed (E1), so a pull's
         * burst lands here after `headChanged` with the head's own bytes; only
         * the comparison, not the idle window, can say so. One capture per
         * clean-to-dirty edge, through the memo, reading only the named paths.
         */
        changed: { target: '#checkout.dirty.comparing', context: ({ context, event }) => recordWrite(context, event) },
        cut: { target: 'minting', context: ({ context, event }) => takeRequest(context, event) },
        /* Files that matched the old head were applied to the new one (a switch,
         * a fast-forward) or are another writer's same bytes: `clean` reports
         * the new head, and the apply's own writes reach `changed`, which compares them. */
        headChanged: ({ context, event }) =>
          movedHead(context, event)
            ? { target: '#checkout.clean', reenter: true, context: adoptHead(event) }
            : undefined,
      },
      initial: 'routing',
      states: {
        routing: {
          always: ({ context }) => (context.treeCompared ? { target: 'rested' } : { target: 'comparing' }),
        },
        /*
         * D4: records say where the head is, not what the files are.
         *
         * A tree restored, edited or rewound while no actor watched it would
         * read `clean` over bytes its head does not carry. The checkout spawns
         * `clean` so the first render waits for nothing, and moves to `dirty`
         * when this capture answers. The capture goes through the host's memo,
         * so the first cut after it reads only what changed since.
         */
        comparing: {
          entry: () => ({ context: { treeCompared: true } }),
          invoke: {
            src: 'captureTree',
            input: ({ context }) => ({
              checkoutId: context.checkoutId,
              changedPaths: context.changedPaths,
              generation: context.writeGeneration,
            }),
            onDone: ({ context, event }) =>
              event.output.treeId === context.headTreeId ? { target: 'rested' } : { target: '#checkout.dirty' },
            onError: { target: 'rested' },
          },
          on: {
            /* The answer in flight is against the old head, so the capture starts
             * again — through `clean`'s entry, which reports the new head (M5). */
            headChanged: ({ context, event }) =>
              movedHead(context, event)
                ? { target: '#checkout.clean', reenter: true, context: { ...adoptHead(event), treeCompared: false } }
                : undefined,
          },
        },
        rested: {},
      },
    },
    dirty: {
      entry: ({ context }, enq) => {
        reportStatus(context, enq, 'dirty');
      },
      always: ({ context, guards }) =>
        guards.hasQueuedCut(context) ? { target: 'minting', context: takeQueuedRequest(context) } : undefined,
      on: {
        cut: { target: 'minting', context: ({ context, event }) => takeRequest(context, event) },
      },
      initial: 'quiet',
      states: {
        /*
         * I6: the D4 comparison, for bytes that were unrecorded when the head
         * moved or written while the checkout read clean. `dirty` until the
         * capture shows the files are the head's; a failed capture proves
         * nothing, so it stays `dirty`.
         *
         * The answered capture is the host's new starting tree, as a cut's is,
         * so it takes the paths it read: the cut after it re-reads only what
         * was written since (E1). A cut asked meanwhile starts at once; the
         * host hands it the capture already running over the same paths.
         */
        comparing: {
          entry: () => ({ context: { treeCompared: true } }),
          invoke: {
            src: 'captureTree',
            input: ({ context }) => ({
              checkoutId: context.checkoutId,
              changedPaths: context.changedPaths,
              generation: context.writeGeneration,
            }),
            onDone: ({ context, event }) =>
              event.output.treeId === context.headTreeId
                ? { target: '#checkout.clean', context: { changedPaths: [] } }
                : { target: 'quiet', context: { changedPaths: [] } },
            onError: { target: 'quiet' },
          },
          on: {
            /* The answer in flight predates this write, so it cannot clear it: compare again. */
            changed: {
              target: 'comparing',
              reenter: true,
              context: ({ context, event }) => recordWrite(context, event),
            },
            headChanged: ({ context, event }) =>
              movedHead(context, event) ? { target: 'comparing', reenter: true, context: adoptHead(event) } : undefined,
          },
        },
        /*
         * S30's idle window, and the only timer in this machine.
         *
         * It is a child of `dirty` rather than `dirty`'s own `after` so a burst
         * of writes restarts the window without re-entering `dirty` itself:
         * re-entering the parent would re-run `reportStatus` and churn the
         * projection on every keystroke (A38, F9). `reenter: true` is on this
         * child transition alone, which is exactly what restarts the delay.
         *
         * The window is per checkout, so two clients on a shared checkout run
         * one between them; the mint that follows still passes the I5 gate, so
         * a quiet checkout whose tree equals its head records nothing.
         */
        quiet: {
          after: {
            idleWindow: { target: '#checkout.minting', context: takeIdleRequest },
          },
          on: {
            changed: {
              target: 'quiet',
              reenter: true,
              context: ({ context, event }) => recordWrite(context, event),
            },
          },
        },
      },
    },
    minting: {
      entry: ({ context }, enq) => {
        reportStatus(context, enq, 'minting');
        /* The paths are taken with the generation (F4): a write after this
         * point is the next cut's, and leaves this checkout dirty. */
        return {
          context: { cutGeneration: context.writeGeneration, cutPaths: context.changedPaths, changedPaths: [] },
        };
      },
      invoke: {
        id: 'fence',
        src: 'fence',
        input: ({ context }) => ({ checkoutId: context.checkoutId }),
      },
      on: {
        /*
         * L2-F5: the head moved under a running mint. Its parents were read from
         * the old head, so finishing would publish a revision that drops the new
         * one; abandon it and answer the requester the way a lost CAS does,
         * rather than leaving it to wait out its own bound. The comparison then
         * decides whether the files still differ from the new head.
         */
        headChanged: ({ context, event }, enq) => {
          /* RV-W2b #3: a registry re-read naming the head this checkout already has moved nothing. */
          if (!movedHead(context, event)) {
            return undefined;
          }
          announce(context, enq, { type: 'casLost' });
          return { target: '#checkout.dirty.comparing', context: adoptHead(event) };
        },
      },
      initial: 'acquiring',
      states: {
        acquiring: {
          on: {
            fenceGranted: { target: 'cutting' },
            fenceRefused: {
              target: '#checkout.failed',
              context: ({ event }) => ({ reason: event.reason }),
            },
          },
        },
        cutting: {
          invoke: {
            src: 'cut',
            input: ({ context }) => ({
              checkoutId: context.checkoutId,
              trigger: context.pending?.trigger ?? 'save',
              changedPaths: context.cutPaths,
              generation: context.cutGeneration,
            }),
            onDone: ({ context, event, guards }, enq) => {
              if (event.output.nothingToSave === true || guards.treeUnchanged(context, event.output.treeId)) {
                announce(context, enq, { type: 'nothingToSave' });
                return { target: 'settled' };
              }
              return { target: 'writing', context: { cutId: event.output.cutId, cutTreeId: event.output.treeId } };
            },
            onError: {
              target: '#checkout.failed',
              context: ({ event }) => ({ reason: describeFailure(event.error) }),
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
              ...(context.pending?.restoredFrom === undefined ? {} : { restoredFrom: context.pending.restoredFrom }),
            }),
            onDone: {
              target: 'publishing',
              context: ({ event }) => ({ revisionId: event.output.revisionId }),
            },
            onError: {
              target: '#checkout.failed',
              context: ({ event }) => ({ reason: describeFailure(event.error) }),
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
            onDone: ({ context, event }, enq) => {
              if (event.output.status === 'conflicted') {
                announce(context, enq, { type: 'casLost' });
                return { target: '#checkout.stale' };
              }
              announce(context, enq, { type: 'revisionMinted', revisionId: context.revisionId ?? '' });
              return {
                target: 'settled',
                context: { headRevisionId: context.revisionId, headTreeId: context.cutTreeId },
              };
            },
            onError: {
              target: '#checkout.failed',
              context: ({ event }) => ({ reason: describeFailure(event.error) }),
            },
          },
        },
        settled: { type: 'final' },
      },
      /* F4: only an unchanged write generation may return to `clean`. */
      onDone: ({ context, guards }) =>
        guards.writeGenerationUnchanged(context) ? { target: 'clean' } : { target: 'dirty' },
    },
    stale: {
      entry: ({ context }, enq) => {
        reportStatus(context, enq, 'stale');
      },
      always: { target: 'rereading' },
    },
    rereading: {
      invoke: {
        src: 'readHead',
        input: ({ context }) => ({ checkoutId: context.checkoutId }),
        onDone: {
          target: 'dirty',
          context: ({ event }) => ({
            headRevisionId: event.output.revisionId,
            headTreeId: event.output.treeId,
            changedPaths: undefined,
          }),
        },
        onError: {
          target: 'failed',
          context: ({ event }) => ({ reason: describeFailure(event.error) }),
        },
      },
    },
    /* Non-terminal: a full disk must not stop this checkout for good. */
    failed: {
      entry: ({ context }, enq) => {
        announce(context, enq, { type: 'cutFailed', reason: context.reason ?? 'The cut failed.' });
        const drained = failQueuedRequests(context, enq);
        reportStatus(context, enq, 'failed');
        /* The failed mint's paths are still unrecorded: the next cut reads them again. */
        return {
          context: { ...drained, changedPaths: unionPaths(context.cutPaths, context.changedPaths), cutPaths: [] },
        };
      },
      on: {
        changed: { target: 'dirty', context: ({ context, event }) => recordWrite(context, event) },
        cut: { target: 'minting', context: ({ context, event }) => takeRequest(context, event) },
      },
    },
  },
});

type CheckoutMachineDefinition = typeof checkoutMachineDefinition;

/**
 * The type of {@link checkoutMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface CheckoutMachine extends CheckoutMachineDefinition {}

/**
 * Headless minting core for one checkout.
 *
 * @public
 */
export const checkoutMachine: CheckoutMachine = checkoutMachineDefinition;

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

/**
 * The actor set a host provides for `checkoutMachine` (S37).
 *
 * Taken from the machine's own `provide` parameter so an implementation that
 * drifts from an actor's input or output is a type error at the host, not a
 * runtime surprise inside a state.
 *
 * @public
 */
export type CheckoutActors = MachineActors<typeof checkoutMachine>;
