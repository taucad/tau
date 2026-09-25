/**
 * `checkout.machine` — one actor per checkout, and the only minter.
 *
 * Every revision on a checkout's branch is written here: turns, branch and
 * restore operations ask by sending `cut`, and the tree-hash gate (I5), the
 * compare-and-swap of the branch head (I7) and the lost-CAS re-read (D24) exist
 * exactly once. The write generation is what keeps a write that lands during a
 * mint from being lost: the mint returns to `dirty`, not `clean`.
 *
 * Every request names itself with a `requestId`, and every answer echoes it
 * once per requester (RM-R1, RM-R2). The actor owns its branch, head and head
 * tree, and learns them only from its own compare-and-swap or from `readHead`:
 * a producer's fact is `headMoved`, a hint that makes it re-read (RM-R5). A
 * move during a mint is deferred and the compare-and-swap decides (RM-R6).
 * Transitions do not yet name their `CheckoutRequests.tla` action: alpha.59
 * leaves a `{ to, meta }` transition's arguments untyped (MC-R27, open).
 *
 * The machine imports nothing but XState. Hashing, writing, publishing and the
 * fence lock are injected actors the host supplies through `provide({ actors })`.
 */

import { createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type { AnyActorRef, AnyEventObject, EnqueueObject, SnapshotFrom } from 'xstate';

import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';
import type { TurnAttemptKey, TurnCutOf } from '#turn.types.js';

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

/**
 * One mint's worth of requests.
 *
 * A turn's cut is one requester and never coalesces; trigger-only cuts queued
 * behind a mint merge into one entry that keeps every requester, so each is
 * answered with its own id and trigger (RM-R2). The idle window's mint has no
 * requester at all.
 *
 * @public
 */
export type CheckoutCutRequest = Readonly<{
  /** What the mint records: the latest requester's trigger, or `idle`. */
  trigger: CheckoutCutTrigger;
  /** Everyone the outcome is announced to, each with the id it minted. */
  requesters: ReadonlyArray<Readonly<{ requestId: string; trigger: CheckoutCutTrigger }>>;
  /** The attempt a turn's cut is minted for, and which of its two revisions it is (RM-R9). */
  turn?: TurnCutOf;
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

/** Serializable state owned by checkoutMachine. @public */
export type CheckoutMachineContext = Readonly<{
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
  /** The write generation the checkout was last clean at; a re-read returns there only if nothing was written since. */
  cleanGeneration: number;
  /** Requests that arrived while a mint was running, served in order. */
  queued: readonly CheckoutCutRequest[];
  /** Counts `headMoved` facts (RM-R6). */
  moveGeneration: number;
  /** The move generation the running mint or read started at; a newer one re-reads after it. */
  seenMoveGeneration: number;
  reason: string | undefined;
}>;

/** Events accepted by checkoutMachine. @public */
export type CheckoutMachineEvent =
  /** One content-change event, never one per path (A38). */
  | Readonly<{ type: 'changed'; paths: readonly string[]; generation: number }>
  | Readonly<{
      type: 'cut';
      /** Minted by the requester; every answer to this request echoes it (RM-R1). */
      requestId: string;
      trigger: CheckoutCutTrigger;
      /** Present when a turn asks: the attempt and which of its revisions this is. */
      turn?: TurnCutOf;
      leaseIds: readonly string[];
    }>
  /** Withdraw a queued request; a running mint answers for itself (RM-R4). */
  | Readonly<{ type: 'cancelCut'; requestId: string }>
  /** A producer moved this checkout: re-read branch, head and tree; deferred while minting (RM-R5, RM-R6). */
  | Readonly<{ type: 'headMoved' }>
  | Readonly<{ type: 'fenceGranted' }>
  | Readonly<{ type: 'fenceRefused'; reason: string }>;

/** Who a cut answer is addressed to: an `idle` mint has no requester, so no id. */
type Addressed = Readonly<{
  checkoutId: string;
  trigger: CheckoutCutTrigger;
  requestId?: string;
  turn?: TurnCutOf;
}>;

/** Facts checkoutMachine emits for observers and sends to its parent. @public */
export type CheckoutMachineEmitted =
  /* `branch`: the branch the mint published on, so sync records only its own branch's head (RM-S3). */
  | (Readonly<{ type: 'revisionMinted'; revisionId: string; branch: string | undefined }> & Addressed)
  /* `heldBy`: a trigger-only cut found a lease on this checkout after its capture and wrote nothing (RM-R16). */
  | (Readonly<{ type: 'nothingToSave'; heldBy?: TurnAttemptKey }> & Addressed)
  | (Readonly<{ type: 'cutFailed'; reason: string }> & Addressed)
  | (Readonly<{ type: 'casLost' }> & Addressed)
  | Readonly<{ type: 'cutCancelled'; checkoutId: string; requestId: string; turn?: TurnCutOf }>
  | Readonly<{
      type: 'checkoutStatusChanged';
      checkoutId: string;
      status: CheckoutStatus;
      /** The branch the actor last read or minted on; the root takes it from here (RM-R5). */
      branch: string | undefined;
      headRevisionId?: string;
      headTreeId?: string;
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
  /** The attempt a turn's cut is for; its provenance names it (RM-R9). */
  turn?: TurnCutOf;
  leaseIds: readonly string[];
}>;

/** Input of the injected `casHead` actor: publish the branch head expected-old (I7). @public */
export type CheckoutCasHeadActorInput = Readonly<{
  checkoutId: string;
  /** The branch the mint is for; the effect refuses when the checkout's branch on disk is another (RM-R6). */
  branch: string | undefined;
  expectedHead: string | undefined;
  head: string;
}>;

/** Outcome of one expected-old head publication. @public */
export type CheckoutCasHeadActorOutput = Readonly<{ status: 'updated' | 'conflicted'; head: string | undefined }>;

/** Input of the injected `fence` actor: the lock this checkout mints under. @public */
export type CheckoutFenceActorInput = Readonly<{ checkoutId: string }>;

/** Output of the injected `readHead` actor: the three facts the actor owns (RM-R5). @public */
export type CheckoutHead = Readonly<{
  revisionId: string | undefined;
  treeId: string | undefined;
  branch: string | undefined;
}>;

/**
 * Events a state declares it ignores (MC-R17, RM-R11).
 *
 * The fence's answers exist only while `minting.acquiring` holds the fence
 * actor; a late one after the mint left is stale by construction.
 *
 * @public
 */
export const checkoutIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['clean', 'fenceGranted'],
  ['clean', 'fenceRefused'],
  ['dirty', 'fenceGranted'],
  ['dirty', 'fenceRefused'],
  ['minting.cutting', 'fenceGranted'],
  ['minting.cutting', 'fenceRefused'],
  ['minting.writing', 'fenceGranted'],
  ['minting.writing', 'fenceRefused'],
  ['minting.publishing', 'fenceGranted'],
  ['minting.publishing', 'fenceRefused'],
  ['rereading', 'fenceGranted'],
  ['rereading', 'fenceRefused'],
  ['failed', 'fenceGranted'],
  ['failed', 'fenceRefused'],
];

/**
 * Where a settled mint goes next. A nested state cannot name a state outside
 * its narrowed parent in alpha.59's strict setup targets, so each exit lands in
 * `minting.done` and `minting`'s own `onDone` routes it.
 */
type MintExit = 'clean' | 'dirty' | 'stale' | 'rereading' | 'failed';

/** Per-state context of a running mint (MC-R26): the request it serves, and where it leaves to. */
type MintingContext = Readonly<{
  pending: CheckoutCutRequest;
  /** Opaque handle to the cut the host is holding for `writeRevision`, and its tree. */
  cutId?: string;
  cutTreeId?: string;
  revisionId?: string;
  exit?: MintExit;
}>;

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'The cut failed.';

type CheckoutEnqueue = EnqueueObject<CheckoutMachineEvent, CheckoutMachineEmitted>;

type Answer =
  | Readonly<{ type: 'revisionMinted'; revisionId: string; branch: string | undefined }>
  | Readonly<{ type: 'nothingToSave'; heldBy?: TurnAttemptKey }>
  | Readonly<{ type: 'cutFailed'; reason: string }>
  | Readonly<{ type: 'casLost' }>;

/* Emit a fact and send it to the parent. */
const tell = (context: CheckoutMachineContext, enq: CheckoutEnqueue, fact: CheckoutMachineEmitted): void => {
  enq.emit(fact);
  if (context.parentRef !== undefined) {
    enq.sendTo(context.parentRef, fact);
  }
};

/* One answer per requester, each with its own id and trigger (RM-R2); an `idle` mint's answer carries no id. */
const announce = (
  context: CheckoutMachineContext,
  enq: CheckoutEnqueue,
  { request, answer }: Readonly<{ request: CheckoutCutRequest; answer: Answer }>,
): void => {
  const turn = request.turn === undefined ? {} : { turn: request.turn };
  if (request.requesters.length === 0) {
    tell(context, enq, { ...answer, checkoutId: context.checkoutId, trigger: request.trigger, ...turn });
    return;
  }
  for (const requester of request.requesters) {
    tell(context, enq, {
      ...answer,
      checkoutId: context.checkoutId,
      trigger: requester.trigger,
      requestId: requester.requestId,
      ...turn,
    });
  }
};

const recordWrite = (
  context: CheckoutMachineContext,
  event: Extract<CheckoutMachineEvent, { type: 'changed' }>,
): Partial<CheckoutMachineContext> => ({
  writeGeneration: Math.max(context.writeGeneration, event.generation),
});

const requestOf = (event: Extract<CheckoutMachineEvent, { type: 'cut' }>): CheckoutCutRequest => ({
  trigger: event.trigger,
  requesters: [{ requestId: event.requestId, trigger: event.trigger }],
  leaseIds: event.leaseIds,
  ...(event.turn === undefined ? {} : { turn: event.turn }),
});

/*
 * R13, RM-R2: a burst of trigger-only requests is one mint, and every requester is answered.
 *
 * `Mod+S` held down, an idle window that fires while the tab is being hidden,
 * and `hidden` followed by `pagehide` all describe the same wish — "record what
 * is on disk" — and the checkout can only honour it once. A request no turn is
 * waiting on joins the last queued entry when that entry is trigger-only too;
 * the later trigger is what the mint records, and each requester still hears
 * its own answer. A turn's request never joins: its provenance names its attempt.
 */
const queueRequest = (
  context: CheckoutMachineContext,
  event: Extract<CheckoutMachineEvent, { type: 'cut' }>,
  enq: CheckoutEnqueue,
): Partial<CheckoutMachineContext> => {
  const request = requestOf(event);
  const last = context.queued.at(-1);
  if (request.turn === undefined && last !== undefined && last.turn === undefined) {
    return {
      queued: [
        ...context.queued.slice(0, -1),
        {
          trigger: request.trigger,
          requesters: [...last.requesters, ...request.requesters],
          leaseIds: request.leaseIds,
        },
      ],
    };
  }
  if (context.queued.length >= checkoutQueuedCutLimit) {
    announce(context, enq, { request, answer: { type: 'cutFailed', reason: 'queue-full' } });
    return {};
  }
  return { queued: [...context.queued, request] };
};

/* RM-R4: a withdrawn request leaves the queue and is answered `cutCancelled`; its entry goes when it has no requester left. */
const cancelRequest = (
  context: CheckoutMachineContext,
  event: Extract<CheckoutMachineEvent, { type: 'cancelCut' }>,
  enq: CheckoutEnqueue,
): Partial<CheckoutMachineContext> => {
  const entry = context.queued.find((request) =>
    request.requesters.some((requester) => requester.requestId === event.requestId),
  );
  if (entry === undefined) {
    /* The running mint answers for itself, and an unknown id is stale (RM-A4). */
    return {};
  }
  tell(context, enq, {
    type: 'cutCancelled',
    checkoutId: context.checkoutId,
    requestId: event.requestId,
    ...(entry.turn === undefined ? {} : { turn: entry.turn }),
  });
  return {
    queued: context.queued.flatMap((request) => {
      if (request !== entry) {
        return [request];
      }
      const requesters = request.requesters.filter((requester) => requester.requestId !== event.requestId);
      return requesters.length === 0 ? [] : [{ ...request, requesters }];
    }),
  };
};

/* The idle window has no requester, so the request is synthesised here rather than read off an event (S30). */
const idleRequest: CheckoutCutRequest = { trigger: 'idle', requesters: [], leaseIds: [] };

/* R4: a request that waited behind a failed mint is still a request; the queue is drained here. */
const failQueuedRequests = (context: CheckoutMachineContext, enq: CheckoutEnqueue): Partial<CheckoutMachineContext> => {
  for (const request of context.queued) {
    announce(context, enq, { request, answer: { type: 'cutFailed', reason: context.reason ?? 'The cut failed.' } });
  }
  return { queued: [] };
};

/* Send a settled status to the parent, which takes the branch and head from it (RM-R5). */
const reportStatus = (context: CheckoutMachineContext, enq: CheckoutEnqueue, status: CheckoutStatus): void => {
  if (context.parentRef === undefined) {
    return;
  }
  const fact: CheckoutMachineEmitted = {
    type: 'checkoutStatusChanged',
    checkoutId: context.checkoutId,
    status,
    branch: context.branch,
    ...(context.headRevisionId === undefined ? {} : { headRevisionId: context.headRevisionId }),
    ...(context.headTreeId === undefined ? {} : { headTreeId: context.headTreeId }),
  };
  enq.sendTo(context.parentRef, fact);
};

/* A mint that answered its requesters leaves: re-read a head that moved under it (RM-R6), then F4's generation test. */
const afterMint = (context: CheckoutMachineContext, wrote: boolean): MintExit =>
  context.moveGeneration > context.seenMoveGeneration
    ? 'rereading'
    : wrote && context.writeGeneration === context.cutGeneration
      ? 'clean'
      : 'dirty';

const moved = (context: CheckoutMachineContext) => ({ moveGeneration: context.moveGeneration + 1 });

type MintPatch = Partial<Omit<CheckoutMachineContext, 'reason'>> & Readonly<{ reason?: string }>;

/* Settle the mint into `minting.done`, carrying where `minting.onDone` routes it (see `MintExit`). */
const leave = (
  exit: MintExit,
  patch: MintPatch = {},
): Readonly<{ target: 'done'; context: MintPatch & Readonly<{ exit: MintExit }> }> => ({
  target: 'done',
  context: { ...patch, exit },
});

const checkoutMachineDefinition = setup({
  schemas: {
    context: types<CheckoutMachineContext>(),
    events: eventSchemas<CheckoutMachineEvent>(),
    emitted: eventSchemas<CheckoutMachineEmitted>(),
    input: types<CheckoutMachineInput>(),
    tags: types<'dirty'>(),
  },
  states: {
    clean: {},
    dirty: { states: { quiet: {}, elapsed: {} } },
    minting: {
      schemas: { context: types<MintingContext>() },
      /* Each child restates the schema: alpha.59 checks a nested state's patches against its own schema only. */
      states: {
        acquiring: { schemas: { context: types<MintingContext>() } },
        cutting: { schemas: { context: types<MintingContext>() } },
        writing: { schemas: { context: types<MintingContext>() } },
        publishing: { schemas: { context: types<MintingContext>() } },
        done: { schemas: { context: types<MintingContext>() } },
      },
    },
    stale: {},
    rereading: {},
    failed: {},
  },
  actors: {
    cut: createAsyncLogic<CheckoutCutActorOutput, CheckoutCutActorInput>({
      run: async () => {
        throw new Error('checkoutMachine: the cut actor was not provided.');
      },
    }),
    /* `held`: a trigger-only cut found a lease on this checkout after its capture, and wrote nothing (RM-R16). */
    writeRevision: createAsyncLogic<
      Readonly<{ status: 'written'; revisionId: string }> | Readonly<{ status: 'held'; heldBy: TurnAttemptKey }>,
      CheckoutWriteRevisionActorInput
    >({
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
  },
  delays: {
    idleWindow: ({ context }) => context.idleWindow,
  },
  guards: {
    /* I5: a revision is minted only when the cut's tree differs from the head's. */
    treeUnchanged: (context: CheckoutMachineContext, treeId: string) => treeId === context.headTreeId,
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
    cleanGeneration: 0,
    queued: [],
    moveGeneration: 0,
    seenMoveGeneration: 0,
    reason: undefined,
  }),
  initial: 'clean',
  on: {
    /* One event per content-change event, whatever its path count (A38, F9). */
    changed: { context: ({ context, event }) => recordWrite(context, event) },
    /* Reached only from `minting`, `stale` and `rereading`: a busy checkout queues. */
    cut: ({ context, event }, enq) => ({ context: queueRequest(context, event, enq) }),
    cancelCut: ({ context, event }, enq) => ({
      context: cancelRequest(context, event, enq),
    }),
    /* RM-R6: while a mint or a read runs, a move only counts; the running step re-reads after it settles. */
    headMoved: ({ context }) => ({ context: moved(context) }),
  },
  states: {
    clean: {
      entry: ({ context }, enq) => {
        reportStatus(context, enq, 'clean');
        return { context: { cleanGeneration: context.writeGeneration } };
      },
      always: ({ context, guards }) =>
        guards.hasQueuedCut(context)
          ? {
              target: 'minting',
              context: { pending: context.queued[0] ?? idleRequest, queued: context.queued.slice(1) },
            }
          : undefined,
      on: {
        changed: { target: 'dirty', context: ({ context, event }) => recordWrite(context, event) },
        cut: ({ event }) => ({ target: 'minting', context: { pending: requestOf(event) } }),
        headMoved: ({ context }) => ({ target: 'rereading', context: moved(context) }),
      },
    },
    dirty: {
      tags: ['dirty'],
      entry: ({ context }, enq) => {
        reportStatus(context, enq, 'dirty');
      },
      always: ({ context, guards }) =>
        guards.hasQueuedCut(context)
          ? {
              target: 'minting',
              context: { pending: context.queued[0] ?? idleRequest, queued: context.queued.slice(1) },
            }
          : undefined,
      on: {
        cut: ({ event }) => ({ target: 'minting', context: { pending: requestOf(event) } }),
        headMoved: ({ context }) => ({ target: 'rereading', context: moved(context) }),
      },
      initial: 'quiet',
      states: {
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
            idleWindow: { target: 'elapsed' },
          },
          on: {
            changed: {
              target: 'quiet',
              reenter: true,
              context: ({ context, event }) => recordWrite(context, event),
            },
          },
        },
        elapsed: { type: 'final' },
      },
      onDone: { target: 'minting', context: { pending: idleRequest } },
    },
    minting: {
      tags: ['dirty'],
      entry: ({ context }, enq) => {
        reportStatus(context, enq, 'minting');
        return { context: { cutGeneration: context.writeGeneration, seenMoveGeneration: context.moveGeneration } };
      },
      invoke: {
        id: 'fence',
        src: 'fence',
        input: ({ context }) => ({ checkoutId: context.checkoutId }),
      },
      initial: 'acquiring',
      states: {
        acquiring: {
          on: {
            fenceGranted: { target: 'cutting', context: ({ context }) => ({ pending: context.pending }) },
            fenceRefused: ({ context, event }, enq) => {
              announce(context, enq, { request: context.pending, answer: { type: 'cutFailed', reason: event.reason } });
              return leave('failed', { reason: event.reason });
            },
          },
        },
        cutting: {
          invoke: {
            src: 'cut',
            input: ({ context }) => ({ checkoutId: context.checkoutId, trigger: context.pending.trigger }),
            onDone: ({ context, event, guards }, enq) => {
              if (guards.treeUnchanged(context, event.output.treeId)) {
                announce(context, enq, { request: context.pending, answer: { type: 'nothingToSave' } });
                return leave(afterMint(context, true));
              }
              return {
                target: 'writing',
                context: { pending: context.pending, cutId: event.output.cutId, cutTreeId: event.output.treeId },
              };
            },
            onError: ({ context, event }, enq) => {
              const reason = describeFailure(event.error);
              announce(context, enq, { request: context.pending, answer: { type: 'cutFailed', reason } });
              return leave('failed', { reason });
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
              trigger: context.pending.trigger,
              ...(context.pending.turn === undefined ? {} : { turn: context.pending.turn }),
              leaseIds: context.pending.leaseIds,
            }),
            onDone: ({ context, event }, enq) => {
              if (event.output.status === 'held') {
                /* RM-R16: nothing was written, and the tree is still the person's to save later. */
                announce(context, enq, {
                  request: context.pending,
                  answer: { type: 'nothingToSave', heldBy: event.output.heldBy },
                });
                return leave(afterMint(context, false));
              }
              return {
                target: 'publishing',
                context: {
                  pending: context.pending,
                  cutId: context.cutId,
                  cutTreeId: context.cutTreeId,
                  revisionId: event.output.revisionId,
                },
              };
            },
            onError: ({ context, event }, enq) => {
              const reason = describeFailure(event.error);
              announce(context, enq, { request: context.pending, answer: { type: 'cutFailed', reason } });
              return leave('failed', { reason });
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
                /* D24; RM-R6: the head moved, or the checkout left the branch; either way it re-reads. */
                announce(context, enq, { request: context.pending, answer: { type: 'casLost' } });
                return leave('stale');
              }
              announce(context, enq, {
                request: context.pending,
                answer: { type: 'revisionMinted', revisionId: context.revisionId ?? '', branch: context.branch },
              });
              const next = { ...context, headRevisionId: context.revisionId, headTreeId: context.cutTreeId };
              return {
                ...leave(afterMint(next, true), { headRevisionId: context.revisionId, headTreeId: context.cutTreeId }),
              };
            },
            onError: ({ context, event }, enq) => {
              const reason = describeFailure(event.error);
              announce(context, enq, { request: context.pending, answer: { type: 'cutFailed', reason } });
              return leave('failed', { reason });
            },
          },
        },
        done: { type: 'final' },
      },
      onDone: ({ context }) => ({ target: context.exit ?? 'dirty' }),
    },
    stale: {
      tags: ['dirty'],
      entry: ({ context }, enq) => {
        reportStatus(context, enq, 'stale');
      },
      always: { target: 'rereading' },
    },
    rereading: {
      tags: ['dirty'],
      entry: ({ context }) => ({ context: { seenMoveGeneration: context.moveGeneration } }),
      invoke: {
        src: 'readHead',
        input: ({ context }) => ({ checkoutId: context.checkoutId }),
        onDone: ({ context, event }) => {
          const head = {
            branch: event.output.branch,
            headRevisionId: event.output.revisionId,
            headTreeId: event.output.treeId,
          };
          if (context.moveGeneration > context.seenMoveGeneration) {
            return { target: 'rereading', reenter: true, context: head };
          }
          /* A move that wrote nothing here (a switch, a fast-forward, a restore) leaves the tree at the new head. */
          return context.writeGeneration === context.cleanGeneration
            ? { target: 'clean', context: head }
            : { target: 'dirty', context: head };
        },
        onError: {
          target: 'failed',
          context: ({ event }) => ({ reason: describeFailure(event.error) }),
        },
      },
    },
    /* Non-terminal: a full disk must not stop this checkout for good. */
    failed: {
      tags: ['dirty'],
      entry: ({ context }, enq) => {
        const drained = failQueuedRequests(context, enq);
        reportStatus(context, enq, 'failed');
        return { context: drained };
      },
      /* A head fact deferred by the failed mint is still news (W0.9, RM-R6). */
      always: ({ context }) =>
        context.moveGeneration > context.seenMoveGeneration ? { target: 'rereading' } : undefined,
      on: {
        changed: { target: 'dirty', context: ({ context, event }) => recordWrite(context, event) },
        cut: ({ event }) => ({ target: 'minting', context: { pending: requestOf(event) } }),
        headMoved: ({ context }) => ({ target: 'rereading', context: moved(context) }),
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
 * @returns True while the checkout carries the declared `dirty` tag (MC-R28).
 * @public
 */
export const selectCheckoutDirty = (snapshot: SnapshotFrom<typeof checkoutMachine>): boolean =>
  snapshot.hasTag('dirty');

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
