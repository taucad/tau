/**
 * `restore.machine` — the *Restore*, *Return to latest* and *Undo* verbs.
 *
 * These are the states `apps/ui/app/machines/revision.machine.ts` has today,
 * re-rooted on the revision graph instead of the chat transcript and renamed to
 * `camelCase` (F19). `computePlan` and `applyPlan` stay injected actors, the
 * pattern `RevisionProvider` already uses.
 *
 * The plan itself never enters context: `computePlan` returns the facts the
 * guards need plus an opaque `planId` the host holds, so the snapshot stays
 * serializable and a file set never rides in a machine.
 */

import { assign, emit, enqueueActions, fromPromise, setup } from 'xstate';
import type { AnyActorRef, SnapshotFrom } from 'xstate';

/** Target that means "the newest revision on this checkout's branch". @public */
export const latestRevisionTarget = 'latest';

/** Input accepted when creating the restoreMachine actor. @public */
export type RestoreMachineInput = Readonly<{
  projectId: string;
  /** The checkout the workbench is rooted at; restores apply here. */
  checkoutId: string;
  /** Head this checkout sits on, rehydrated from records (I3). */
  headRevisionId?: string;
  parentRef?: AnyActorRef;
}>;

/** Serializable state owned by restoreMachine. @public */
export type RestoreMachineContext = Readonly<{
  projectId: string;
  checkoutId: string;
  headRevisionId: string | undefined;
  /** Head before the last restore; what *Undo* returns to. */
  previousRevisionId: string | undefined;
  /** The requested target: a revision id, or {@link latestRevisionTarget}. */
  target: string | undefined;
  /** Opaque handle to the plan the host computed and is holding. */
  planId: string | undefined;
  /** The revision the plan resolved to. */
  revisionId: string | undefined;
  revisionNumber: number | undefined;
  removedPathCount: number;
  dirty: boolean;
  unrecoverable: readonly string[];
  reason: string | undefined;
  parentRef: AnyActorRef | undefined;
}>;

/** Events accepted by restoreMachine. @public */
export type RestoreMachineEvent =
  | Readonly<{ type: 'restore'; revisionId: string }>
  | Readonly<{ type: 'returnToLatest' }>
  | Readonly<{ type: 'undo' }>
  | Readonly<{ type: 'confirm' }>
  | Readonly<{ type: 'cancel' }>
  /** The root re-roots the workbench; restores apply to whatever it selected (F10). */
  | Readonly<{ type: 'selectCheckout'; checkoutId: string; headRevisionId?: string }>;

/** Facts restoreMachine emits, and sends to its parent when they move a checkout. @public */
export type RestoreMachineEmitted =
  | Readonly<{ type: 'toast.restored'; revisionNumber: number; unrecoverable: readonly string[] }>
  | Readonly<{ type: 'toast.error'; message: string }>
  | Readonly<{
      type: 'checkoutChanged';
      checkoutId: string;
      revisionId: string;
      /** Tree object id of the restored revision — the checkout's I5 gate needs it. */
      treeId: string;
      /** `undefined` when no branch names the restored revision — detached (A2). */
      branch: string | undefined;
    }>;

/** Input of the injected `computePlan` actor. @public */
export type RestoreComputePlanActorInput = Readonly<{ checkoutId: string; target: string }>;

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
  revisionNumber: number;
  removedPathCount: number;
  dirty: boolean;
  /** Paths the restore cannot bring back, surfaced in the toast. */
  unrecoverable: readonly string[];
}>;

/** Output of the injected `applyPlan` actor. @public */
export type RestoreApplyPlanActorOutput = Readonly<{
  revisionId: string;
  treeId: string;
  branch: string | undefined;
}>;

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Restore failed.';

/**
 * Headless restore lifecycle for one project's selected checkout.
 *
 * @public
 */
