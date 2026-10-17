import { describe, expect, it } from 'vitest';
import type { ChatRecord } from '@taucad/chat/schemas';
import { resolveThreadRoute } from '#routes/w.$workspace.$project/thread-route.js';

const child: ChatRecord = {
  id: 'child',
  resourceId: 'project',
  name: 'Child',
  createdAt: 1,
  updatedAt: 1,
  taskLineage: { taskId: 'task-child', parentTaskId: 'task-parent', parentChatId: 'parent', rootChatId: 'root' },
};

describe('Thread URLs', () => {
  it('should route even a grandchild directly to its recorded root', () => {
    expect(resolveThreadRoute('child', [child])).toEqual({ rootChatId: 'root', taskId: 'task-child' });
  });
  it('should preserve ordinary root chat URLs and an unspecified chat', () => {
    expect(resolveThreadRoute('ordinary', [child])).toEqual({ rootChatId: 'ordinary' });
    expect(resolveThreadRoute(undefined, [child])).toEqual({ rootChatId: undefined });
  });
});
