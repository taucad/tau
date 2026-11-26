// @vitest-environment jsdom
/** A newly focused chat owns its own session and chat-record writes. */
import { expect, it, vi } from 'vitest';
import { errorCategory } from '@taucad/types/constants';
import type { ChatSessionDeps } from '#services/chat-session-store.js';

vi.mock('ai', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- no SDK transport is opened in this test.
  DefaultChatTransport: class {},
}));

vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));

const { ChatSessionStore } = await import('#services/chat-session-store.js');

const emptyClient = (): ChatSessionDeps['client'] => {
  const missing = async (path: string): Promise<never> => {
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  };
  return {
    readFile: missing,
    readdir: missing,
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    unlink: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
  };
};

it('keeps a newly focused chat’s error write on its own chatId', async () => {
  const patchChat = vi.fn().mockResolvedValue(undefined);
  const getChat = vi.fn().mockResolvedValue(undefined);
  const store = new ChatSessionStore();
  store.setDependencies({
    getChat,
    patchChat,
    touchChatRecency: vi.fn().mockResolvedValue(undefined),
    consumeChatStartupRequest: vi.fn().mockResolvedValue(undefined),
    commitCancelledDraftRestore: vi.fn().mockResolvedValue(undefined),
    client: emptyClient(),
  });
  const oldSession = store.acquire('chat_old', 'project_test');
  const newSession = store.acquire('chat_new', 'project_test');
  expect(newSession).not.toBe(oldSession);
  expect(newSession.chatId).toBe('chat_new');
  await vi.waitFor(() => {
    expect(getChat).toHaveBeenCalledWith('chat_old', 'project_test');
    expect(getChat).toHaveBeenCalledWith('chat_new', 'project_test');
    expect(newSession.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
  });

  const error = { category: errorCategory.generic, title: 'Request refused', message: 'Try again.' };
  newSession.persistenceActorRef.send({ type: 'setPersistedError', error });
  await vi.waitFor(() => {
    expect(patchChat).toHaveBeenCalledWith('chat_new', 'error', error);
  });
  expect(patchChat.mock.calls.some(([chatId]) => chatId === 'chat_old')).toBe(false);
  store.release('chat_new');
  store.release('chat_old');
});
