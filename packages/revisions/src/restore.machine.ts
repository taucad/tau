/**
 * `restore.machine` — the *Restore* and *Undo restore* verbs.
 *
 * A restore is a revision, never a detached head (D1). It is three steps, in
 * this order, each answered before the next starts:
 *
 * 1. **recording** — the checkout child cuts the files as they are, so a restore
 *    never discards bytes it did not mint first (I1). The cut goes through the
 *    root, which refuses it while a turn holds the checkout (A1).
 * 2. **planning / applying** — the host computes the plan and writes the target
 *    tree, proving inside the fence that the files still equal the head that
 *    step 1 left (A3).
 * 3. **minting** — the checkout child cuts again with `restoredFrom`, so the line
 *    fast-forwards to a revision whose tree is the target's. The head moves only
 *    through that cut (A4); a target equal to the head mints nothing (A8).
 *
 * The cuts use the branch child's precedent, a trigger-only `cut` sent to the
 * parent, with one addition: each carries a `requestId` the checkout echoes, so
 * an answer is matched to the cut that asked for it and never to a later one
 * (N2). *Undo restore* acts only where its restore landed: the checkout and the
 * line it minted on (M1). `computePlan` and
 * `applyPlan` stay injected actors, and the plan itself never enters context:
 * `computePlan` returns the facts the guards need plus an opaque `planId` the
 * host holds, so the snapshot stays serializable.
 */

import { createAsyncLogic, setup, types } from 'xstate';
import type { AnyActorRef, EnqueueObject, SnapshotFrom } from 'xstate';

import type { CheckoutCutTrigger } from '#checkout.machine.js';
import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';
import type { RevisionPortErrorCode } from '#revision-port.js';

/**
 * What refused a restore, as a code the page turns into words (P4).
 *
 * A port code where the port refused, plus the two refusals no port names: the
 * line moved under one of the restore's cuts, and a turn holds the files (A1).
 *
 * @public
 */
export type RestoreFailureCode =
  | RevisionPortErrorCode
  | 'CAS_LOST'
  | 'LEASE_UNAVAILABLE'
  /** The files are the target's, but the restore cut did not land, so no *Restored* row exists (N1). */
  | 'RESTORE_UNRECORDED'
  /** *Undo restore* asked where no restore of this selection's line is left to undo (M1). */
  | 'UNDO_UNAVAILABLE';

/**
 * How long one of a restore's cuts waits for the checkout's answer.
 *
 * A bound, like the branch child's, so a checkout that never answers leaves
 * the verb failed rather than the pane busy forever.
 *
 * @public
 */
export const restoreCutMilliseconds = 30_000;

/** The sentence a lost compare-and-swap reads as, the branch child's own (P4). */
const casLostMessage = 'Something else changed this project first. Try again.';

/** The diagnostic for a restore cut that lost its race after the files were written (N1). */
const unrecordedMessage =
  'The files are restored, but something else changed this project first, so the restore is not recorded.';

/** The diagnostic for an *Undo restore* with nothing of this line's to undo (M1). */
const undoUnavailableMessage = 'There is no restore on this line to undo.';

/** Input accepted when creating the restoreMachine actor. @public */
export type RestoreMachineInput = Readonly<{
  projectId: string;
  /** The checkout the workbench is rooted at; the next restore applies here. */
  checkoutId: string;
  parentRef?: AnyActorRef;
}>;

