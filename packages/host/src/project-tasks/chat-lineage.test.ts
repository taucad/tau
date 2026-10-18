import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { NodeFsProviderClient } from '@taucad/filesystem/backend';
import type { ProjectTask, ProjectTaskChatLineage } from '@taucad/agent-host/wire';
import { materializeProjectTaskLineage } from '#project-tasks/chat-lineage.js';

const entry: ProjectTaskChatLineage = {
  chatId: 'child-chat',
  taskLineage: {
    taskId: 'child',
    parentTaskId: 'root',
    parentChatId: 'root-chat',
    rootChatId: 'root-chat',
  },
};
const task: ProjectTask = {
  id: 'child',
  projectId: 'project',
  chatId: 'child-chat',
  parentTaskId: 'root',
  depth: 1,
  title: 'Child title',
  prompt: 'Work',
  provider: { id: 'codex' },
  createdAt: 10,
  closed: false,
  attempts: [
    {
      id: 'attempt',
      number: 1,
      status: 'allocating',
      source: { revisionId: 'base', checkoutId: 'base' },
      toolGrant: { toolChoice: 'none' },
      createdAt: 10,
    },
  ],
};

describe('child chat lineage materializer', () => {
  it('creates missing metadata with a checked write before launch', async () => {
    const filesystem = mock<NodeFsProviderClient>();
    filesystem.exists.mockResolvedValue(false);
    filesystem.writeFileChecked.mockResolvedValue({ status: 'applied', content: new Uint8Array() });
    await materializeProjectTaskLineage(filesystem, entry, task);
    const write = filesystem.writeFileChecked.mock.calls[0]?.[0];
    expect(write?.path).toBe('.tau/chats/child-chat/chat.json');
    expect(write?.preconditions).toEqual([{ path: write?.path, expected: null }]);
    expect(JSON.parse(String(write?.data))).toMatchObject({
      id: 'child-chat',
      resourceId: 'project',
      name: 'Child title',
      taskLineage: entry.taskLineage,
    });
  });

  it('re-reads after a concurrent rename and preserves forward fields and tombstones', async () => {
    const filesystem = mock<NodeFsProviderClient>();
    const before = new TextEncoder().encode(
      JSON.stringify({
        id: 'child-chat',
        resourceId: 'project',
        name: 'Old',
        createdAt: 1,
        updatedAt: 2,
        future: 'kept',
        deletedAt: 3,
      }),
    );
    const renamed = new TextEncoder().encode(
      JSON.stringify({
        id: 'child-chat',
        resourceId: 'project',
        name: 'Renamed',
        createdAt: 1,
        updatedAt: 4,
        future: 'kept',
        deletedAt: 3,
      }),
    );
    filesystem.exists.mockResolvedValue(true);
    // The mocked overload narrows to the encoded read; runtime bytes exercise the default binary overload.
    filesystem.readFile
      .mockResolvedValueOnce(before as unknown as string)
      .mockResolvedValueOnce(renamed as unknown as string);
    filesystem.writeFileChecked
      .mockResolvedValueOnce({ status: 'conflict', conflicts: [] })
      .mockResolvedValueOnce({ status: 'applied', content: new Uint8Array() });
    await materializeProjectTaskLineage(filesystem, entry, task);
    const write = filesystem.writeFileChecked.mock.calls[1]?.[0];
    expect(write?.preconditions).toEqual([{ path: write?.path, expected: renamed }]);
    expect(JSON.parse(String(write?.data))).toMatchObject({
      name: 'Renamed',
      updatedAt: 4,
      future: 'kept',
      deletedAt: 3,
      taskLineage: entry.taskLineage,
    });
  });

  it('refuses established conflicting lineage', async () => {
    const filesystem = mock<NodeFsProviderClient>();
    filesystem.exists.mockResolvedValue(true);
    filesystem.readFile.mockResolvedValue(
      new TextEncoder().encode(
        JSON.stringify({
          id: 'child-chat',
          resourceId: 'project',
          name: 'Child',
          createdAt: 1,
          updatedAt: 1,
          taskLineage: { ...entry.taskLineage, rootChatId: 'other-root' },
        }),
      ) as unknown as string,
    );
    await expect(materializeProjectTaskLineage(filesystem, entry, task)).rejects.toMatchObject({
      code: 'TASK_STORAGE_INVALID',
    });
    expect(filesystem.writeFileChecked).not.toHaveBeenCalled();
  });
});
