// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat class uses the SDK's own `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
/* eslint-disable @typescript-eslint/explicit-member-accessibility -- mock class constructor omits the `public` keyword to mirror the AI SDK's published shape. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { ChatSessionStore } from '#services/chat-session-store.js';

// ---------------------------------------------------------------------------
// Hoisted test harness — reuses the AI SDK Chat mock from
// chat-session-store.test.ts so tests can drive snapshot callbacks.
// ---------------------------------------------------------------------------

type FakeChatInstance = {
  id: string;
  messages: unknown[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  error: Error | undefined;
  emitMessagesChange: () => void;
  emitStatusChange: () => void;
  emitErrorChange: () => void;
};

const harness = vi.hoisted(() => ({
  created: [] as FakeChatInstance[],
  projectManager: {
    getChat: vi.fn().mockResolvedValue(undefined),
    patchChat: vi.fn().mockResolvedValue(undefined),
    setMessageEdit: vi.fn().mockResolvedValue(undefined),
    clearMessageEdit: vi.fn().mockResolvedValue(undefined),
    consumeChatStartupRequest: vi.fn().mockResolvedValue(undefined),
    commitCancelledDraftRestore: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@ai-sdk/react', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  Chat: class {
    public id: string;
    public messages: unknown[] = [];
    public status: 'submitted' | 'streaming' | 'ready' | 'error' = 'ready';
    public error: Error | undefined = undefined;
    public sendMessage = vi.fn().mockResolvedValue(undefined);
    public regenerate = vi.fn().mockResolvedValue(undefined);
    public stop = vi.fn().mockResolvedValue(undefined);
    readonly #messagesListeners = new Set<() => void>();
    readonly #statusListeners = new Set<() => void>();
    readonly #errorListeners = new Set<() => void>();

    constructor(init: { id: string }) {
      this.id = init.id;
      const fake: FakeChatInstance = Object.assign(this, {
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
  useProjectManager: () => harness.projectManager,
}));

const { ChatSessionStoreProvider, useChatSessionStore } = await import('#hooks/chat-session-store-provider.js');
const { useChatSession, useChatSessionSnapshot } = await import('#hooks/use-chat-session.js');

function createWrapper() {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <ChatSessionStoreProvider>{children}</ChatSessionStoreProvider>;
  };
}

describe('useChatSession', () => {
  beforeEach(() => {
    harness.created = [];
    harness.projectManager.getChat.mockReset().mockResolvedValue(undefined);
    harness.projectManager.patchChat.mockReset().mockResolvedValue(undefined);
    harness.projectManager.setMessageEdit.mockReset().mockResolvedValue(undefined);
    harness.projectManager.clearMessageEdit.mockReset().mockResolvedValue(undefined);
    harness.projectManager.consumeChatStartupRequest.mockReset().mockResolvedValue(undefined);
    harness.projectManager.commitCancelledDraftRestore.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('acquires a session on mount and releases on unmount', () => {
    const wrapper = createWrapper();
    const captured: { store?: ChatSessionStore } = {};

    function Inner() {
      captured.store = useChatSessionStore();
      useChatSession('chat_a');
      return null;
    }

    const { unmount } = render(
      <ChatSessionStoreProvider>
        <Inner />
      </ChatSessionStoreProvider>,
    );

    expect(captured.store!.get('chat_a')).toBeDefined();
    unmount();
    expect(captured.store!.get('chat_a')).toBeUndefined();
    void wrapper;
  });

  it('shares a single session across two consumer hooks', () => {
    let storeRef: ChatSessionStore | undefined;
    function ProbeStore() {
      storeRef = useChatSessionStore();
      return null;
    }
    function ProbeSession() {
      useChatSession('chat_a');
      return null;
    }

    const { rerender } = render(
      <ChatSessionStoreProvider>
        <ProbeStore />
        <ProbeSession />
        <ProbeSession />
      </ChatSessionStoreProvider>,
    );

    const first = storeRef!.get('chat_a');
    expect(first).toBeDefined();
    rerender(
      <ChatSessionStoreProvider>
        <ProbeStore />
        <ProbeSession />
        <ProbeSession />
      </ChatSessionStoreProvider>,
    );
    expect(storeRef!.get('chat_a')).toBe(first);
  });

  it('keeps the session live until the last consumer unmounts', () => {
    let storeRef: ChatSessionStore | undefined;
    function ProbeStore() {
      storeRef = useChatSessionStore();
      return null;
    }
    function ProbeSession() {
      useChatSession('chat_a');
      return null;
    }

    function Container() {
      const [showSecond, setShowSecond] = useState(true);
      useEffect(() => {
        // Expose a way to flip via test event. The onClick handler below.
      }, []);
      return (
        <ChatSessionStoreProvider>
          <ProbeStore />
          <ProbeSession />
          {showSecond ? <ProbeSession /> : null}
          <button
            type='button'
            data-testid='toggle'
            onClick={() => {
              setShowSecond(false);
            }}
          >
            toggle
          </button>
        </ChatSessionStoreProvider>
      );
    }

    const { getByTestId } = render(<Container />);
    const sessionBefore = storeRef!.get('chat_a');
    expect(sessionBefore).toBeDefined();

    act(() => {
      getByTestId('toggle').click();
    });

    expect(storeRef!.get('chat_a')).toBe(sessionBefore);
  });

  it('returns the session record', () => {
    const { result } = renderHook(() => useChatSession('chat_a'), { wrapper: createWrapper() });
    expect(result.current.chatId).toBe('chat_a');
    expect(result.current.chat).toBeDefined();
    expect(result.current.persistenceActorRef).toBeDefined();
    expect(result.current.draftActorRef).toBeDefined();
  });

  it('survives strict-mode-style mount/unmount/mount cycles without losing the session', () => {
    let storeRef: ChatSessionStore | undefined;
    function ProbeStore() {
      storeRef = useChatSessionStore();
      return null;
    }
    function ProbeSession() {
      useChatSession('chat_a');
      return null;
    }

    const tree = (
      <ChatSessionStoreProvider>
        <ProbeStore />
        <ProbeSession />
      </ChatSessionStoreProvider>
    );

    const { rerender, unmount } = render(tree);
    const first = storeRef!.get('chat_a');
    expect(first).toBeDefined();

    rerender(tree);
    expect(storeRef!.get('chat_a')).toBe(first);

    unmount();
    expect(storeRef!.get('chat_a')).toBeUndefined();
  });
});

describe('useChatSessionSnapshot', () => {
  beforeEach(() => {
    harness.created = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-renders when the underlying chat messages change', () => {
    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount += 1;
        useChatSession('chat_a');
        return useChatSessionSnapshot('chat_a', (session) => session?.chat.messages);
      },
      { wrapper: createWrapper() },
    );

    const initialRenders = renderCount;
    expect(result.current).toEqual([]);
    expect(harness.created).toHaveLength(1);
    const fake = harness.created[0]!;

    act(() => {
      fake.messages = [{ id: 'msg_1', role: 'user', parts: [] }];
      fake.emitMessagesChange();
    });

    expect(renderCount).toBeGreaterThan(initialRenders);
    expect(result.current).toEqual([{ id: 'msg_1', role: 'user', parts: [] }]);
    // The Chat instance was not recreated.
    expect(harness.created).toHaveLength(1);
  });

  it('re-renders when the underlying chat status changes', () => {
    const { result } = renderHook(
      () => {
        useChatSession('chat_a');
        return useChatSessionSnapshot('chat_a', (session) => session?.chat.status);
      },
      { wrapper: createWrapper() },
    );

    const fake = harness.created[0]!;
    expect(result.current).toBe('ready');

    act(() => {
      fake.status = 'streaming';
      fake.emitStatusChange();
    });

    expect(result.current).toBe('streaming');
  });

  it('does not wake snapshot subscribers from a different chatId', () => {
    let renderCountA = 0;

    function ProbeA() {
      renderCountA += 1;
      useChatSession('chat_a');
      useChatSessionSnapshot('chat_a', (session) => session?.chat.status);
      return null;
    }

    function ProbeB() {
      useChatSession('chat_b');
      return null;
    }

    render(
      <ChatSessionStoreProvider>
        <ProbeA />
        <ProbeB />
      </ChatSessionStoreProvider>,
    );

    const initial = renderCountA;
    const fakeB = harness.created.find((c) => c.id === 'chat_b')!;
    act(() => {
      fakeB.emitMessagesChange();
    });
    expect(renderCountA).toBe(initial);
  });
});