/** Serializable state owned by restoreMachine. @public */
export type RestoreMachineContext = Readonly<{
  projectId: string;
  /** The checkout the workbench is rooted at, as the root last announced it. */
  checkoutId: string;
  /** That checkout's branch, as the root last announced it; a live *Switch* changes it under the same id. */
  branch: string | undefined;
  /**
   * The checkout the running verb acts on, pinned when it started (A6).
   *
   * A re-root mid-restore moves {@link RestoreMachineContext.checkoutId} only,
   * so the restore row is minted on the line it was planned against.
   */
  restoringCheckoutId: string | undefined;
  /** The branch {@link RestoreMachineContext.restoringCheckoutId} was on when the verb started. */
  restoringBranch: string | undefined;
  /** The id of the cut this verb is waiting on; an answer carrying any other is not its own (N2). */
  requestId: string | undefined;
  /** How many cuts this actor has asked for, so each `requestId` is new. */
  cutCount: number;
  /** The requested target: a revision id. */
  target: string | undefined;
  /** Whether the target is the first parent of {@link RestoreMachineContext.target} — *Undo restore* (D2). */
  firstParent: boolean;
  /**
   * The last restore row minted on the selected checkout and line; what *Undo restore* reverses.
   *
   * Cleared the moment the selection moves to another checkout or its line
   * changes, and never set by a restore that landed somewhere the selection no
   * longer is, so an Undo can only ever write where its restore wrote (M1).
   */
  restoredRevisionId: string | undefined;
  /** Opaque handle to the plan the host computed and is holding. */
  planId: string | undefined;
  /** The revision the plan resolved to. */
  revisionId: string | undefined;
  /** Its first-parent ordinal on the line, or `undefined` off the line (D5). */
  revisionNumber: number | undefined;
  removedPathCount: number;
  dirty: boolean;
  reason: string | undefined;
  /** The refusal's category, when one was named (P4). */
  reasonCode: RestoreFailureCode | undefined;
  parentRef: AnyActorRef | undefined;
}>;

/** The checkout's answers to a cut, as the root routes them (A7). @public */
export type RestoreCutAnswer =
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
      checkoutId: string | undefined;
      trigger: CheckoutCutTrigger;
      turnId?: string;
      requestId?: string;
      reason: string;
      /** The refusal's category, when whoever refused named one (A1). */
      code?: RestoreFailureCode;
    }>
  | Readonly<{ type: 'casLost'; checkoutId: string; trigger: CheckoutCutTrigger; turnId?: string; requestId?: string }>;

/** Events accepted by restoreMachine. @public */
export type RestoreMachineEvent =
  | Readonly<{ type: 'restore'; revisionId: string }>
  /** Restore the first parent of the last restore this machine minted on the selection's line (D2, M1). */
  | Readonly<{ type: 'undo' }>
  | Readonly<{ type: 'confirm' }>
  | Readonly<{ type: 'cancel' }>
  /** The root re-roots the workbench, or its line moved; the next restore applies to whatever it selected (F10). */
  | Readonly<{ type: 'selectCheckout'; checkoutId: string; branch?: string }>
  | RestoreCutAnswer;

/** Facts restoreMachine emits. @public */
export type RestoreMachineEmitted =
  | Readonly<{ type: 'toast.restored'; revisionNumber: number | undefined }>
  | Readonly<{ type: 'toast.error'; message: string; code?: RestoreFailureCode }>;

/**
 * What the parent hears from restoreMachine: the cuts it asks for, and when a
 * verb has settled so admissions it held can run (A2).
 *
 * @public
 */
export type RestoreMachineParentEvent =
  | Readonly<{
      type: 'cut';
      trigger: 'restore';
      checkoutId: string;
      leaseIds: readonly string[];
      /** Echoed on the checkout's answer, which is how this verb knows it is its own (N2). */
      requestId: string;
      restoredFrom?: string;
    }>
  | Readonly<{ type: 'restoreSettled'; checkoutId: string }>;

/** Input of the injected `computePlan` actor. @public */
export type RestoreComputePlanActorInput = Readonly<{
  checkoutId: string;
  target: string;
  /** Plan the first parent of `target` instead of `target` itself (D2). */
  firstParent?: true;
}>;

/**
 * Output of the injected `computePlan` actor.
 *
 * `removedPathCount` and `dirty` are the two facts the risk guard needs; the
 * plan's file sets stay with the host behind `planId`.
 *
 * @public
 */
export type RestoreComputePlanActorOutput = Readonly<{
  planId: string;
  revisionId: string;
  /** First-parent ordinal on the checkout's line; `undefined` when the target is not on it (D5, A9). */
  revisionNumber: number | undefined;
  removedPathCount: number;
  dirty: boolean;
}>;

