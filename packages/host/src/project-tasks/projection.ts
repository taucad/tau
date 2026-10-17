/** Durable task projection rehydrates exclusively from records.jsonl, never from actor snapshots. */
import { createLogic } from 'xstate';
import type { ProjectTask, ProjectTaskMessage } from '@taucad/agent-host/wire';
import type { ProjectTaskRecord } from '#project-tasks/store.js';

/** The strict journal's derived aggregate facts. @internal */
export type ProjectTaskProjection = Readonly<{
  tasks: Readonly<Record<string, ProjectTask>>;
  messages: readonly ProjectTaskMessage[];
  requests: Readonly<Record<string, NonNullable<ProjectTaskRecord['request']>>>;
  deliveries: Readonly<Record<string, NonNullable<ProjectTaskRecord['delivery']>>>;
  attemptDeliveries: Readonly<Record<string, NonNullable<ProjectTaskRecord['delivery']>>>;
  records: readonly ProjectTaskRecord[];
}>;

/** Journal input alone changes the fold; initialization and unrelated deliveries leave it unchanged. @internal */
export type ProjectTaskProjectionEvent =
  | Readonly<{ type: 'append'; record: ProjectTaskRecord }>
  | Readonly<{ type: '@xstate.init' | 'foreign' }>;

/** Pure total fold; the storage writer validates and durably acknowledges before publishing an append. @internal */
export const projectTaskProjectionLogic = createLogic<ProjectTaskProjection, unknown, ProjectTaskProjectionEvent>({
  context: { tasks: {}, messages: [], requests: {}, deliveries: {}, attemptDeliveries: {}, records: [] },
  run: ({ context, event }) => {
    if (event.type !== 'append') {
      return undefined;
    }
    const { record } = event;
    return {
      context: {
        tasks: { ...context.tasks, ...Object.fromEntries(record.tasks.map((task) => [task.id, task])) },
        messages: record.message ? [...context.messages, record.message] : context.messages,
        requests: record.request ? { ...context.requests, [record.request.key]: record.request } : context.requests,
        deliveries: record.delivery
          ? { ...context.deliveries, [record.delivery.taskId]: record.delivery }
          : context.deliveries,
        attemptDeliveries: record.delivery
          ? { ...context.attemptDeliveries, [record.delivery.attemptId]: record.delivery }
          : context.attemptDeliveries,
        records: [...context.records, record],
      },
    };
  },
});
