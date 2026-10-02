// @vitest-environment jsdom
/** A newly focused chat owns its own session and chat-record writes. */
import { expect, it, vi } from 'vitest';
import { errorCategory } from '@taucad/types/constants';
import type { ChatSessionDeps } from '#services/chat-session-store.js';

vi.mock('@ai-sdk/react', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- the store requires the SDK's newable Chat.
  Chat: class {
    public id: string;
    public messages = [];
    public status = 'ready';
    public error = undefined;
    public sendMessage = vi.fn(async () => undefined);
    public regenerate = vi.fn(async () => undefined);
    public stop = vi.fn(async () => undefined);

    public constructor({ id }: { readonly id: string }) {
      this.id = id;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the SDK's callback hook exactly.
    public '~registerMessagesCallback' = (): (() => void) => () => undefined;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the SDK's callback hook exactly.
    public '~registerStatusCallback' = (): (() => void) => () => undefined;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the SDK's callback hook exactly.
    public '~registerErrorCallback' = (): (() => void) => () => undefined;
  },
}));

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
  expect(newSession.chat).not.toBe(oldSession.chat);
  expect(newSession.chat.id).toBe('chat_new');
  await vi.waitFor(() => {
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
