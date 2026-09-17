// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat class uses the SDK's own `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

const harness = vi.hoisted(() => ({
  projectManager: {
    getChat: vi.fn().mockResolvedValue(undefined),
    patchChat: vi.fn().mockResolvedValue(undefined),
    touchChatRecency: vi.fn().mockResolvedValue(undefined),
    consumeChatStartupRequest: vi.fn().mockResolvedValue(undefined),
    commitCancelledDraftRestore: vi.fn().mockResolvedValue(undefined),
  },
  client: {
    readFile: vi.fn(async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    }),
    writeFile: vi.fn(async () => undefined),
    exists: vi.fn(async () => false),
    readdir: vi.fn(async () => []),
    unlink: vi.fn(async () => undefined),
    rmdir: vi.fn(async () => undefined),
  },
}));

vi.mock('@ai-sdk/react', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  Chat: class {
    public id = '';
    public messages = [];
    public status = 'ready';
    public error = undefined;
    public sendMessage = vi.fn();
    public regenerate = vi.fn();
    public stop = vi.fn();
    public '~registerMessagesCallback' = (): (() => void) => {
      return () => undefined;
    };

    public '~registerStatusCallback' = (): (() => void) => {
      return () => undefined;
    };

    public '~registerErrorCallback' = (): (() => void) => {
      return () => undefined;
    };
  },
}));

vi.mock('ai', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  DefaultChatTransport: class {},
  lastAssistantMessageIsCompleteWithApprovalResponses: vi.fn(() => false),
}));

vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: 'http://test.local' },
}));

vi.mock('#machines/inspector.js', () => ({
  inspect: undefined,
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => harness.projectManager,
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ client: harness.client }),
}));

const { ChatSessionStore } = await import('#services/chat-session-store.js');
const { ChatSessionStoreProvider, useChatSessionStore } = await import('#hooks/chat-session-store-provider.js');

function createWrapper() {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <ChatSessionStoreProvider>{children}</ChatSessionStoreProvider>;
  };
}

describe('ChatSessionStoreProvider', () => {
  beforeEach(() => {
    harness.projectManager.getChat.mockReset().mockResolvedValue(undefined);
    harness.projectManager.patchChat.mockReset().mockResolvedValue(undefined);
    harness.projectManager.touchChatRecency.mockReset().mockResolvedValue(undefined);
    harness.projectManager.consumeChatStartupRequest.mockReset().mockResolvedValue(undefined);
    harness.projectManager.commitCancelledDraftRestore.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when useChatSessionStore is called outside the provider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useChatSessionStore())).toThrow(/chatsessionstoreprovider/i);

    consoleErrorSpy.mockRestore();
  });

  it('returns a stable ChatSessionStore instance across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatSessionStore(), { wrapper: createWrapper() });
    const first = result.current;
    rerender();
    rerender();

    expect(result.current).toBe(first);
    expect(first).toBeInstanceOf(ChatSessionStore);
  });

  it('exposes the same store to multiple consumers', () => {
    const captured: Array<InstanceType<typeof ChatSessionStore>> = [];

    function Probe(): ReactNode {
      captured.push(useChatSessionStore());
      return null;
    }

    render(
      <ChatSessionStoreProvider>
        <Probe />
        <Probe />
        <Probe />
      </ChatSessionStoreProvider>,
    );

    expect(captured).toHaveLength(3);
    expect(captured[0]).toBe(captured[1]);
    expect(captured[1]).toBe(captured[2]);
  });

  it('mirrors useProjectManager() closures and the file client into the store via setDependencies', async () => {
    harness.projectManager.getChat.mockResolvedValue({
      id: 'chat_a',
      resourceId: 'proj_a',
      name: '',
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    });
    const { result } = renderHook(() => useChatSessionStore(), { wrapper: createWrapper() });
    const store = result.current;

    // Acquire a session so a hydration call materialises and we can assert
    // the store invokes the latest mocked closures.
    store.acquire('chat_a');

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.projectManager.getChat).toHaveBeenCalledWith('chat_a');
    // The chat's composer record is read through the file manager's client.
    await vi.waitFor(() => {
      expect(harness.client.readFile).toHaveBeenCalledWith('/.tau/composers/chats/proj_a/chat_a.json');
    });

    await store.touchChatRecency('chat_a', 123);
    expect(harness.projectManager.touchChatRecency).toHaveBeenCalledWith('chat_a', 123);
  });
});
