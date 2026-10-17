import { z } from 'zod';
import { projectTaskDeliverySchema } from '#wire/project-task-journal.js';
import {
  projectTaskActionSchema,
  projectTaskMessageSchema,
  projectTaskReadSchema,
  projectTaskSchema,
  projectTaskSendSchema,
  projectTaskWaitSchema,
  projectTaskRefusalCodes,
} from '#wire/project-tasks.schema.js';

/** Project-scoped control operations, separate from per-chat run commands. @public */
export const projectTaskChannelRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('read'), input: projectTaskReadSchema }),
  z.strictObject({ operation: z.literal('wait'), input: projectTaskWaitSchema }),
  z.strictObject({ operation: z.literal('send'), input: projectTaskSendSchema }),
  z.strictObject({ operation: z.literal('cancel'), input: projectTaskActionSchema }),
  z.strictObject({ operation: z.literal('resume'), input: projectTaskActionSchema }),
]);
/** Bounded durable task/mailbox projection. @public */
export const projectTaskSnapshotSchema = z.strictObject({
  tasks: z.array(projectTaskSchema).readonly(),
  messages: z.array(projectTaskMessageSchema).readonly(),
  deliveries: z.array(projectTaskDeliverySchema).readonly().optional(),
  cursor: z.number().int().nonnegative(),
  nextCursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
/** Explicit unavailable capability and typed control outcomes. @public */
export const projectTaskChannelAnswerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('snapshot'), snapshot: projectTaskSnapshotSchema }),
  z.strictObject({ kind: z.literal('task'), task: projectTaskSchema }),
  z.strictObject({ kind: z.literal('message'), message: projectTaskMessageSchema }),
  z.strictObject({ kind: z.literal('refused'), code: z.enum(projectTaskRefusalCodes), message: z.string() }),
]);
/** One project control request. @public */
export type ProjectTaskChannelRequest = z.infer<typeof projectTaskChannelRequestSchema>;
/** One project control answer. @public */
export type ProjectTaskChannelAnswer = z.infer<typeof projectTaskChannelAnswerSchema>;
/** The project task projection. @public */
export type ProjectTaskSnapshot = z.infer<typeof projectTaskSnapshotSchema>;
/** Optional owner-bound project control port. @public */
export type ProjectTaskChannelPort = Readonly<{
  request: (input: ProjectTaskChannelRequest, signal?: AbortSignal) => Promise<ProjectTaskChannelAnswer>;
}>;