/** Output of the injected `applyPlan` actor. @public */
export type RestoreApplyPlanActorOutput = Readonly<{
  revisionId: string;
  treeId: string;
}>;

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Restore failed.';

/* An effect's refusal, with the port's code when the port named one (A3) — read
 * structurally, as the branch child reads it, because a machine imports no class. */
const failFromError = (error: unknown): Partial<RestoreMachineContext> => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a rejection is `unknown` until read.
  const code = typeof error === 'object' && error !== null ? (error as Readonly<{ code?: unknown }>).code : undefined;
  return {
    reason: describeFailure(error),
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed to the refusals an effect names.
    reasonCode: typeof code === 'string' ? (code as RestoreFailureCode) : undefined,
  };
};

/* Everything one restore attempt leaves behind, cleared when it settles. */
const clearTransient = {
  restoringCheckoutId: undefined,
  restoringBranch: undefined,
  requestId: undefined,
  target: undefined,
  firstParent: false,
  planId: undefined,
  revisionId: undefined,
  revisionNumber: undefined,
  removedPathCount: 0,
  dirty: false,
} satisfies Partial<RestoreMachineContext>;

type RestoreEnqueue = EnqueueObject<RestoreMachineEvent, RestoreMachineEmitted>;

/* Ask the parent to cut the pinned checkout under a new request id; `restoredFrom` marks the restore row itself. */
const askCut = (
  context: RestoreMachineContext,
  enq: RestoreEnqueue,
  restoredFrom?: string,
): Partial<RestoreMachineContext> => {
  const cutCount = context.cutCount + 1;
  const requestId = `restore-${String(cutCount)}`;
  if (context.parentRef !== undefined) {
    const request: RestoreMachineParentEvent = {
      type: 'cut',
      trigger: 'restore',
      checkoutId: context.restoringCheckoutId ?? context.checkoutId,
      leaseIds: [],
      requestId,
      ...(restoredFrom === undefined ? {} : { restoredFrom }),
    };
    enq.sendTo(context.parentRef, request);
  }
  return { cutCount, requestId };
};

/* The restore cut failed after the files were written: they are the target's, unrecorded (N1). */
const unrecordedFromAnswer = (
  event: Extract<RestoreCutAnswer, { type: 'cutFailed' | 'casLost' }>,
): Partial<RestoreMachineContext> => ({
  reason: event.type === 'casLost' ? unrecordedMessage : event.reason,
  reasonCode: 'RESTORE_UNRECORDED',
});

/* Whether the selection is still the checkout and line the running verb started on (M1). */
const selectionUnmoved = (context: RestoreMachineContext): boolean =>
  context.checkoutId === context.restoringCheckoutId && context.branch === context.restoringBranch;

/* A cut's refusal, in the words it came with; a lost CAS in the one sentence it has (A7). */
const failFromAnswer = (
  event: Extract<RestoreCutAnswer, { type: 'cutFailed' | 'casLost' }>,
): Partial<RestoreMachineContext> =>
  event.type === 'casLost'
    ? { reason: casLostMessage, reasonCode: 'CAS_LOST' }
    : { reason: event.reason, reasonCode: event.code };

const timedOut = {
  target: '#restore.failed',
  context: { reason: 'This project did not answer in time.', reasonCode: undefined },
} as const;

