import { describe, it, expect, vi } from 'vitest';
import type { Chat } from '@taucad/chat';
import type { ChatStorage } from '@taucad/files-ui/types/chat-storage.types';
import { QueryClient } from '@tanstack/react-query';
import type { ProjectReadiness, RevisionStatusProjection } from '@taucad/revisions';
import { ensureFocusedChatForProject, isKnownChatId, mayCreateChat } from '#runtime/project-runtime.helpers.js';

const makeChat = (overrides: Partial<Chat> & { id: string }): Chat => ({
  resourceId: 'project_test',
  name: 'New chat',
  messages: [],
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

const cloudStatus = (
  sync: Partial<RevisionStatusProjection['sync']>,
  readiness: ProjectReadiness,
): Pick<RevisionStatusProjection, 'sync' | 'remote' | 'readiness'> =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- only the read fields matter here.
  ({
    remote: { kind: 'tau', phase: 'connected' },
    readiness,
    sync: { state: 'pending', online: true, pendingCount: 0, hasAppliedRemote: false, chats: 'loading', ...sync },
  }) as Pick<RevisionStatusProjection, 'sync' | 'remote' | 'readiness'>;

/* SP2h: a chat may be made once the chats may open, not once the whole apply lands. */
describe('mayCreateChat', () => {
  it('lets a cloud open make a chat once its chats land and its entry closure is readable', () => {
    expect(mayCreateChat(cloudStatus({ pullPhase: 'applying', chats: 'ready' }, 'entryReady'), true, true)).toBe(true);
    expect(mayCreateChat(cloudStatus({ pullPhase: 'applying', chats: 'loading' }, 'entryReady'), true, true)).toBe(
      false,
    );
    expect(mayCreateChat(cloudStatus({ pullPhase: 'applying', chats: 'ready' }, 'treeReady'), true, true)).toBe(false);
    expect(mayCreateChat(cloudStatus({ pullPhase: 'applying', chats: 'ready' }, 'entryReady'), true, false)).toBe(
      false,
    );
    expect(mayCreateChat(cloudStatus({ state: 'queued', chats: 'ready' }, 'entryReady'), true, true)).toBe(false);
  });
  it('asks only for the chats outside a cloud open, and nothing of a project with no Tau remote', () => {
    expect(mayCreateChat(cloudStatus({ chats: 'ready' }, 'connected'), false, true)).toBe(true);
    expect(mayCreateChat(cloudStatus({ chats: 'loading' }, 'filled'), false, true)).toBe(false);
    /* Chat sync off: no history is coming, so a chat may be made at once, during an open or after it. */
    expect(mayCreateChat(cloudStatus({ chats: 'disabled' }, 'connected'), false, true)).toBe(true);
    expect(mayCreateChat(cloudStatus({ pullPhase: 'applying', chats: 'disabled' }, 'entryReady'), true, true)).toBe(
      true,
    );
    expect(mayCreateChat(undefined, false, true)).toBe(true);
  });
});

describe('ensureFocusedChatForProject', () => {
  it('does not repair an empty chat list until cloud discovery authorizes creation', async () => {
    const createNavigationRepairChat = vi.fn<ChatStorage['createNavigationRepairChat']>();
    const result = await ensureFocusedChatForProject({
      projectId: 'project_test',
      requestedChatId: undefined,
      persistedChatId: undefined,
      worker: { getChatRecordsForResource: async () => [], createNavigationRepairChat },
      canCreateChat: () => false,
    });
    expect(result).toEqual({ type: 'focusedChatDeferred' });
    expect(createNavigationRepairChat).not.toHaveBeenCalled();
  });

  it('should create a missing empty chat without bumping parent project recency', async () => {
    const getChatRecordsForResource = vi.fn<ChatStorage['getChatRecordsForResource']>().mockResolvedValue([]);
    const createNavigationRepairChat = vi.fn<ChatStorage['createNavigationRepairChat']>().mockResolvedValue(
      makeChat({
        id: 'chat_created',
        resourceId: 'project_test',
      }),
    );
    const onCreatedChat = vi.fn();
    const worker = {
      getChatRecordsForResource,
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

  it('hands the chat it created empty to its caller, which tells the chat store (A12, I21)', async () => {
    const onCreatedChat = vi.fn<(chatId: string) => void>();
    await ensureFocusedChatForProject({
      projectId: 'project_test',
      requestedChatId: undefined,
      persistedChatId: undefined,
      worker: {
        getChatRecordsForResource: async () => [],
        createNavigationRepairChat: async () => makeChat({ id: 'chat_repaired' }),
      },
      onCreatedChat,
    });
    expect(onCreatedChat).toHaveBeenCalledWith('chat_repaired');
  });

  it('prefers a valid requested chat over the persisted selection', async () => {
    const requested = makeChat({ id: 'chat_requested' });
    const persisted = makeChat({ id: 'chat_persisted' });
    const getChatRecordsForResource = vi
      .fn<ChatStorage['getChatRecordsForResource']>()
      .mockResolvedValue([persisted, requested]);
    const createNavigationRepairChat = vi.fn<ChatStorage['createNavigationRepairChat']>();

    const result = await ensureFocusedChatForProject({
      projectId: 'project_test',
      requestedChatId: 'chat_requested',
      persistedChatId: 'chat_persisted',
      worker: {
        getChatRecordsForResource,
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
        getChatRecordsForResource: vi.fn<ChatStorage['getChatRecordsForResource']>().mockResolvedValue([persisted]),
        createNavigationRepairChat: vi.fn<ChatStorage['createNavigationRepairChat']>(),
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
        getChatRecordsForResource: vi.fn<ChatStorage['getChatRecordsForResource']>().mockResolvedValue(chats),
        createNavigationRepairChat: vi.fn<ChatStorage['createNavigationRepairChat']>(),
      },
    });
    const deterministicTie = await ensureFocusedChatForProject({
      projectId: 'project_test',
      requestedChatId: undefined,
      persistedChatId: undefined,
      worker: {
        getChatRecordsForResource: vi
          .fn<ChatStorage['getChatRecordsForResource']>()
          .mockResolvedValue(chats.slice(0, 3)),
        createNavigationRepairChat: vi.fn<ChatStorage['createNavigationRepairChat']>(),
      },
    });

    expect(newestActivity.focusedChatId).toBe('chat_newer_activity');
    expect(deterministicTie.focusedChatId).toBe('chat_a');
  });
});

/* Focusing a chat the client already holds must skip the ensure round trip —
 * that round trip is what flashed the chat pane skeleton on every switch. */
describe('isKnownChatId', () => {
  const knownChat = makeChat({ id: 'chat_listed' });

  const clientWithChats = (chats: Chat[]): QueryClient => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['chats', 'project_test', { includeDeleted: false }], chats);
    return queryClient;
  };

  it('should recognise a chat present in a current visible list for the project', () => {
    const queryClient = clientWithChats([knownChat]);

    expect(
      isKnownChatId({ chatId: 'chat_listed', createdChatId: undefined, projectId: 'project_test', queryClient }),
    ).toBe(true);
  });

  it('recognises metadata lists while refusing deleted-only and invalidated lists', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['chats', 'project_test', 'records', { includeDeleted: false }], [knownChat]);
    expect(
      isKnownChatId({ chatId: knownChat.id, createdChatId: undefined, projectId: 'project_test', queryClient }),
    ).toBe(true);

    await queryClient.invalidateQueries({ queryKey: ['chats', 'project_test'] });
    expect(
      isKnownChatId({ chatId: knownChat.id, createdChatId: undefined, projectId: 'project_test', queryClient }),
    ).toBe(false);

    queryClient.setQueryData(['chats', 'project_test', 'records', { includeDeleted: true }], [knownChat]);
    expect(
      isKnownChatId({ chatId: knownChat.id, createdChatId: undefined, projectId: 'project_test', queryClient }),
    ).toBe(false);
  });

  it('should recognise the chat this render just created', () => {
    const queryClient = clientWithChats([]);

    expect(
      isKnownChatId({ chatId: 'chat_created', createdChatId: 'chat_created', projectId: 'project_test', queryClient }),
    ).toBe(true);
  });

  it('should reject an unlisted chat and a chat cached under another project', () => {
    const queryClient = clientWithChats([knownChat]);

    expect(
      isKnownChatId({ chatId: 'chat_unknown', createdChatId: undefined, projectId: 'project_test', queryClient }),
    ).toBe(false);
    expect(
      isKnownChatId({ chatId: 'chat_listed', createdChatId: undefined, projectId: 'project_other', queryClient }),
    ).toBe(false);
  });
});
