import { setup, assign, emit } from 'xstate';
import type { FileWriteSource } from '@taucad/fs-client/file-write-source';
import type { PersistedRevisionState } from '@taucad/types';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { isDesignPath } from '#lib/file-restore-timeline.js';
import type { RestorePlan } from '#lib/file-restore-timeline.js';

/**
 * `revisionMachine` — the stateful half of chat-restore time-travel.
 *
 * Owns the restore action lifecycle (plan → confirm-if-risky → apply →
 * toast/undo), the long-lived `headTurnId` / `supersededTurnIds` / `dirty`
 * slice, fork/supersession on a new turn, and multi-tab persistence. The pure
 * timeline (`file-restore-timeline.ts`) is invoked through the injected
 * `computePlan` / `applyPlan` actors. See
 * docs/research/chat-restore-time-travel.md.
 *
 * `computePlan` / `applyPlan` are throwing placeholders here; the
 * `RevisionProvider` supplies real implementations via `.provide({ actors })`,
 * and tests supply mocks. Because `fromSafeAsync` is built on
 * `fromEventObservable`, `computePlan` emits a `planComputed` event (consumed
 * by the `planning` state's `on` handler) and then completes (`onDone`).
 */

export type RestoreTarget = { messageId: string; anchor: number };

/** Emitted by the `computePlan` actor back into the machine. */
export type PlanComputedEvent = {
  type: 'planComputed';
  plan: RestorePlan;
  target: RestoreTarget; // Resolved (real messageId + anchor), not the requested sentinel.
  isLatest: boolean; // Resolved target is the newest Revision → head collapses to the tip sentinel.
  n: number; // Resolved Revision number, for the toast.
};

export type RevisionContext = PersistedRevisionState & {
  projectId: string;
  persist: (state: PersistedRevisionState) => void;
  // Transient — reset each restore cycle:
  target?: RestoreTarget;
  plan?: RestorePlan;
  n?: number;
  isLatest?: boolean;
  fromHeadTurnId?: string; // Pre-restore head (message id, '' = tip) — powers UNDO.
  error?: string;
};