export const restoreMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as RestoreMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as RestoreMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    emitted: {} as RestoreMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as RestoreMachineInput,
  },
  actors: {
    computePlan: fromPromise<RestoreComputePlanActorOutput, RestoreComputePlanActorInput>(async () => {
      throw new Error('restoreMachine: the computePlan actor was not provided.');
    }),
    applyPlan: fromPromise<RestoreApplyPlanActorOutput, Readonly<{ checkoutId: string; planId: string }>>(async () => {
      throw new Error('restoreMachine: the applyPlan actor was not provided.');
    }),
  },
  guards: {
    /* A restore is risky when it deletes files or the tree has diverged from head. */
    isRisky: ({ context }) => context.removedPathCount > 0 || context.dirty,
    canUndo: ({ context }) => context.previousRevisionId !== undefined,
  },
  actions: {
    clearTransient: assign({
      target: undefined,
      planId: undefined,
      revisionId: undefined,
      revisionNumber: undefined,
      removedPathCount: 0,
      dirty: false,
      unrecoverable: [],
    }),
  },
}).createMachine({
  id: 'restore',
  context: ({ input }) => ({
    projectId: input.projectId,
    checkoutId: input.checkoutId,
    headRevisionId: input.headRevisionId,
    previousRevisionId: undefined,
    target: undefined,
    planId: undefined,
    revisionId: undefined,
    revisionNumber: undefined,
    removedPathCount: 0,
    dirty: false,
    unrecoverable: [],
    reason: undefined,
    parentRef: input.parentRef,
  }),
  initial: 'idle',
  on: {
    selectCheckout: {
      actions: assign({
        checkoutId: ({ event }) => event.checkoutId,
        headRevisionId: ({ event }) => event.headRevisionId,
        previousRevisionId: undefined,
      }),
    },
  },
  states: {
    idle: {
      on: {
        restore: {
          target: 'planning',
          actions: assign({ target: ({ event }) => event.revisionId, reason: undefined }),
        },
        returnToLatest: {
          target: 'planning',
          actions: assign({ target: latestRevisionTarget, reason: undefined }),
        },
        undo: {
          guard: 'canUndo',
          target: 'planning',
          actions: assign({ target: ({ context }) => context.previousRevisionId, reason: undefined }),
        },
      },
    },
    planning: {
      invoke: {
        src: 'computePlan',
        input: ({ context }) => ({
          checkoutId: context.checkoutId,
          target: context.target ?? latestRevisionTarget,
        }),
        onDone: {
          target: 'planned',
          actions: assign({
            planId: ({ event }) => event.output.planId,
            revisionId: ({ event }) => event.output.revisionId,
            revisionNumber: ({ event }) => event.output.revisionNumber,
            removedPathCount: ({ event }) => event.output.removedPathCount,
            dirty: ({ event }) => event.output.dirty,
            unrecoverable: ({ event }) => event.output.unrecoverable,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
        },
      },
    },
    planned: {
      always: [{ guard: 'isRisky', target: 'confirming' }, { target: 'applying' }],
    },
    confirming: {
      on: {
        confirm: { target: 'applying' },
        cancel: { target: 'idle', actions: 'clearTransient' },
      },
    },
    applying: {
      invoke: {
        src: 'applyPlan',
        input: ({ context }) => ({ checkoutId: context.checkoutId, planId: context.planId ?? '' }),
        onDone: {
          target: 'applied',
          actions: [
            assign({
              previousRevisionId: ({ context }) => context.headRevisionId,
              headRevisionId: ({ event }) => event.output.revisionId,
            }),
            enqueueActions(({ context, enqueue, event }) => {
              const fact: RestoreMachineEmitted = {
                type: 'checkoutChanged',
                checkoutId: context.checkoutId,
                revisionId: event.output.revisionId,
                treeId: event.output.treeId,
                branch: event.output.branch,
              };
              enqueue.emit(fact);
              if (context.parentRef !== undefined) {
                enqueue.sendTo(context.parentRef, fact);
              }
            }),
          ],
        },
        onError: {
          target: 'failed',
          actions: assign({ reason: ({ event }) => describeFailure(event.error) }),
        },
      },
    },
    applied: {
      entry: emit(
        ({ context }): RestoreMachineEmitted => ({
          type: 'toast.restored',
          revisionNumber: context.revisionNumber ?? 0,
          unrecoverable: context.unrecoverable,
        }),
      ),
      always: { target: 'idle', actions: 'clearTransient' },
    },
    failed: {
      entry: emit(
        ({ context }): RestoreMachineEmitted => ({
          type: 'toast.error',
          message: context.reason ?? 'Restore failed.',
        }),
      ),
      always: { target: 'idle', actions: 'clearTransient' },
    },
  },
});

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
 * Selects whether a restore is planning or applying right now.
 *
 * @param snapshot - Current machine snapshot.
 * @returns True while the machine is planning or applying.
 * @public
 */
export const selectRestoreBusy = (snapshot: SnapshotFrom<typeof restoreMachine>): boolean =>
  snapshot.matches('planning') || snapshot.matches('applying');

/**
 * The actor set a host provides for `restoreMachine` (S37).
 *
 * Taken from the machine's own `provide` parameter so an implementation that
 * drifts from an actor's input or output is a type error at the host, not a
 * runtime surprise inside a state.
 *
 * @public
 */
export type RestoreActors = NonNullable<Parameters<typeof restoreMachine.provide>[0]['actors']>;
