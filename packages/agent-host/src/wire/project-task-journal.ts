import { z } from 'zod';
import { projectTaskMessageSchema, projectTaskSchema } from '#wire/project-tasks.schema.js';

/** One acknowledged mailbox delivery, tied to the exact attempt that received it. @public */
export const projectTaskDeliverySchema = z.strictObject({
  taskId: z.string().min(1),
  attemptId: z.string().min(1),
  through: z.number().int().nonnegative(),
});

/** Strict durable project-task journal row. @public */
export const projectTaskRecordSchema = z.strictObject({
  version: z.literal(1),
  projectId: z.string().min(1),
  sequence: z.number().int().positive(),
  tasks: z.array(projectTaskSchema),
  message: projectTaskMessageSchema.optional(),
  request: z
    .strictObject({
      key: z.string().min(1),
      fingerprint: z.string().min(1),
      result: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('task'), task: projectTaskSchema }),
        z.strictObject({ kind: z.literal('message'), message: projectTaskMessageSchema }),
      ]),
    })
    .optional(),
  delivery: projectTaskDeliverySchema.optional(),
});

/** The portable child-to-chat lineage used by saved-chat metadata readers. @public */
export type ProjectTaskChatLineage = Readonly<{
  chatId: string;
  taskLineage: Readonly<{
    taskId: string;
    parentTaskId: string;
    parentChatId: string;
    rootChatId: string;
  }>;
}>;

/**
 * Fold a validated journal into child-chat lineage. A torn final row is ignored, as by the host store.
 * Complete invalid rows, gaps, cross-project records and broken ancestry fail closed.
 *
 * @param bytes - Journal bytes read from the project task sidecar.
 * @param projectId - Expected project identity.
 * @returns One lineage entry per child chat; roots have no lineage metadata.
 * @public
 */
export const projectTaskLineageFromJournal = (
  bytes: Uint8Array<ArrayBuffer>,
  projectId: string,
): readonly ProjectTaskChatLineage[] => {
  if (bytes.byteLength > 64 * 1024 * 1024) {
    throw new Error('Project task journal exceeds the navigation read limit.');
  }
  const lastNewline = bytes.lastIndexOf(10);
  const complete = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, lastNewline + 1));
  const tasks = new Map<string, z.infer<typeof projectTaskSchema>>();
  let sequence = 0;
  for (const line of complete.split('\n').filter(Boolean)) {
    if (sequence >= 100_000 || line.length > 1024 * 1024) {
      throw new Error('Project task journal exceeds the navigation row limit.');
    }
    const record = projectTaskRecordSchema.parse(JSON.parse(line));
    if (
      record.projectId !== projectId ||
      record.sequence !== ++sequence ||
      record.tasks.some((task) => task.projectId !== projectId) ||
      (record.message && (record.message.projectId !== projectId || record.message.sequence !== record.sequence))
    ) {
      throw new Error('Project task journal identity or ordering does not match.');
    }
    for (const task of record.tasks) {
      tasks.set(task.id, task);
    }
  }
  const lineage: ProjectTaskChatLineage[] = [];
  const chats = new Set<string>();
  for (const task of tasks.values()) {
    if (chats.has(task.chatId)) {
      throw new Error(`Project task chat ${task.chatId} has multiple task identities.`);
    }
    chats.add(task.chatId);
    if (!task.parentTaskId) {
      if (task.depth !== 0) {
        throw new Error(`Project root task ${task.id} has invalid depth.`);
      }
      continue;
    }
    const parent = tasks.get(task.parentTaskId);
    if (!parent) {
      throw new Error(`Project task ${task.id} has a missing parent.`);
    }
    if (task.depth !== parent.depth + 1) {
      throw new Error(`Project task ${task.id} has invalid depth.`);
    }
    const seen = new Set([task.id]);
    let root = parent;
    while (root.parentTaskId) {
      if (seen.has(root.id)) {
        throw new Error(`Project task ${task.id} has cyclic ancestry.`);
      }
      seen.add(root.id);
      const ancestor = tasks.get(root.parentTaskId);
      if (!ancestor) {
        throw new Error(`Project task ${task.id} has a missing ancestor.`);
      }
      root = ancestor;
    }
    if (seen.has(root.id)) {
      throw new Error(`Project task ${task.id} has cyclic ancestry.`);
    }
    lineage.push({
      chatId: task.chatId,
      taskLineage: {
        taskId: task.id,
        parentTaskId: parent.id,
        parentChatId: parent.chatId,
        rootChatId: root.chatId,
      },
    });
  }
  return lineage;
};
