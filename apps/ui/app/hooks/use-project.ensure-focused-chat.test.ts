import { describe, it, expect, vi } from 'vitest';
import type { Chat } from '@taucad/chat';
import type { StorageProvider } from '#types/storage.types.js';
import { ensureFocusedChatForProject } from '#hooks/use-project.js';

const makeChat = (overrides: Partial<Chat> & { id: string }): Chat => ({
  resourceId: 'project_test',
  name: 'New chat',
  messages: [],
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

describe('ensureFocusedChatForProject', () => {
  it('should create a missing empty chat without bumping parent project recency', async () => {
    const touchProject = vi.fn<StorageProvider['touchProject']>();
    const getChatsForResource = vi.fn<StorageProvider['getChatsForResource']>().mockResolvedValue([]);
    const createNavigationRepairChat = vi.fn<StorageProvider['createNavigationRepairChat']>().mockResolvedValue(
      makeChat({
        id: 'chat_created',
        resourceId: 'project_test',
      }),
    );
    const onCreatedChat = vi.fn();
    const worker = {
      getChatsForResource,
      createNavigationRepairChat,
      touchProject,
    };

    const result = await ensureFocusedChatForProject({
      projectId: 'project_test',
      candidateFocusedChatId: undefined,
      worker,
      onCreatedChat,
    });

    expect(result).toEqual({ type: 'focusedChatEnsured', focusedChatId: 'chat_created' });
    expect(createNavigationRepairChat).toHaveBeenCalledWith('project_test');
    expect(touchProject).not.toHaveBeenCalled();
    expect(onCreatedChat).toHaveBeenCalledOnce();
  });

  it('should prefer an existing focused chat without creating a navigation repair chat', async () => {
    const existing = makeChat({ id: 'chat_existing' });
    const getChatsForResource = vi.fn<StorageProvider['getChatsForResource']>().mockResolvedValue([existing]);
    const createNavigationRepairChat = vi.fn<StorageProvider['createNavigationRepairChat']>();

    const result = await ensureFocusedChatForProject({
      projectId: 'project_test',
      candidateFocusedChatId: 'chat_existing',
      worker: {
        getChatsForResource,
        createNavigationRepairChat,
      },
    });

    expect(result).toEqual({ type: 'focusedChatEnsured', focusedChatId: 'chat_existing' });
    expect(createNavigationRepairChat).not.toHaveBeenCalled();
  });
});
