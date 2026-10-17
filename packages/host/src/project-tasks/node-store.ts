import { join } from 'node:path';
import { createNodeExclusiveRecordStorage } from '@taucad/agent-host/node';
import { createProjectTaskStore } from '#project-tasks/store.js';
import type { ProjectTaskStore } from '#project-tasks/store.js';

/**
 * Open the project-wide protected sidecar, excluded from authored revision/export views by the chats record family.
 *
 * @param options - Host-owned project root and identity, never model-supplied paths.
 * @returns An exclusively locked durable task ordering authority.
 * @internal
 */
export const createNodeProjectTaskStore = async (
  options: Readonly<{ workspaceRoot: string; projectId: string }>,
): Promise<ProjectTaskStore> => {
  const storage = await createNodeExclusiveRecordStorage({
    filePath: join(options.workspaceRoot, '.tau', 'chats', '.project-tasks', 'records.jsonl'),
  });
  return createProjectTaskStore({ projectId: options.projectId, storage });
};