export type RevisionEvent =
  // Action lifecycle (user / UI):
  | { type: 'RESTORE'; target: RestoreTarget }
  | { type: 'RETURN_TO_LATEST' }
  | { type: 'UNDO' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' }
  // Tracking (sibling machines — root-level, context-only):
  | { type: 'TURN_COMPLETED' }
  | { type: 'NEW_USER_TURN'; abandonedTurnIds: string[]; atRevision: number }
  | { type: 'FS_WRITE'; source: FileWriteSource; path: string }
  // Internal (emitted by computePlan):
  | PlanComputedEvent;

type Emitted =
  | { type: 'toast.restored'; n: number; unrecoverable: string[] }
  | { type: 'toast.error'; message: string }
  | { type: 'forkMarker'; atRevision: number };

export type ComputePlanInput = {
  projectId: string;
  target: RestoreTarget;
  supersededTurnIds: string[];
};
export type ApplyPlanInput = { plan: RestorePlan };
export type RevisionMachineInput = {
  projectId: string;
  initial: PersistedRevisionState;
  persist: (state: PersistedRevisionState) => void;
};

/** RETURN_TO_LATEST / UNDO resolve their concrete Revision inside `computePlan`. */
const LATEST_SENTINEL = Number.POSITIVE_INFINITY;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Restore failed';

export const revisionMachine = setup({
  types: {
    // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as RevisionContext,
    // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as RevisionEvent,
    // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as Emitted,
    // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as RevisionMachineInput,
  },
  actors: {
    computePlan: fromSafeAsync<PlanComputedEvent, ComputePlanInput>(async () => {
      throw new Error('revisionMachine: computePlan actor not provided');
    }),
    applyPlan: fromSafeAsync<void, ApplyPlanInput>(async () => {
      throw new Error('revisionMachine: applyPlan actor not provided');
    }),
  },
  guards: {
    // PC9: a restore is risky (needs confirmation) if it deletes files or the
    // live FS has diverged from the head via a manual edit.
    isRisky: ({ context }) => (context.plan?.remove.size ?? 0) > 0 || context.dirty,
    // H6/H10: a non-'machine' write to a design path diverges the FS. Restore's
    // own 'machine' writes and parameter writes ('machine' + .tau/) are excluded.
    isNonMachineDesignWrite: ({ event }) =>
      event.type === 'FS_WRITE' && event.source !== 'machine' && isDesignPath(event.path),
    isFork: ({ event }) => event.type === 'NEW_USER_TURN' && event.abandonedTurnIds.length > 0,
    canUndo: ({ context }) => context.fromHeadTurnId !== undefined,
  },
  actions: {
    persistState: ({ context }) => {
      context.persist({
        headTurnId: context.headTurnId,
        supersededTurnIds: context.supersededTurnIds,
        dirty: context.dirty,
      });
    },
    clearTransient: assign({
      target: undefined,
      plan: undefined,
      n: undefined,
      isLatest: undefined,
      error: undefined,
    }),
  },
}).createMachine({
  id: 'revision',
  context: ({ input }) => ({
    projectId: input.projectId,
    persist: input.persist,
    headTurnId: input.initial.headTurnId,
    supersededTurnIds: input.initial.supersededTurnIds,
    dirty: input.initial.dirty,
  }),
  initial: 'idle',
  // Root-level tracking handlers — available in every state, context-only.
  on: {
    TURN_COMPLETED: {
      // Advance the head to the tip: '' means "follow the newest Revision", so a
      // later re-derivation can never strand it on a drifted anchor (R3).
      actions: [assign({ headTurnId: '', dirty: false }), 'persistState'],
    },
    NEW_USER_TURN: {
      guard: 'isFork',
      actions: [
        assign({
          supersededTurnIds: ({ context, event }) => [
            ...new Set([...context.supersededTurnIds, ...event.abandonedTurnIds]),
          ],
        }),
        'persistState',
        emit(({ event }) => ({
          type: 'forkMarker',
          atRevision: event.atRevision,
        })),
      ],
    },
    FS_WRITE: {
      guard: 'isNonMachineDesignWrite',
      actions: [assign({ dirty: true }), 'persistState'],
    },
  },
  states: {
    idle: {
      on: {
        RESTORE: {
          target: 'planning',
          actions: assign({
            target: ({ event }) => event.target,
            error: undefined,
          }),
        },
        RETURN_TO_LATEST: {
          target: 'planning',
          actions: assign({
            target: () => ({ messageId: '', anchor: LATEST_SENTINEL }),
            error: undefined,
          }),
        },
        UNDO: {
          target: 'planning',
          guard: 'canUndo',
          actions: assign({
            // Return to the pre-restore head by id ('' → tip). LATEST_SENTINEL is
            // the anchor fallback so a vanished id lands safely on the tip.
            target: ({ context }) => ({
              messageId: context.fromHeadTurnId!,
              anchor: LATEST_SENTINEL,
            }),
            error: undefined,
          }),
        },
      },
    },
    planning: {
      invoke: {
        src: 'computePlan',
        input: ({ context }) => ({
          projectId: context.projectId,
          target: context.target!,
          supersededTurnIds: context.supersededTurnIds,
        }),
        onDone: { target: 'planned' },
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => errorMessage(event.error) }),
        },
      },
      on: {
        // Emitted by computePlan before it completes — assign the plan while still
        // in `planning` so `planned`'s `isRisky` guard reads the assigned context.
        planComputed: {
          actions: assign({
            plan: ({ event }) => event.plan,
            target: ({ event }) => event.target,
            isLatest: ({ event }) => event.isLatest,
            n: ({ event }) => event.n,
          }),
        },
      },
    },
    planned: {
      always: [{ guard: 'isRisky', target: 'confirming' }, { target: 'applying' }],
    },
    confirming: {
      on: {
        CONFIRM: { target: 'applying' },
        CANCEL: { target: 'idle', actions: 'clearTransient' },
      },
    },
    applying: {
      invoke: {
        src: 'applyPlan',
        input: ({ context }) => ({ plan: context.plan! }),
        onDone: { target: 'applied' },
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => errorMessage(event.error) }),
        },
      },
    },
    applied: {
      entry: [
        assign({
          fromHeadTurnId: ({ context }) => context.headTurnId,
          // Restoring the newest Revision collapses the head to the tip sentinel.
          headTurnId: ({ context }) => (context.isLatest ? '' : context.target!.messageId),
          dirty: false,
        }),
        'persistState',
        emit(({ context }) => ({
          type: 'toast.restored',
          n: context.n ?? 0,
          unrecoverable: [...(context.plan?.unrecoverable ?? [])],
        })),
      ],
      always: { target: 'idle', actions: 'clearTransient' },
    },
    failed: {
      entry: [
        emit(({ context }) => ({
          type: 'toast.error',
          message: context.error ?? 'Restore failed',
        })),
        'clearTransient',
      ],
      always: { target: 'idle' },
    },
  },
});
