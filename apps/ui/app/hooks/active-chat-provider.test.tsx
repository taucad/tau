// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat class uses the SDK's own `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
/* eslint-disable @typescript-eslint/explicit-member-accessibility -- mock class constructor omits the `public` keyword to mirror the AI SDK's published shape. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Chat, MyUIMessage } from '@taucad/chat';
import { resolveKernel } from '@taucad/types/constants';
import { fromSafeAsync } from '#lib/xstate.lib.js';

// ---------------------------------------------------------------------------
// Hoisted harness — mocks the project-manager surface (chat row persistence),
// the AI SDK `Chat` class (with subscriber-callback emit helpers so tests
// can drive `useChatSessionSnapshot` re-renders), the cookie hooks
// (`useModels` / `useKernel`) for stable strategy-helper input, and the
// resize actor for the image-resize toast subscriber assertions.
// ---------------------------------------------------------------------------

type FakeChat = {
  id: string;
  messages: MyUIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  error: Error | undefined;
  emitMessagesChange: () => void;
  emitStatusChange: () => void;
  emitErrorChange: () => void;
};

const harness = vi.hoisted(() => ({
  created: [] as FakeChat[],
  patchChat: vi.fn(),
  setMessageEdit: vi.fn(),
  clearMessageEdit: vi.fn(),
  getChat: vi.fn(),
  toastError: vi.fn(),
  resize: vi.fn<(image: string) => Promise<string>>(),
  setSelectedModelId: vi.fn(),
  selectedModelId: 'cookie-model',
  selectedModelName: 'Cookie Model',
  setKernel: vi.fn(),
  cookieKernel: 'openscad' as 'openscad' | 'manifold' | 'replicad',
}));

vi.mock('@ai-sdk/react', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  Chat: class {
    public id: string;
    public messages: MyUIMessage[] = [];
    public status: 'submitted' | 'streaming' | 'ready' | 'error' = 'ready';
    public error: Error | undefined = undefined;
    public sendMessage = vi.fn().mockResolvedValue(undefined);
    public regenerate = vi.fn().mockResolvedValue(undefined);
    public stop = vi.fn().mockResolvedValue(undefined);
    readonly #messagesListeners = new Set<() => void>();
    readonly #statusListeners = new Set<() => void>();
    readonly #errorListeners = new Set<() => void>();

    constructor(init: { id: string; messages?: MyUIMessage[] }) {
      this.id = init.id;
      this.messages = init.messages ?? [];
      const fake: FakeChat = Object.assign(this, {
        emitMessagesChange: () => {
          for (const l of this.#messagesListeners) {
            l();
          }
        },
        emitStatusChange: () => {
          for (const l of this.#statusListeners) {
            l();
          }
        },
        emitErrorChange: () => {
          for (const l of this.#errorListeners) {
            l();
          }
        },
      });
      harness.created.push(fake);
    }

    public '~registerMessagesCallback' = (onChange: () => void): (() => void) => {
      this.#messagesListeners.add(onChange);
      return () => {
        this.#messagesListeners.delete(onChange);
      };
    };

    public '~registerStatusCallback' = (onChange: () => void): (() => void) => {
      this.#statusListeners.add(onChange);
      return () => {
        this.#statusListeners.delete(onChange);
      };
    };

    public '~registerErrorCallback' = (onChange: () => void): (() => void) => {
      this.#errorListeners.add(onChange);
      return () => {
        this.#errorListeners.delete(onChange);
      };
    };
  },
}));

vi.mock('ai', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  DefaultChatTransport: class {},
}));

vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: 'http://test.local' },
}));

vi.mock('#machines/inspector.js', () => ({
  inspect: undefined,
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    patchChat: harness.patchChat,
    setMessageEdit: harness.setMessageEdit,
    clearMessageEdit: harness.clearMessageEdit,
    getChat: harness.getChat,
  }),
}));

vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    error: harness.toastError,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('#hooks/resize-image.actor.js', () => ({
  resizeImageActor: fromSafeAsync<{ type: 'imageResized'; resized: string }, { image: string }>(async ({ input }) => {
    const resized = await harness.resize(input.image);
    return { type: 'imageResized', resized };
  }),
}));

// Mirror the real `useModels` shape with referentially-stable returns so
// strategy-helper `useMemo` dependencies behave the same in tests as in
// production. Without this, the strategy hooks would synthesise a fresh
// `model` object on every render and the stability tests would fail.
const resolvedModelCache = new Map<string, unknown>();
function stableResolvedModel(id: string, name: string): unknown {
  const key = `${id}|${name}`;
  let cached = resolvedModelCache.get(key);
  if (!cached) {
    cached = {
      id,
      name,
      family: 'unknown',
      provider: { id: 'unknown', name: 'Unknown' },
      isResolved: true,
    };
    resolvedModelCache.set(key, cached);
  }
  return cached;
}
const stableResolveModel = (id: string): unknown =>
  stableResolvedModel(id, id === harness.selectedModelId ? harness.selectedModelName : id);
const useModelsReturnCache = new Map<string, unknown>();
function getStableUseModelsReturn(): unknown {
  const key = `${harness.selectedModelId}|${harness.selectedModelName}`;
  let cached = useModelsReturnCache.get(key);
  if (!cached) {
    cached = {
      selectedModelId: harness.selectedModelId,
      setSelectedModelId: harness.setSelectedModelId,
      selectedModel: stableResolvedModel(harness.selectedModelId, harness.selectedModelName),
      resolveModel: stableResolveModel,
      data: [],
      isLoading: false,
    };
    useModelsReturnCache.set(key, cached);
  }
  return cached;
}
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => getStableUseModelsReturn(),
}));

vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({
    kernel: harness.cookieKernel,
    setKernel: harness.setKernel,
    selectedKernel: resolveKernel(harness.cookieKernel),
  }),
}));

const { ActiveChatProvider, ChatComposerProvider, useActiveChatSession, useChatComposer } =
  await import('#hooks/active-chat-provider.js');
const { ChatSessionStoreProvider } = await import('#hooks/chat-session-store-provider.js');

function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'chat_homepage_main',
    resourceId: 'home',
    name: '',
    messages: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function createSessionWrapper(chatId: string) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ChatSessionStoreProvider>
        <ActiveChatProvider chatId={chatId}>{children}</ActiveChatProvider>
      </ChatSessionStoreProvider>
    );
  };
}

function createComposerWrapper() {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ChatSessionStoreProvider>
        <ChatComposerProvider>{children}</ChatComposerProvider>
      </ChatSessionStoreProvider>
    );
  };
}

beforeEach(() => {
  harness.created = [];
  harness.patchChat.mockReset().mockResolvedValue(undefined);
  harness.setMessageEdit.mockReset().mockResolvedValue(undefined);
  harness.clearMessageEdit.mockReset().mockResolvedValue(undefined);
  harness.getChat.mockReset().mockResolvedValue(undefined);
  harness.toastError.mockReset();
  harness.resize.mockReset().mockImplementation(async (image: string) => image);
  harness.setSelectedModelId.mockReset();
  harness.selectedModelId = 'cookie-model';
  harness.selectedModelName = 'Cookie Model';
  harness.setKernel.mockReset();
  harness.cookieKernel = 'openscad';
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ===========================================================================
// ChatComposerProvider — composer-only contract
// ===========================================================================
describe('ChatComposerProvider', () => {
  it('should expose a draftActorRef via useChatComposer', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.draftActorRef).toBeDefined();
  });

  it('should populate status as constant `ready` (no session to stream)', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.status).toBe('ready');
  });

  it('should expose a no-op `stop` callback that does not throw', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(typeof result.current.stop).toBe('function');
    expect(() => {
      result.current.stop();
    }).not.toThrow();
  });

  it('should keep the `stop` callback referentially stable across rerenders', () => {
    const { result, rerender } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    const first = result.current.stop;
    rerender();
    expect(result.current.stop).toBe(first);
  });

  it('should report contextUsage as undefined (no message history)', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.contextUsage).toBeUndefined();
  });

  it('should report session as undefined', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.session).toBeUndefined();
  });

  it('should expose the cookie-resolved model', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.model.modelId).toBe('cookie-model');
    expect(result.current.model.model.id).toBe('cookie-model');
  });

  it('should expose the cookie-resolved kernel', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.kernel.kernelId).toBe('openscad');
    expect(result.current.kernel.kernel.id).toBe('openscad');
  });

  it('should write only the cookie when setActiveModel is called (no chat row to patch)', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    act(() => {
      result.current.model.setActiveModel('new-model');
    });

    expect(harness.setSelectedModelId).toHaveBeenCalledWith('new-model');
    expect(harness.patchChat).not.toHaveBeenCalled();
  });

  it('should write only the cookie when setActiveKernel is called', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    act(() => {
      result.current.kernel.setActiveKernel('manifold');
    });

    expect(harness.setKernel).toHaveBeenCalledWith('manifold');
    expect(harness.patchChat).not.toHaveBeenCalled();
  });

  it('should NOT invoke getChat (no session acquisition)', async () => {
    renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(harness.getChat).not.toHaveBeenCalled();
  });

  it('should NOT persist the draft when no chat session is bound (ephemeral mode)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    act(() => {
      result.current.draftActorRef.send({ type: 'setDraftText', text: 'hello ephemeral' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(harness.patchChat).not.toHaveBeenCalled();
  });

  it('should throw with a descriptive message when useChatComposer is used outside both providers', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useChatComposer())).toThrow(/composer/i);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('should throw when useActiveChatSession is used under ChatComposerProvider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useActiveChatSession(), { wrapper: createComposerWrapper() })).toThrow(
        /activechatprovider/i,
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  describe('imageResizeFailed toast subscriber', () => {
    it('should emit toast.error when the draft actor emits imageResizeFailed', async () => {
      harness.resize.mockRejectedValueOnce(new Error('boom'));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createComposerWrapper(),
      });

      act(() => {
        result.current.draftActorRef.send({ type: 'addDraftImage', image: 'data:image/png;base64,raw' });
      });

      await waitFor(() => {
        expect(harness.toastError).toHaveBeenCalledOnce();
      });
      expect(harness.toastError).toHaveBeenCalledWith('Failed to process image', expect.any(Object));
    });

    it('should unsubscribe the toast listener on unmount', async () => {
      let rejectResize!: (error: Error) => void;
      harness.resize.mockImplementationOnce(
        async () =>
          new Promise<string>((_resolve, reject) => {
            rejectResize = reject;
          }),
      );

      const { result, unmount } = renderHook(() => useChatComposer(), {
        wrapper: createComposerWrapper(),
      });

      act(() => {
        result.current.draftActorRef.send({ type: 'addDraftImage', image: 'data:image/png;base64,raw' });
      });

      unmount();

      rejectResize(new Error('post-unmount failure'));

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(harness.toastError).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// ActiveChatProvider — session-backed contract
// ===========================================================================
describe('ActiveChatProvider', () => {
  it('should expose a draftActorRef + session triple via useChatComposer', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createSessionWrapper('chat_active'),
    });

    expect(result.current.draftActorRef).toBeDefined();
    expect(result.current.session).toBeDefined();
    expect(result.current.session!.activeChatId).toBe('chat_active');
    expect(result.current.session!.chat).toBeDefined();
    expect(result.current.session!.persistenceActorRef).toBeDefined();
  });

  it('should expose the strict session triple via useActiveChatSession', () => {
    const { result } = renderHook(() => useActiveChatSession(), {
      wrapper: createSessionWrapper('chat_active'),
    });

    expect(result.current.activeChatId).toBe('chat_active');
    expect(result.current.chat).toBeDefined();
    expect(result.current.persistenceActorRef).toBeDefined();
    expect(result.current.draftActorRef).toBeDefined();
  });

  it('should reflect the live AI SDK status via useChatComposer().status', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createSessionWrapper('chat_status'),
    });

    expect(result.current.status).toBe('ready');

    act(() => {
      const live = harness.created[0]!;
      live.status = 'streaming';
      live.emitStatusChange();
    });

    expect(result.current.status).toBe('streaming');
  });

  it('should dispatch stopRequest on the persistence machine when stop() is called', () => {
    const { result } = renderHook(() => ({ composer: useChatComposer(), session: useActiveChatSession() }), {
      wrapper: createSessionWrapper('chat_stop'),
    });

    const sendSpy = vi.spyOn(result.current.session.persistenceActorRef, 'send');

    act(() => {
      result.current.composer.stop();
    });

    expect(sendSpy).toHaveBeenCalledWith({ type: 'stopRequest' });
  });

  it('should scan messages for the latest data-context-usage part', () => {
    const initialMessages: MyUIMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        metadata: { createdAt: 0, status: 'success' },
        parts: [
          { type: 'text', text: 'hello' },
          {
            type: 'data-context-usage',
            data: {
              type: 'context-usage',
              id: 'usage-1',
              totalInputTokens: 100,
              contextWindow: 200_000,
              percentUsed: 0.05,
              modelId: 'gpt-5.4-medium',
            },
          },
        ],
      },
    ];

    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createSessionWrapper('chat_usage'),
    });

    expect(result.current.contextUsage).toBeUndefined();

    act(() => {
      const live = harness.created[0]!;
      live.messages = initialMessages;
      live.emitMessagesChange();
    });

    expect(result.current.contextUsage?.totalInputTokens).toBe(100);
    expect(result.current.contextUsage?.percentUsed).toBe(0.05);
  });

  // ── Session-backed model resolver (chat row preferred, cookie fallback,
  // dual-write on set) ──
  describe('model resolver', () => {
    it('should prefer Chat.activeModel when present', async () => {
      harness.getChat.mockResolvedValue(
        makeChat({
          id: 'chat_with_model',
          activeModel: 'chat-local-model',
        }),
      );

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_with_model'),
      });

      await waitFor(() => {
        expect(result.current.model.modelId).toBe('chat-local-model');
      });
      expect(result.current.model.model.id).toBe('chat-local-model');
    });

    it('should fall back to the cookie when Chat.activeModel is undefined', async () => {
      harness.getChat.mockResolvedValue(makeChat({ id: 'chat_no_model' }));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_no_model'),
      });

      await waitFor(() => {
        expect(harness.getChat).toHaveBeenCalledWith('chat_no_model');
      });
      expect(result.current.model.modelId).toBe('cookie-model');
    });

    it('should dual-write (chat row + cookie) when setActiveModel is called', async () => {
      harness.getChat.mockResolvedValue(makeChat({ id: 'chat_dual_write' }));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_dual_write'),
      });

      await waitFor(() => {
        expect(result.current.model.modelId).toBe('cookie-model');
      });

      act(() => {
        result.current.model.setActiveModel('new-model');
      });

      await waitFor(() => {
        expect(harness.patchChat).toHaveBeenCalledWith('chat_dual_write', 'activeModel', 'new-model');
      });
      expect(harness.setSelectedModelId).toHaveBeenCalledWith('new-model');
    });
  });

  // ── Session-backed kernel resolver ──
  describe('kernel resolver', () => {
    it('should prefer Chat.activeKernel when present', async () => {
      harness.getChat.mockResolvedValue(
        makeChat({
          id: 'chat_with_kernel',
          activeKernel: 'manifold',
        }),
      );

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_with_kernel'),
      });

      await waitFor(() => {
        expect(result.current.kernel.kernelId).toBe('manifold');
      });
      expect(result.current.kernel.kernel.id).toBe('manifold');
    });

    it('should fall back to the cookie when Chat.activeKernel is undefined', async () => {
      harness.getChat.mockResolvedValue(makeChat({ id: 'chat_no_kernel' }));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_no_kernel'),
      });

      await waitFor(() => {
        expect(harness.getChat).toHaveBeenCalledWith('chat_no_kernel');
      });
      expect(result.current.kernel.kernelId).toBe('openscad');
    });

    it('should dual-write (chat row + cookie) when setActiveKernel is called', async () => {
      harness.getChat.mockResolvedValue(makeChat({ id: 'chat_kernel_dual_write' }));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_kernel_dual_write'),
      });

      await waitFor(() => {
        expect(result.current.kernel.kernelId).toBe('openscad');
      });

      act(() => {
        result.current.kernel.setActiveKernel('manifold');
      });

      await waitFor(() => {
        expect(harness.patchChat).toHaveBeenCalledWith('chat_kernel_dual_write', 'activeKernel', 'manifold');
      });
      expect(harness.setKernel).toHaveBeenCalledWith('manifold');
    });
  });

  it('should throw with a descriptive message when useActiveChatSession is used outside any provider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useActiveChatSession())).toThrow(/activechatprovider/i);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('should persist draft to IndexedDB when chatId is defined', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useActiveChatSession(), {
      wrapper: createSessionWrapper('chat_persist'),
    });

    act(() => {
      result.current.draftActorRef.send({ type: 'setDraftText', text: 'hello world' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(harness.patchChat).toHaveBeenCalledWith('chat_persist', 'draft', expect.objectContaining({ id: 'draft' }));
  });

  it('should switch draft state cleanly when chatId prop changes', async () => {
    function Probe(): ReactNode {
      return null;
    }

    const { rerender } = render(
      <ChatSessionStoreProvider>
        <ActiveChatProvider chatId='chat_first'>
          <Probe />
        </ActiveChatProvider>
      </ChatSessionStoreProvider>,
    );

    expect(harness.getChat).toHaveBeenCalledWith('chat_first');

    rerender(
      <ChatSessionStoreProvider>
        <ActiveChatProvider chatId='chat_second'>
          <Probe />
        </ActiveChatProvider>
      </ChatSessionStoreProvider>,
    );

    await waitFor(() => {
      expect(harness.getChat).toHaveBeenCalledWith('chat_second');
    });
  });

  it('should load the existing Chat.draft from IndexedDB when a record exists', async () => {
    harness.getChat.mockResolvedValue(
      makeChat({
        id: 'chat_with_draft',
        draft: {
          id: 'draft',
          role: 'user',
          metadata: { createdAt: 0, status: 'pending' },
          parts: [{ type: 'text', text: 'preserved homepage draft' }],
        },
      }),
    );

    const { result } = renderHook(() => useActiveChatSession(), {
      wrapper: createSessionWrapper('chat_with_draft'),
    });

    await waitFor(() => {
      const snapshot = result.current.draftActorRef.getSnapshot();
      expect(snapshot.context.draftText).toBe('preserved homepage draft');
    });
  });

  it('should not throw when no Chat row exists for the given chatId (homepage first-visit)', async () => {
    harness.getChat.mockResolvedValue(undefined);

    const { result } = renderHook(() => useActiveChatSession(), {
      wrapper: createSessionWrapper('chat_homepage_main'),
    });

    await waitFor(() => {
      expect(harness.getChat).toHaveBeenCalledWith('chat_homepage_main');
    });

    expect(result.current.draftActorRef.getSnapshot().context.draftText).toBe('');
  });

  describe('imageResizeFailed toast subscriber', () => {
    it('should emit toast.error when the draft actor emits imageResizeFailed', async () => {
      harness.resize.mockRejectedValueOnce(new Error('boom'));

      const { result } = renderHook(() => useActiveChatSession(), {
        wrapper: createSessionWrapper('chat_toast'),
      });

      act(() => {
        result.current.draftActorRef.send({ type: 'addDraftImage', image: 'data:image/png;base64,raw' });
      });

      await waitFor(() => {
        expect(harness.toastError).toHaveBeenCalledOnce();
      });
      expect(harness.toastError).toHaveBeenCalledWith('Failed to process image', expect.any(Object));
    });

    it('should not toast on successful resize', async () => {
      harness.resize.mockResolvedValueOnce('data:image/jpeg;base64,resized');

      const { result } = renderHook(() => useActiveChatSession(), {
        wrapper: createSessionWrapper('chat_no_toast'),
      });

      act(() => {
        result.current.draftActorRef.send({ type: 'addDraftImage', image: 'data:image/png;base64,raw' });
      });

      await waitFor(() => {
        expect(result.current.draftActorRef.getSnapshot().context.draftImages).toEqual([
          'data:image/jpeg;base64,resized',
        ]);
      });

      expect(harness.toastError).not.toHaveBeenCalled();
    });
  });
});
