import { setup, assign, emit } from 'xstate';
import type { FileWriteSource } from '@taucad/fs-client/file-write-source';
import { hashString } from '@taucad/utils/hash';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { isDesignPath } from '#lib/file-restore-timeline.js';
import type { RestorePlan } from '#lib/file-restore-timeline.js';
import type { PersistedRevisionState } from '#types/project.types.js';
import type {
  AuthoritativeRevisionFinalization,
  PersistedBranchPublication,
  PersistedRevisionConflict,
  PersistedRevisionGraphNode,
  PersistedRevisionGraphState,
} from '#types/revision.types.js';

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
  graph: PersistedRevisionGraphState;
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
  | { type: 'TURN_COMPLETED'; turnId?: string; chatId?: string; parentTurnId?: string }
  | { type: 'DISCARD_PENDING_TURN'; turnId: string }
  | {
      type: 'NEW_USER_TURN';
      abandonedTurnIds: string[];
      atRevision: number;
      newTurnId?: string;
      chatId?: string;
      parentTurnId?: string;
    }
  | { type: 'EDIT_SUMMARY'; turnId: string; summary: string }
  | { type: 'ASSOCIATE_JOB'; turnId: string; jobId: string }
  | {
      type: 'SET_REVISION_CONFLICT';
      turnId: string;
      conflict?: PersistedRevisionConflict;
      chatId?: string;
      branchName?: string;
    }
  | { type: 'authoritativeRevisionFinalized'; result: AuthoritativeRevisionFinalization }
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
const MAIN_BRANCH = 'main';

const emptyGraph = (): PersistedRevisionGraphState => ({
  activeBranch: MAIN_BRANCH,
  nodes: {},
  branches: {},
});

const graphHasData = (graph: PersistedRevisionGraphState): boolean =>
  Object.keys(graph.nodes).length > 0 || Object.keys(graph.branches).length > 0;

const branchForParent = (graph: PersistedRevisionGraphState, parentTurnId: string | undefined): string => {
  if (parentTurnId === undefined) {
    return graph.activeBranch;
  }
  if (graph.branches[graph.activeBranch]?.headTurnId === parentTurnId) {
    return graph.activeBranch;
  }
  return Object.values(graph.branches).find((branch) => branch.headTurnId === parentTurnId)?.name ?? graph.activeBranch;
};

const explorationBranch = (turnId: string, chatId: string): string =>
  `explore/${hashString(`turn:${turnId}`)}-${hashString(`chat:${chatId}`)}`;

type TrackableTurnEvent = Extract<RevisionEvent, { type: 'NEW_USER_TURN' }> & {
  newTurnId: string;
  chatId: string;
};

const isTrackableTurn = (event: Extract<RevisionEvent, { type: 'NEW_USER_TURN' }>): event is TrackableTurnEvent =>
  event.newTurnId !== undefined && event.chatId !== undefined;

type TrackableCompletionEvent = Extract<RevisionEvent, { type: 'TURN_COMPLETED' }> & {
  turnId: string;
  chatId: string;
};

const isTrackableCompletion = (
  event: Extract<RevisionEvent, { type: 'TURN_COMPLETED' }>,
): event is TrackableCompletionEvent => event.turnId !== undefined && event.chatId !== undefined;

const registerTurn = (graph: PersistedRevisionGraphState, event: TrackableTurnEvent): PersistedRevisionGraphState => {
  const existing = graph.nodes[event.newTurnId];
  if (existing) {
    return graph;
  }

  // A turn is never its own parent. Dropping the edge here keeps the durable
  // graph acyclic; the alternative surfaces as a thrown parent cycle inside
  // `buildRevisionGraph` during render, which no consumer can recover from.
  const selfParent = event.parentTurnId !== undefined && event.parentTurnId === event.newTurnId;
  const parentTurnId = selfParent ? undefined : event.parentTurnId;
  const baseBranch = branchForParent(graph, parentTurnId);
  const hasPendingSibling = Object.values(graph.nodes).some(
    (node) => node.status === 'pending' && node.branchName === baseBranch && node.parentTurnIds[0] === parentTurnId,
  );
  const forks = event.abandonedTurnIds.length > 0 || hasPendingSibling;
  const branchName = forks ? explorationBranch(event.newTurnId, event.chatId) : baseBranch;
  const branch = graph.branches[branchName] ?? {
    name: branchName,
    ...(parentTurnId === undefined ? {} : { headTurnId: parentTurnId }),
  };
  const node: PersistedRevisionGraphNode = {
    turnId: event.newTurnId,
    parentTurnIds: parentTurnId === undefined ? [] : [parentTurnId],
    ...(selfParent
      ? ({ parentAnomaly: 'self-parent' } satisfies Pick<PersistedRevisionGraphNode, 'parentAnomaly'>)
      : {}),
    ...(forks && parentTurnId !== undefined ? { forkPointTurnId: parentTurnId } : {}),
    branchName,
    chatId: event.chatId,
    jobIds: [],
    status: 'pending',
  };
  return {
    activeBranch: branchName,
    nodes: { ...graph.nodes, [node.turnId]: node },
    branches: { ...graph.branches, [branchName]: branch },
  };
};

