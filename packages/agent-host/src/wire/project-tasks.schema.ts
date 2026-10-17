import { z } from 'zod';
import { agentChannelToolChoiceSchema } from '#wire/admission.schema.js';

const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w.-]+$/u)
  .refine((value) => value !== '.' && value !== '..');

/** Bounded model-delivery mailbox batches; full UI reads remain cursor-paginated. @public */
export const projectTaskMailboxLimits: Readonly<{ maxMessages: number; maxBytes: number; maxTextBytes: number }> = {
  maxMessages: 16,
  maxBytes: 32_768,
  maxTextBytes: 16_384,
};
const mailboxText = z
  .string()
  .min(1)
  .max(projectTaskMailboxLimits.maxTextBytes)
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= projectTaskMailboxLimits.maxTextBytes,
    'Task message exceeds its UTF-8 byte budget.',
  );

/** Provider selection is transport neutral; Tau children use the Tau ACP adapter. @public */
export const projectTaskProviderSchema = z.strictObject({
  id: identifier,
  model: z.string().min(1).max(128).optional(),
});

/** Immutable source admitted by the revision owner, never a mutable working-directory gesture. @public */
export const projectTaskSourceSchema = z.strictObject({
  revisionId: identifier,
  checkoutId: identifier,
});

/** Durable permission envelope inherited from the exact admitted parent attempt. @public */
export const projectTaskToolGrantSchema = z.strictObject({
  toolChoice: agentChannelToolChoiceSchema,
  allowedTools: z.array(z.string().min(1).max(128)).max(512).optional(),
});

/** One attempt's durable phase; terminal outcomes keep partial candidate work inspectable. @public */
export const projectTaskStatusSchema = z.enum([
  'allocating',
  'running',
  'cancelling',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
]);

/** A durable execution of a task. @public */
export const projectTaskAttemptSchema = z.strictObject({
  id: identifier,
  number: z.number().int().positive(),
  status: projectTaskStatusSchema,
  source: projectTaskSourceSchema,
  toolGrant: projectTaskToolGrantSchema,
  createdAt: z.number().int().nonnegative(),
  placementId: identifier.optional(),
  candidateCheckoutId: identifier.optional(),
  runId: identifier.optional(),
  endedAt: z.number().int().nonnegative().optional(),
  detail: z.string().max(4096).optional(),
});

/** A task owns one durable chat and lineage across retries. @public */
export const projectTaskSchema = z.strictObject({
  id: identifier,
  projectId: identifier,
  chatId: identifier,
  parentTaskId: identifier.optional(),
  depth: z.number().int().nonnegative(),
  title: z.string().min(1).max(256),
  prompt: z.string().min(1).max(65_536),
  provider: projectTaskProviderSchema,
  attempts: z.array(projectTaskAttemptSchema).min(1),
  createdAt: z.number().int().nonnegative(),
  closed: z.boolean(),
});

/** Persisted mailbox row. Delivery and completion are separate facts. @public */
export const projectTaskMessageSchema = z.strictObject({
  id: identifier,
  sequence: z.number().int().positive(),
  projectId: identifier,
  senderTaskId: identifier.optional(),
  recipientTaskId: identifier,
  requestId: identifier,
  text: mailboxText,
  createdAt: z.number().int().nonnegative(),
});

/** Small portable task tool input; caller and source identity are host-derived. @public */
export const projectTaskSpawnSchema = z.strictObject({
  requestId: identifier,
  title: z.string().min(1).max(256),
  prompt: z.string().min(1).max(65_536),
  provider: projectTaskProviderSchema,
});

/** Message append input; sender is never supplied by a model. @public */
export const projectTaskSendSchema = z.strictObject({
  requestId: identifier,
  taskId: identifier,
  text: mailboxText,
});

/** Bounded mailbox read over project-wide ordered cursors. @public */
export const projectTaskReadSchema = z.strictObject({
  taskId: identifier.optional(),
  after: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/** Bounded observation never parks an admission reservation. @public */
export const projectTaskWaitSchema = projectTaskReadSchema.extend({
  /** Milliseconds. */
  timeout: z.number().int().min(0).max(30_000).optional(),
});

/** Cancellation closes descendants; resume retains task/chat identity. @public */
export const projectTaskActionSchema = z.strictObject({ taskId: identifier, requestId: identifier });

/** Typed task refusal codes shared by UI and authenticated tools. @public */
export const projectTaskRefusalCodes = [
  'TASK_UNAVAILABLE',
  'TASK_FORBIDDEN',
  'TASK_NOT_FOUND',
  'TASK_CAPACITY',
  'TASK_DEPTH',
  'TASK_SOURCE_UNAVAILABLE',
  'TASK_CLOSED',
  'TASK_BUSY',
  'TASK_REQUEST_CONFLICT',
  'TASK_CURSOR_AHEAD',
  'TASK_STORAGE_FENCED',
  'TASK_STORAGE_INVALID',
  'TASK_STORAGE_POISONED',
] as const;

/** One task refusal. @public */
export type ProjectTaskRefusalCode = (typeof projectTaskRefusalCodes)[number];
/** Provider selector. @public */
export type ProjectTaskProvider = z.infer<typeof projectTaskProviderSchema>;
/** Immutable source identity. @public */
export type ProjectTaskSource = z.infer<typeof projectTaskSourceSchema>;
/** Attempt phase. @public */
export type ProjectTaskStatus = z.infer<typeof projectTaskStatusSchema>;
/** Attempt record. @public */
export type ProjectTaskAttempt = z.infer<typeof projectTaskAttemptSchema>;
/** Task record. @public */
export type ProjectTask = z.infer<typeof projectTaskSchema>;
/** Mailbox row. @public */
export type ProjectTaskMessage = z.infer<typeof projectTaskMessageSchema>;
/** Spawn input. @public */
export type ProjectTaskSpawn = z.infer<typeof projectTaskSpawnSchema>;
/** Send input. @public */
export type ProjectTaskSend = z.infer<typeof projectTaskSendSchema>;
/** Read input. @public */
export type ProjectTaskRead = z.infer<typeof projectTaskReadSchema>;
/** Wait input. @public */
export type ProjectTaskWait = z.infer<typeof projectTaskWaitSchema>;
/** Action input. @public */
export type ProjectTaskAction = z.infer<typeof projectTaskActionSchema>;

/** Durable tool permission envelope; contains names, never capability tokens. @public */
export type ProjectTaskToolGrant = z.infer<typeof projectTaskToolGrantSchema>;
