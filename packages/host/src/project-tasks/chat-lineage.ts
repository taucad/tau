import { chatRecordFileName, chatRecordsPath } from '@taucad/revisions';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { ProjectTask, ProjectTaskChatLineage } from '@taucad/agent-host/wire';
import { ProjectTaskError } from '#project-tasks/store.js';

const matchesLineage = (actual: unknown, expected: ProjectTaskChatLineage['taskLineage']): boolean =>
  typeof actual === 'object' &&
  actual !== null &&
  'taskId' in actual &&
  actual.taskId === expected.taskId &&
  'parentTaskId' in actual &&
  actual.parentTaskId === expected.parentTaskId &&
  'parentChatId' in actual &&
  actual.parentChatId === expected.parentChatId &&
  'rootChatId' in actual &&
  actual.rootChatId === expected.rootChatId;

const parseExistingRecord = (
  bytes: Uint8Array<ArrayBuffer>,
  entry: ProjectTaskChatLineage,
  task: ProjectTask,
): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !('id' in parsed) ||
      parsed.id !== entry.chatId ||
      !('resourceId' in parsed) ||
      parsed.resourceId !== task.projectId ||
      !('name' in parsed) ||
      typeof parsed.name !== 'string' ||
      !('createdAt' in parsed) ||
      typeof parsed.createdAt !== 'number' ||
      !('updatedAt' in parsed) ||
      typeof parsed.updatedAt !== 'number'
    ) {
      throw new Error('Record identity or required metadata does not match.');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new ProjectTaskError('TASK_STORAGE_INVALID', `Child chat metadata is invalid: ${String(error)}`);
  }
};

/**
 * Materialize rebuildable child navigation metadata before its first log can be discovered.
 * Checked writes preserve concurrent renames, tombstones and forward fields.
 *
 * @internal
 * @param filesystem - Workspace-rooted filesystem authority.
 * @param entry - Lineage derived from the validated durable task graph.
 * @param task - Durable child task for initial metadata fields.
 */
export const materializeProjectTaskLineage = async (
  filesystem: Required<Pick<FileSystemProvider, 'exists' | 'readFile' | 'writeFileChecked'>>,
  entry: ProjectTaskChatLineage,
  task: ProjectTask,
): Promise<void> => {
  const path = `${chatRecordsPath(entry.chatId)}/${chatRecordFileName}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- A checked conflict requires a fresh source read.
    const previous = (await filesystem.exists(path)) ? await filesystem.readFile(path) : null;
    let record: Record<string, unknown>;
    if (previous === null) {
      record = {
        id: entry.chatId,
        resourceId: task.projectId,
        name: task.title,
        createdAt: task.createdAt,
        updatedAt: task.createdAt,
      };
    } else {
      record = parseExistingRecord(previous, entry, task);
    }
    if (record['taskLineage'] !== undefined) {
      if (!matchesLineage(record['taskLineage'], entry.taskLineage)) {
        throw new ProjectTaskError('TASK_STORAGE_INVALID', 'Child chat lineage conflicts with the task journal.');
      }
      return;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- CAS protects metadata from concurrent rename or deletion.
    const result = await filesystem.writeFileChecked({
      path,
      data: `${JSON.stringify({ ...record, taskLineage: entry.taskLineage }, undefined, 2)}\n`,
      preconditions: [{ path, expected: previous }],
    });
    if (result.status !== 'conflict') {
      return;
    }
  }
  throw new ProjectTaskError('TASK_BUSY', 'Child chat metadata kept changing; retry the task request.');
};