const completeTurn = (
  graph: PersistedRevisionGraphState,
  event: TrackableCompletionEvent,
): PersistedRevisionGraphState => {
  const registered =
    graph.nodes[event.turnId] === undefined
      ? registerTurn(graph, {
          type: 'NEW_USER_TURN',
          abandonedTurnIds: [],
          atRevision: 0,
          newTurnId: event.turnId,
          chatId: event.chatId,
          ...(event.parentTurnId === undefined ? {} : { parentTurnId: event.parentTurnId }),
        })
      : graph;
  const node = registered.nodes[event.turnId]!;
  const completed: PersistedRevisionGraphNode = { ...node, status: 'complete' };
  return { ...registered, nodes: { ...registered.nodes, [event.turnId]: completed } };
};

const staleHeadConflict = (
  publication: Extract<PersistedBranchPublication, { status: 'conflicted' }>,
): PersistedRevisionConflict => ({
  type: 'stale-head',
  branchName: publication.branchName,
  expectedHeadRevisionId: publication.expectedHeadRevisionId,
  ...(publication.actualHeadRevisionId === undefined ? {} : { actualHeadRevisionId: publication.actualHeadRevisionId }),
  proposedHeadRevisionId: publication.proposedHeadRevisionId,
});

/** Store one already-settled authority result without recomputing identity or branch CAS. */
const applyAuthoritativeFinalization = (
  graph: PersistedRevisionGraphState,
  result: AuthoritativeRevisionFinalization,
): PersistedRevisionGraphState => {
  const existing = graph.nodes[result.turnId];
  const parentTurnIds = existing?.parentTurnIds ?? (result.parentTurnId === undefined ? [] : [result.parentTurnId]);
  const publicationConflict =
    result.publication.status === 'conflicted' ? staleHeadConflict(result.publication) : undefined;
  const existingConflict = existing?.conflict?.type === 'merge' ? existing.conflict : undefined;
  const nextConflict = publicationConflict ?? existingConflict;
  const nodeWithoutConflict: Omit<PersistedRevisionGraphNode, 'conflict'> = (() => {
    if (existing === undefined) {
      return {
        turnId: result.turnId,
        parentTurnIds,
        branchName: result.branchName,
        chatId: result.chatId,
        jobIds: [],
        status: 'pending',
      };
    }
    const { conflict: _, ...withoutConflict } = existing;
    return withoutConflict;
  })();
  const node: PersistedRevisionGraphNode = {
    ...nodeWithoutConflict,
    parentTurnIds,
    branchName: result.branchName,
    chatId: result.chatId,
    jobIds: [...new Set([...(existing?.jobIds ?? []), ...result.jobIds])],
    status: 'complete',
    revisionId: result.revisionId,
    baseRevisionId: result.baseRevisionId,
    treeId: result.treeId,
    changedPaths: [...new Set(result.changedPaths)].sort(),
    provenance: { ...result.provenance },
    generatedSummary: result.generatedSummary,
    workspaceId: result.workspaceId,
    nativeGit: { ...result.nativeGit },
    publication: { ...result.publication },
    ...(nextConflict === undefined ? {} : { conflict: nextConflict }),
  };
  const previousBranch = graph.branches[result.branchName] ?? { name: result.branchName };
  const branch = {
    ...previousBranch,
    publication: { ...result.publication },
    ...(result.publication.status === 'updated'
      ? { headTurnId: result.turnId, headRevisionId: result.publication.headRevisionId }
      : result.publication.actualHeadRevisionId === undefined
        ? {}
        : { headRevisionId: result.publication.actualHeadRevisionId }),
  };
  return {
    ...graph,
    nodes: { ...graph.nodes, [result.turnId]: node },
    branches: { ...graph.branches, [result.branchName]: branch },
  };
};

const updateGraphNode = (
  graph: PersistedRevisionGraphState,
  turnId: string,
  update: (node: PersistedRevisionGraphNode) => PersistedRevisionGraphNode,
): PersistedRevisionGraphState => {
  const node = graph.nodes[turnId];
  return node === undefined ? graph : { ...graph, nodes: { ...graph.nodes, [turnId]: update(node) } };
};

