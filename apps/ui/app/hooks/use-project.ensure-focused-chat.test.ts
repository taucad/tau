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
    };

    const result = await ensureFocusedChatForProject({
      projectId: 'project_test',
      requestedChatId: undefined,
      persistedChatId: undefined,
      worker,
      onCreatedChat,
    });

    expect(result).toEqual({ type: 'focusedChatEnsured', focusedChatId: 'chat_created' });
    expect(createNavigationRepairChat).toHaveBeenCalledWith('project_test');
    expect(onCreatedChat).toHaveBeenCalledOnce();
  });

  it('prefers a valid requested chat over the persisted selection', async () => {
    const requested = makeChat({ id: 'chat_requested' });
    const persisted = makeChat({ id: 'chat_persisted' });
    const getChatsForResource = vi
      .fn<StorageProvider['getChatsForResource']>()
      .mockResolvedValue([persisted, requested]);
    const createNavigationRepairChat = vi.fn<StorageProvider['createNavigationRepairChat']>();

    const result = await ensureFocusedChatForProject({
      projectId: 'project_test',
      requestedChatId: 'chat_requested',
      persistedChatId: 'chat_persisted',
      worker: {
        getChatsForResource,
        createNavigationRepairChat,
      },
    });

    expect(result).toEqual({ type: 'focusedChatEnsured', focusedChatId: 'chat_requested' });
    expect(createNavigationRepairChat).not.toHaveBeenCalled();
  });

  it.each(['chat_foreign', 'chat_deleted'])('falls back from invalid requested %s to persisted chat', async (id) => {
    const persisted = makeChat({ id: 'chat_persisted' });

    const result = await ensureFocusedChatForProject({
      projectId: 'project_test',
      requestedChatId: id,
      persistedChatId: persisted.id,
      worker: {
        getChatsForResource: vi.fn<StorageProvider['getChatsForResource']>().mockResolvedValue([persisted]),
        createNavigationRepairChat: vi.fn<StorageProvider['createNavigationRepairChat']>(),
      },
    });

    expect(result.focusedChatId).toBe('chat_persisted');
  });

  it('uses deterministic recency ordering when neither requested nor persisted chat is valid', async () => {
    const chats = [
      makeChat({ id: 'chat_z', createdAt: 2000, updatedAt: 9000, recencyAt: 3000 }),
      makeChat({ id: 'chat_b', createdAt: 2500, updatedAt: 3000, recencyAt: 3000 }),
      makeChat({ id: 'chat_a', createdAt: 2500, updatedAt: 3000, recencyAt: 3000 }),
      makeChat({ id: 'chat_newer_activity', createdAt: 1000, updatedAt: 1000, recencyAt: 4000 }),
    ];

    const newestActivity = await ensureFocusedChatForProject({
      projectId: 'project_test',
      requestedChatId: 'chat_missing',
      persistedChatId: 'chat_stale',
      worker: {
        getChatsForResource: vi.fn<StorageProvider['getChatsForResource']>().mockResolvedValue(chats),
        createNavigationRepairChat: vi.fn<StorageProvider['createNavigationRepairChat']>(),
      },
    });
    const deterministicTie = await ensureFocusedChatForProject({
      projectId: 'project_test',
      requestedChatId: undefined,
      persistedChatId: undefined,
      worker: {
        getChatsForResource: vi.fn<StorageProvider['getChatsForResource']>().mockResolvedValue(chats.slice(0, 3)),
        createNavigationRepairChat: vi.fn<StorageProvider['createNavigationRepairChat']>(),
      },
    });

    expect(newestActivity.focusedChatId).toBe('chat_newer_activity');
    expect(deterministicTie.focusedChatId).toBe('chat_a');
  });
});
