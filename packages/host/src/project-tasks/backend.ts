import type {
  ProjectTask,
  ProjectTaskAttempt,
  ProjectTaskMessage,
  ProjectTaskProvider,
  ProjectTaskSource,
  ProjectTaskToolGrant,
} from '@taucad/agent-host/wire';
import type { AgentSessionModel } from '@taucad/agent-host';

/** Host-authenticated caller. Tool arguments cannot construct this identity. @internal */
export type ProjectTaskCaller =
  | Readonly<{ kind: 'host'; projectId: string }>
  | Readonly<{ kind: 'task'; projectId: string; taskId: string; attemptId: string }>;

/** One already-admitted task execution and its immutable source. @internal */
export type ProjectTaskLaunch = Readonly<{
  task: ProjectTask;
  attempt: ProjectTaskAttempt;
  signal: AbortSignal;
  messages: readonly ProjectTaskMessage[];
}>;

/** Private candidate allocated through the existing revision owner. @internal */
export type ProjectTaskAllocation = Readonly<{
  placementId: string;
  checkoutId: string;
  model?: AgentSessionModel;
}>;

/** Backend's sole existing launcher turn; completion follows settlement and release. @internal */
export type ProjectTaskExecution = Readonly<{
  runId: string;
  completion: Promise<Readonly<{ status: 'completed' | 'failed' | 'cancelled'; detail?: string }>>;
  cancel: () => Promise<void>;
}>;

/** Host composition port. No model loop or session pool belongs to the task coordinator. @internal */
export type ProjectTaskBackend = Readonly<{
  /** Validate provider/capabilities without allocating resources. */
  validate: (provider: ProjectTaskProvider) => Promise<void>;
  /** Derive host-created child candidate from the explicit recorded revision. Compensate internally if rejecting. */
  allocate: (launch: ProjectTaskLaunch) => Promise<ProjectTaskAllocation>;
  /** Start one turn on the already-admitted allocation; never acquire a second task reservation. */
  start: (launch: ProjectTaskLaunch, allocation: ProjectTaskAllocation) => Promise<ProjectTaskExecution>;
  /** Preserve partial candidate output while releasing resources. Must be idempotent across restart. */
  release: (
    input: Readonly<{ task: ProjectTask; attempt: ProjectTaskAttempt; allocation: ProjectTaskAllocation }>,
  ) => Promise<void>;
  /** Reconcile launcher/leases; return any allocation that still needs release, including crash-before-record allocation. */
  reconcile: (
    input: Readonly<{ task: ProjectTask; attempt: ProjectTaskAttempt }>,
  ) => Promise<ProjectTaskAllocation | undefined>;
}>;

/** Root turns count against the same budget but execute through their existing host owner. @internal */
export type ProjectTaskRootAdmission = Readonly<{
  requestId: string;
  chatId: string;
  runId: string;
  title: string;
  prompt: string;
  provider: ProjectTaskProvider;
  source: ProjectTaskSource;
  toolGrant: ProjectTaskToolGrant;
}>;

/** Rebind a native continuation to its durable task without a second backend admission. @internal */
export type ProjectTaskContinuationAdmission = Readonly<{ requestId: string; chatId: string; runId: string }>;