const restoreMachineDefinition = setup({
  schemas: {
    context: types<RestoreMachineContext>(),
    events: eventSchemas<RestoreMachineEvent>(),
    emitted: eventSchemas<RestoreMachineEmitted>(),
    input: types<RestoreMachineInput>(),
  },
  actors: {
    computePlan: createAsyncLogic<RestoreComputePlanActorOutput, RestoreComputePlanActorInput>({
      run: async () => {
        throw new Error('restoreMachine: the computePlan actor was not provided.');
      },
    }),
    applyPlan: createAsyncLogic<RestoreApplyPlanActorOutput, Readonly<{ checkoutId: string; planId: string }>>({
      run: async () => {
        throw new Error('restoreMachine: the applyPlan actor was not provided.');
      },
    }),
  },
  guards: {
    /* A restore is risky when it deletes files or the tree has diverged from head. */
    isRisky: (context: RestoreMachineContext) => context.removedPathCount > 0 || context.dirty,
    /* The answer to the cut this verb is waiting on, by the id it sent (N2). */
    answersOurCut: (context: RestoreMachineContext, event: RestoreCutAnswer) =>
      event.requestId !== undefined && event.requestId === context.requestId,
  },
}).createMachine({
  id: 'restore',
  context: ({ input }) => ({
    projectId: input.projectId,
    checkoutId: input.checkoutId,
    branch: undefined,
    restoringCheckoutId: undefined,
    restoringBranch: undefined,
    requestId: undefined,
    cutCount: 0,
    target: undefined,
    firstParent: false,
    restoredRevisionId: undefined,
    planId: undefined,
    revisionId: undefined,
    revisionNumber: undefined,
    removedPathCount: 0,
    dirty: false,
    reason: undefined,
    reasonCode: undefined,
    parentRef: input.parentRef,
  }),
  initial: 'idle',
  on: {
    /* The selection only: a running verb keeps the checkout it pinned (A6).
     * Undo does not follow the selection anywhere its restore did not land (M1). */
    selectCheckout: ({ context, event }) =>
      event.checkoutId === context.checkoutId && event.branch === context.branch
        ? undefined
        : { context: { checkoutId: event.checkoutId, branch: event.branch, restoredRevisionId: undefined } },
  },
  states: {
    idle: {
      on: {
        restore: {
          target: 'recording',
          context: ({ context, event }) => ({
            restoringCheckoutId: context.checkoutId,
            restoringBranch: context.branch,
            target: event.revisionId,
            firstParent: false,
            reason: undefined,
            reasonCode: undefined,
          }),
        },
        /* Where its restore landed or nowhere, and said either way (M1, I12). */
        undo: ({ context }, enq) => {
          const target = context.restoredRevisionId;
          if (target === undefined) {
            enq.emit({ type: 'toast.error', message: undoUnavailableMessage, code: 'UNDO_UNAVAILABLE' });
            return {};
          }
          return {
            target: 'recording',
            context: {
              restoringCheckoutId: context.checkoutId,
              restoringBranch: context.branch,
              target,
              firstParent: true,
              reason: undefined,
              reasonCode: undefined,
            },
          };
        },
      },
    },
    /* Step 1: mint what the checkout has, so nothing unsaved is overwritten (I1). */
    recording: {
      entry: ({ context }, enq) => ({ context: askCut(context, enq) }),
      after: { [restoreCutMilliseconds]: timedOut },
      on: {
        revisionMinted: ({ context, event, guards }) =>
          guards.answersOurCut(context, event) ? { target: 'planning' } : undefined,
        nothingToSave: ({ context, event, guards }) =>
          guards.answersOurCut(context, event) ? { target: 'planning' } : undefined,
        cutFailed: ({ context, event, guards }) =>
          guards.answersOurCut(context, event) ? { target: 'failed', context: failFromAnswer(event) } : undefined,
        casLost: ({ context, event, guards }) =>
          guards.answersOurCut(context, event) ? { target: 'failed', context: failFromAnswer(event) } : undefined,
      },
    },
    planning: {
      invoke: {
        src: 'computePlan',
        input: ({ context }) => ({
          checkoutId: context.restoringCheckoutId ?? context.checkoutId,
          target: context.target ?? '',
          ...(context.firstParent ? { firstParent: true } : {}),
        }),
        onDone: {
          target: 'planned',
          context: ({ event }) => ({
            planId: event.output.planId,
            revisionId: event.output.revisionId,
            revisionNumber: event.output.revisionNumber,
            removedPathCount: event.output.removedPathCount,
            dirty: event.output.dirty,
          }),
        },
        onError: {
          target: 'failed',
          context: ({ event }) => failFromError(event.error),
        },
      },
    },
    planned: {
      always: ({ context, guards }) => (guards.isRisky(context) ? { target: 'confirming' } : { target: 'applying' }),
    },
    confirming: {
      on: {
        confirm: { target: 'applying' },
        cancel: { target: 'settled' },
      },
    },
    /* Step 2: write the target tree; the host proves the head has not moved (A3). */
    applying: {
      invoke: {
        src: 'applyPlan',
        input: ({ context }) => ({
          checkoutId: context.restoringCheckoutId ?? context.checkoutId,
          planId: context.planId ?? '',
        }),
        onDone: { target: 'minting' },
        onError: {
          target: 'failed',
          context: ({ event }) => failFromError(event.error),
        },
      },
    },
    /* Step 3: the checkout mints the applied tree; the line fast-forwards (A4). */
    minting: {
      entry: ({ context }, enq) => ({ context: askCut(context, enq, context.revisionId) }),
      after: { [restoreCutMilliseconds]: timedOut },
      on: {
        revisionMinted: ({ context, event, guards }) =>
          guards.answersOurCut(context, event)
            ? {
                target: 'applied',
                context: { restoredRevisionId: selectionUnmoved(context) ? event.revisionId : undefined },
              }
            : undefined,
        /* The tree already was the target's: a restore to where you are is nothing (A8). */
        nothingToSave: ({ context, event, guards }) =>
          guards.answersOurCut(context, event) ? { target: 'settled' } : undefined,
        cutFailed: ({ context, event, guards }) =>
          guards.answersOurCut(context, event) ? { target: 'failed', context: unrecordedFromAnswer(event) } : undefined,
        casLost: ({ context, event, guards }) =>
          guards.answersOurCut(context, event) ? { target: 'failed', context: unrecordedFromAnswer(event) } : undefined,
      },
    },
    applied: {
      entry: ({ context }, enq) => {
        enq.emit({
          type: 'toast.restored',
          revisionNumber: context.revisionNumber,
        });
      },
      always: { target: 'settled' },
    },
    failed: {
      entry: ({ context }, enq) => {
        enq.emit({
          type: 'toast.error',
          message: context.reason ?? 'Restore failed.',
          ...(context.reasonCode === undefined ? {} : { code: context.reasonCode }),
        });
      },
      always: { target: 'settled' },
    },
    /* Every exit passes here, so the root releases what it held for this verb (A2). */
    settled: {
      entry: ({ context }, enq) => {
        if (context.parentRef !== undefined) {
          const fact: RestoreMachineParentEvent = {
            type: 'restoreSettled',
            checkoutId: context.restoringCheckoutId ?? context.checkoutId,
          };
          enq.sendTo(context.parentRef, fact);
        }
      },
      always: { target: 'idle', context: clearTransient },
    },
  },
});

