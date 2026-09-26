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

import { createAsyncLogic, setup, types } from 'xstate';
import type { AnyActorRef, SnapshotFrom } from 'xstate';

import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';

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

/* Everything one restore attempt leaves behind, cleared when it settles. */
const clearTransient = {
  target: undefined,
  planId: undefined,
  revisionId: undefined,
  revisionNumber: undefined,
  removedPathCount: 0,
  dirty: false,
  unrecoverable: [],
} satisfies Partial<RestoreMachineContext>;

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
    canUndo: (context: RestoreMachineContext) => context.previousRevisionId !== undefined,
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
      context: ({ event }) => ({
        checkoutId: event.checkoutId,
        headRevisionId: event.headRevisionId,
        previousRevisionId: undefined,
      }),
    },
  },
  states: {
    idle: {
      on: {
        restore: {
          target: 'planning',
          context: ({ event }) => ({ target: event.revisionId, reason: undefined }),
        },
        returnToLatest: {
          target: 'planning',
          context: { target: latestRevisionTarget, reason: undefined },
        },
        undo: ({ context, guards }) => {
          if (!guards.canUndo(context)) {
            return undefined;
          }
          return { target: 'planning', context: { target: context.previousRevisionId, reason: undefined } };
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
          context: ({ event }) => ({
            planId: event.output.planId,
            revisionId: event.output.revisionId,
            revisionNumber: event.output.revisionNumber,
            removedPathCount: event.output.removedPathCount,
            dirty: event.output.dirty,
            unrecoverable: event.output.unrecoverable,
          }),
        },
        onError: {
          target: 'failed',
          context: ({ event }) => ({ reason: describeFailure(event.error) }),
        },
      },
    },
    planned: {
      always: ({ context, guards }) => (guards.isRisky(context) ? { target: 'confirming' } : { target: 'applying' }),
    },
    confirming: {
      on: {
        confirm: { target: 'applying' },
        cancel: { target: 'idle', context: clearTransient },
      },
    },
    applying: {
      invoke: {
        src: 'applyPlan',
        input: ({ context }) => ({ checkoutId: context.checkoutId, planId: context.planId ?? '' }),
        onDone: ({ context, event }, enq) => {
          const fact: RestoreMachineEmitted = {
            type: 'checkoutChanged',
            checkoutId: context.checkoutId,
            revisionId: event.output.revisionId,
            treeId: event.output.treeId,
            branch: event.output.branch,
          };
          enq.emit(fact);
          if (context.parentRef !== undefined) {
            enq.sendTo(context.parentRef, fact);
          }
          return {
            target: 'applied',
            context: { previousRevisionId: context.headRevisionId, headRevisionId: event.output.revisionId },
          };
        },
        onError: {
          target: 'failed',
          context: ({ event }) => ({ reason: describeFailure(event.error) }),
        },
      },
    },
    applied: {
      entry: ({ context }, enq) => {
        enq.emit({
          type: 'toast.restored',
          revisionNumber: context.revisionNumber ?? 0,
          unrecoverable: context.unrecoverable,
        });
      },
      always: { target: 'idle', context: clearTransient },
    },
    failed: {
      entry: ({ context }, enq) => {
        enq.emit({ type: 'toast.error', message: context.reason ?? 'Restore failed.' });
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
export type RestoreActors = MachineActors<typeof restoreMachine>;