const setRevisionConflict = (
  graph: PersistedRevisionGraphState,
  event: Extract<RevisionEvent, { type: 'SET_REVISION_CONFLICT' }>,
): PersistedRevisionGraphState => {
  const existing = graph.nodes[event.turnId];
  if (!existing && (event.chatId === undefined || event.branchName === undefined || event.conflict === undefined)) {
    return graph;
  }
  const branchName = existing?.branchName ?? event.branchName;
  const chatId = existing?.chatId ?? event.chatId;
  if (branchName === undefined || chatId === undefined) {
    return graph;
  }
  const node: PersistedRevisionGraphNode = existing ?? {
    turnId: event.turnId,
    parentTurnIds: [],
    branchName,
    chatId,
    jobIds: [],
    status: 'pending',
  };
  const next = (() => {
    if (event.conflict !== undefined) {
      return { ...node, conflict: event.conflict };
    }
    const { conflict: _, ...withoutConflict } = node;
    return withoutConflict;
  })();
  const branch = graph.branches[node.branchName] ?? { name: node.branchName };
  return {
    ...graph,
    nodes: { ...graph.nodes, [event.turnId]: next },
    branches: { ...graph.branches, [node.branchName]: branch },
  };
};

const discardPendingTurn = (graph: PersistedRevisionGraphState, turnId: string): PersistedRevisionGraphState => {
  const node = graph.nodes[turnId];
  if (node?.status !== 'pending') {
    return graph;
  }
  const nodes = Object.fromEntries(Object.entries(graph.nodes).filter(([candidate]) => candidate !== turnId));
  const branchIsUsed = Object.values(nodes).some((candidate) => candidate.branchName === node.branchName);
  const branches =
    node.branchName === MAIN_BRANCH || branchIsUsed
      ? graph.branches
      : Object.fromEntries(Object.entries(graph.branches).filter(([name]) => name !== node.branchName));
  const activeBranch =
    branches[graph.activeBranch] === undefined
      ? (Object.values(branches).find((branch) => branch.headTurnId === node.parentTurnIds[0])?.name ?? MAIN_BRANCH)
      : graph.activeBranch;
  return { activeBranch, nodes, branches };
};

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
    isTrackableTurn: ({ event }) => event.type === 'NEW_USER_TURN' && isTrackableTurn(event),
    canUndo: ({ context }) => context.fromHeadTurnId !== undefined,
  },
  actions: {
    persistState: ({ context }) => {
      const state: PersistedRevisionState = {
        headTurnId: context.headTurnId,
        supersededTurnIds: context.supersededTurnIds,
        dirty: context.dirty,
        ...(graphHasData(context.graph) ? { graph: context.graph } : {}),
      };
      context.persist(state);
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
    graph: input.initial.graph ?? emptyGraph(),
  }),
  initial: 'idle',
  // Root-level tracking handlers — available in every state, context-only.
  on: {
    TURN_COMPLETED: {
      // Advance the head to the tip: '' means "follow the newest Revision", so a
      // later re-derivation can never strand it on a drifted anchor (R3).
      actions: [
        assign({
          headTurnId: '',
          dirty: false,
          graph: ({ context, event }) =>
            isTrackableCompletion(event) ? completeTurn(context.graph, event) : context.graph,
        }),
        'persistState',
      ],
    },
    DISCARD_PENDING_TURN: {
      actions: [
        assign({
          graph: ({ context, event }) => discardPendingTurn(context.graph, event.turnId),
        }),
        'persistState',
      ],
    },
    NEW_USER_TURN: [
      {
        guard: 'isFork',
        actions: [
          assign({
            supersededTurnIds: ({ context, event }) => [
              ...new Set([...context.supersededTurnIds, ...event.abandonedTurnIds]),
            ],
            graph: ({ context, event }) =>
              isTrackableTurn(event) ? registerTurn(context.graph, event) : context.graph,
          }),
          'persistState',
          emit(({ event }) => ({
            type: 'forkMarker',
            atRevision: event.atRevision,
          })),
        ],
      },
      {
        guard: 'isTrackableTurn',
        actions: [
          assign({
            graph: ({ context, event }) =>
              isTrackableTurn(event) ? registerTurn(context.graph, event) : context.graph,
          }),
          'persistState',
        ],
      },
    ],
    EDIT_SUMMARY: {
      actions: [
        assign({
          graph: ({ context, event }) =>
            updateGraphNode(context.graph, event.turnId, (node) => {
              const summary = event.summary.trim();
              if (summary.length > 0) {
                return { ...node, editedSummary: summary };
              }
              const { editedSummary: _, ...withoutSummary } = node;
              return withoutSummary;
            }),
        }),
        'persistState',
      ],
    },
    ASSOCIATE_JOB: {
      actions: [
        assign({
          graph: ({ context, event }) =>
            updateGraphNode(context.graph, event.turnId, (node) => ({
              ...node,
              jobIds: [...new Set([...node.jobIds, event.jobId])],
            })),
        }),
        'persistState',
      ],
    },
    SET_REVISION_CONFLICT: {
      actions: [
        assign({
          graph: ({ context, event }) => setRevisionConflict(context.graph, event),
        }),
        'persistState',
      ],
    },
    authoritativeRevisionFinalized: {
      actions: [
        assign({
          headTurnId: '',
          dirty: false,
          graph: ({ context, event }) => applyAuthoritativeFinalization(context.graph, event.result),
        }),
        'persistState',
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