type RestoreMachineDefinition = typeof restoreMachineDefinition;

/**
 * The type of {@link restoreMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface RestoreMachine extends RestoreMachineDefinition {}

/**
 * Headless restore lifecycle for one project's selected checkout.
 *
 * @public
 */
export const restoreMachine: RestoreMachine = restoreMachineDefinition;

/**
 * Selects whether a restore is waiting for the user to confirm it.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True while the machine is confirming.
 * @public
 */
export const selectRestoreNeedsConfirmation = (snapshot: SnapshotFrom<typeof restoreMachine>): boolean =>
  snapshot.matches('confirming');

/**
 * Selects whether a restore is working on its checkout right now.
 *
 * Every step but the question: the cuts, the plan and the apply. Admissions to
 * the checkout wait for longer than this — from the pre-restore cut until the
 * verb settles, the question included (A2) — and read the pinned checkout
 * instead.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True from the pre-restore cut to the restore cut's answer, except while confirming.
 * @public
 */
export const selectRestoreBusy = (snapshot: SnapshotFrom<typeof restoreMachine>): boolean =>
  !snapshot.matches('idle') && !snapshot.matches('confirming');

/**
 * The actor set a host provides for `restoreMachine` (S37).
 *
 * Taken from the machine's own `provide` parameter so an implementation that
 * drifts from an actor's input or output is a type error at the host, not a
 * runtime surprise inside a state.
 *
 * @public
 */
export type RestoreActors = MachineActors<typeof restoreMachine>;
