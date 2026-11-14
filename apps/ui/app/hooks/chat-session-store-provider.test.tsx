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
  watchRecordFile: vi.fn(() => ({
    ready: Promise.resolve(),
    closed: Promise.withResolvers<void>().promise,
    dispose: () => undefined,
  })),
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

/* Since A3b the library builds its chat store over the binding's record client: here it is the harness's double. */
vi.mock('#db/chat-file-storage.js', () => ({
  createChatFileStore: () => ({
    ...harness.projectManager,
    adoptLegacyChatPlacement: async () => undefined,
    getChatRecordsForResource: async () => [],
  }),
}));

/* A read owner that admits every read at once: no observation runs while the file managers are idle. */
vi.mock('#runtime/project-library-observations.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createMetadataReadOwner: (source: unknown) => ({
    connect: () => () => undefined,
    hold: () => undefined,
    ready: () => undefined,
    fail: () => undefined,
    read: async <Value,>(operation: (store: unknown) => Promise<Value>) => operation(source),
    settle: async () => undefined,
  }),
}));

const { ChatSessionStore } = await import('#services/chat-session-store.js');
const { ChatSessionStoreProvider, useChatSessionStore } = await import('#hooks/chat-session-store-provider.js');
const { AppRuntimeProvider } = await import('#runtime/app-runtime-provider.js');
const { createAppRuntime, selectRuntimeChatSessions, selectRuntimeProjectLibrary } =
  await import('#runtime/app-runtime.js');

type Runtime = ReturnType<typeof createAppRuntime>;
type Binding = Parameters<ReturnType<typeof selectRuntimeProjectLibrary>['bind']>[0];

const notCalled = async (): Promise<never> => {
  throw new Error('not called in this test');
};

/** The provider's binding as `ProjectManagerProvider` supplies it: the root file facade, over the harness's doubles. */
const bindingOf = (client: Record<string, unknown> = harness.client): Binding => ({
  fileManager: {
    recordFiles: client,
    watchRecordFile: harness.watchRecordFile,
    workspace: { syncProjectRoots: notCalled },
  } as unknown as Binding['fileManager'],
});

let runtime: Runtime;

function createWrapper() {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <AppRuntimeProvider runtime={runtime}>
        <ChatSessionStoreProvider>{children}</ChatSessionStoreProvider>
      </AppRuntimeProvider>
    );
  };
}

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each turn lets one more promise in the chain settle.
    await Promise.resolve();
  }
};

describe('ChatSessionStoreProvider', () => {
  beforeEach(() => {
    harness.projectManager.getChat.mockReset().mockResolvedValue(undefined);
    harness.projectManager.patchChat.mockReset().mockResolvedValue(undefined);
    harness.projectManager.touchChatRecency.mockReset().mockResolvedValue(undefined);
    harness.projectManager.consumeChatStartupRequest.mockReset().mockResolvedValue(undefined);
    harness.projectManager.commitCancelledDraftRestore.mockReset().mockResolvedValue(undefined);
    harness.watchRecordFile.mockClear();
    /* Idle: no file manager connects and no worker starts; the library's ports are what the store calls. */
    runtime = createAppRuntime({ idleFileManagers: true });
  });

  afterEach(() => {
    runtime.stop();
    vi.restoreAllMocks();
  });

  it('throws when useChatSessionStore is called outside the provider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useChatSessionStore())).toThrow(/chatsessionstoreprovider/i);

    consoleErrorSpy.mockRestore();
  });

  it("hands down the runtime's store, the same instance across re-renders", () => {
    const { result, rerender } = renderHook(() => useChatSessionStore(), { wrapper: createWrapper() });
    const first = result.current;
    rerender();
    rerender();

    expect(result.current).toBe(first);
    expect(first).toBeInstanceOf(ChatSessionStore);
    expect(first).toBe(selectRuntimeChatSessions(runtime));
  });

  it('exposes the same store to multiple consumers', () => {
    const captured: Array<InstanceType<typeof ChatSessionStore>> = [];

    function Probe(): ReactNode {
      captured.push(useChatSessionStore());
      return null;
    }

    render(
      <AppRuntimeProvider runtime={runtime}>
        <ChatSessionStoreProvider>
          <Probe />
          <Probe />
          <Probe />
        </ChatSessionStoreProvider>
      </AppRuntimeProvider>,
    );

    expect(captured).toHaveLength(3);
    expect(captured[0]).toBe(captured[1]);
    expect(captured[1]).toBe(captured[2]);
  });

  it('hands down a store a test passes instead of the runtime', () => {
    const store = new ChatSessionStore();
    const { result } = renderHook(() => useChatSessionStore(), {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <ChatSessionStoreProvider store={store}>{children}</ChatSessionStoreProvider>
      ),
    });

    expect(result.current).toBe(store);
  });

  it("calls the library's ports and reads records through its file facade, given at construction (A2)", async () => {
    harness.projectManager.getChat.mockResolvedValue({
      id: 'chat_a',
      resourceId: 'proj_a',
      name: '',
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    });
    selectRuntimeProjectLibrary(runtime).bind(bindingOf());
    const { result } = renderHook(() => useChatSessionStore(), { wrapper: createWrapper() });
    const store = result.current;

    // Acquire a session so a hydration call materialises and we can assert
    // the store invokes the library's ports.
    store.acquire('chat_a', 'proj_a');
    await settle();

    expect(harness.projectManager.getChat).toHaveBeenCalledWith('chat_a', 'proj_a');
    // The chat's composer record is read through the root's record client.
    await vi.waitFor(() => {
      expect(harness.client.readFile).toHaveBeenCalledWith('/.tau/composers/chats/proj_a/chat_a.json');
    });

    await store.touchChatRecency('chat_a', 123);
    expect(harness.projectManager.touchChatRecency).toHaveBeenCalledWith('chat_a', 123);
  });

  it('holds a call the store makes before the library is bound, and delivers it once a binding arrives', async () => {
    const store = selectRuntimeChatSessions(runtime);

    const touched = store.touchChatRecency('chat_a', 7);
    await settle();
    expect(harness.projectManager.touchChatRecency).not.toHaveBeenCalled();

    selectRuntimeProjectLibrary(runtime).bind(bindingOf());
    await touched;

    expect(harness.projectManager.touchChatRecency).toHaveBeenCalledExactlyOnceWith('chat_a', 7);
  });

  it('takes a new record client when the binding replaces the file facade, as a worker replacement does', async () => {
    harness.projectManager.getChat.mockResolvedValue({
      id: 'chat_a',
      resourceId: 'proj_a',
      name: '',
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    });
    const library = selectRuntimeProjectLibrary(runtime);
    library.bind(bindingOf());
    const store = selectRuntimeChatSessions(runtime);
    store.acquire('chat_a', 'proj_a');
    await vi.waitFor(() => {
      expect(harness.client.readFile).toHaveBeenCalled();
    });

    const replaced = { ...harness.client, readFile: vi.fn(harness.client.readFile) };
    library.bind(bindingOf(replaced));
    store.release('chat_a');
    store.acquire('chat_a', 'proj_a');

    await vi.waitFor(() => {
      expect(replaced.readFile).toHaveBeenCalledWith('/.tau/composers/chats/proj_a/chat_a.json');
    });
  });
});
