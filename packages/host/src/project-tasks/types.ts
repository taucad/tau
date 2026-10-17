import type {
  ProjectTask,
  ProjectTaskAction,
  ProjectTaskMessage,
  ProjectTaskRead,
  ProjectTaskSend,
  ProjectTaskSpawn,
  ProjectTaskWait,
} from '@taucad/agent-host/wire';
import type {
  ProjectTaskCaller,
  ProjectTaskContinuationAdmission,
  ProjectTaskRootAdmission,
} from '#project-tasks/backend.js';

/** Ordered durable projection returned to UI/tools; cursor covers the whole project journal. @internal */
export type ProjectTaskSnapshot = Readonly<{
  tasks: readonly ProjectTask[];
  messages: readonly ProjectTaskMessage[];
  deliveries: ReadonlyArray<Readonly<{ taskId: string; attemptId: string; through: number }>>;
  cursor: number;
  nextCursor: number;
  hasMore: boolean;
}>;

/** Host-owned task operations; every call receives an authenticated identity separately from model input. @internal */
export type ProjectTaskCoordinator = Readonly<{
  admitRoot: (input: ProjectTaskRootAdmission) => Promise<ProjectTask>;
  admitContinuation: (input: ProjectTaskContinuationAdmission) => Promise<ProjectTask>;
  finishRoot: (
    input: Readonly<{
      taskId: string;
      attemptId: string;
      status: 'completed' | 'failed' | 'cancelled';
      detail?: string;
    }>,
  ) => Promise<void>;
  callerFor: (input: Readonly<{ chatId: string; runId: string }>) => ProjectTaskCaller | undefined;
  spawn: (caller: ProjectTaskCaller, input: ProjectTaskSpawn) => Promise<ProjectTask>;
  send: (caller: ProjectTaskCaller, input: ProjectTaskSend) => Promise<ProjectTaskMessage>;
  read: (caller: ProjectTaskCaller, input?: ProjectTaskRead) => Promise<ProjectTaskSnapshot>;
  wait: (caller: ProjectTaskCaller, input?: ProjectTaskWait, signal?: AbortSignal) => Promise<ProjectTaskSnapshot>;
  cancel: (caller: ProjectTaskCaller, input: ProjectTaskAction) => Promise<ProjectTask>;
  resume: (caller: ProjectTaskCaller, input: ProjectTaskAction) => Promise<ProjectTask>;
  /** Messages not yet handed to a model turn, preserving append versus delivery facts. */
  inbox: (
    input: Readonly<{ taskId: string; after?: number; limit?: number }>,
  ) => Promise<readonly ProjectTaskMessage[]>;
  /** Record delivery only after the existing turn owner accepts the prompt. */
  acknowledgeDelivery: (input: Readonly<{ taskId: string; attemptId: string; through: number }>) => Promise<void>;
  /** Repair child chat metadata from durable journal state before recovery or dispatch. */
  repairLineage: () => Promise<void>;
  /** Recovery awaits existing chat/lease owners before marking old attempts interrupted. */
  recover: () => Promise<void>;
  close: () => Promise<void>;
}>;
