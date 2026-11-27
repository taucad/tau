// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- mocks keep the environment's `ENV`/`TAU_API_URL` and the AI SDK's own export names verbatim. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StrictMode, Suspense, useEffect, useState } from 'react';
import type { ChatSessionStore } from '#services/chat-session-store.js';

const harness = vi.hoisted(() => ({
  projectManager: {
    getChat: vi.fn().mockResolvedValue(undefined),
    patchChat: vi.fn().mockResolvedValue(undefined),
    touchChatRecency: vi.fn().mockResolvedValue(undefined),
    consumeChatStartupRequest: vi.fn().mockResolvedValue(undefined),
    commitCancelledDraftRestore: vi.fn().mockResolvedValue(undefined),
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
  useFileManager: () => ({ client: {} }),
}));

const { useChatSessionStore } = await import('#hooks/chat-session-store-provider.js');
/* The pre-A2 mirror over the mocked project and file managers; production's store is the runtime's. */
const { MirroredChatSessionStoreProvider: ChatSessionStoreProvider } =
  await import('#hooks/chat-session-store.fixture.js');
const { useChatSession, useChatSessionSnapshot } = await import('#hooks/use-chat-session.js');
const { lifecycleRow, logRow, publishLogRows, runningRows } = await import('#machines/chat-projection.fixture.js');

function createWrapper() {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <ChatSessionStoreProvider>{children}</ChatSessionStoreProvider>;
  };
}

describe('useChatSession', () => {
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

  it('acquires a session on mount and releases on unmount', () => {
    const wrapper = createWrapper();
    const captured: { store?: ChatSessionStore } = {};

    function Inner() {
      captured.store = useChatSessionStore();
      useChatSession('chat_a', 'proj_a');
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
      useChatSession('chat_a', 'proj_a');
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
      useChatSession('chat_a', 'proj_a');
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
    const { result } = renderHook(() => useChatSession('chat_a', 'proj_a'), { wrapper: createWrapper() });
    expect(result.current?.chatId).toBe('chat_a');
    expect(result.current?.persistenceActorRef).toBeDefined();
    expect(result.current?.draftActorRef).toBeDefined();
  });

  it('should not expose the previous project session during a project switch', () => {
    const seen: Array<{ projectId: string; chatId: string | undefined }> = [];
    const { result, rerender } = renderHook(
      ({ chatId, projectId }) => {
        const session = useChatSession(chatId, projectId);
        seen.push({ projectId, chatId: session?.chatId });
        return session;
      },
      { wrapper: createWrapper(), initialProps: { chatId: 'chat_a', projectId: 'proj_a' } },
    );
    rerender({ chatId: 'chat_b', projectId: 'proj_b' });
    expect(result.current?.chatId).toBe('chat_b');
    expect(seen).not.toContainEqual({ projectId: 'proj_b', chatId: 'chat_a' });
  });

  it('survives strict-mode-style mount/unmount/mount cycles without losing the session', () => {
    let storeRef: ChatSessionStore | undefined;
    function ProbeStore() {
      storeRef = useChatSessionStore();
      return null;
    }
    function ProbeSession() {
      useChatSession('chat_a', 'proj_a');
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
  it('leaks no view reference from a render that never commits', () => {
    let storeRef: ChatSessionStore | undefined;
    function ProbeStore() {
      storeRef = useChatSessionStore();
      return null;
    }
    const never = new Promise<never>(() => {
      // Never settles: the render stays abandoned.
    });
    function AbandonedSession(): never {
      useChatSession('chat_a', 'proj_a');
      // oxlint-disable-next-line @typescript-eslint/only-throw-error -- Suspense protocol: the render is abandoned.
      throw never;
    }

    const { unmount } = render(
      <StrictMode>
        <ChatSessionStoreProvider>
          <ProbeStore />
          <Suspense fallback={null}>
            <AbandonedSession />
          </Suspense>
        </ChatSessionStoreProvider>
      </StrictMode>,
    );
    unmount();
    // A render React throws away holds no view reference (PV-A11).
    expect(storeRef!.get('chat_a')).toBeUndefined();
  });

  it('releases nothing it did not acquire under StrictMode', () => {
    let storeRef: ChatSessionStore | undefined;
    function ProbeStore() {
      storeRef = useChatSessionStore();
      return null;
    }
    function ProbeSession() {
      useChatSession('chat_a', 'proj_a');
      return null;
    }

    const { unmount } = render(
      <StrictMode>
        <ChatSessionStoreProvider>
          <ProbeStore />
          <ProbeSession />
        </ChatSessionStoreProvider>
      </StrictMode>,
    );
    expect(storeRef!.get('chat_a')).toBeDefined();

    unmount();
    // An abandoned StrictMode render holds no view reference (PV-A11).
    expect(storeRef!.get('chat_a')).toBeUndefined();
  });
});

describe('useChatSessionSnapshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-renders when the chat transcript changes', () => {
    let renderCount = 0;
    const captured: { store?: ChatSessionStore; session?: unknown } = {};
    const { result } = renderHook(
      () => {
        renderCount += 1;
        captured.session = useChatSession('chat_a', 'proj_a');
        captured.store = useChatSessionStore();
        return useChatSessionSnapshot('chat_a', (session) => session?.messages);
      },
      { wrapper: createWrapper() },
    );

    const initialRenders = renderCount;
    const initialSession = captured.session;
    expect(result.current).toEqual([]);

    act(() => {
      publishLogRows(captured.store!, 'chat_a', [
        lifecycleRow(0, 'admitted'),
        logRow(1, { type: 'message.appended', message: { id: 'msg_1', role: 'user', content: 'Hello' } }),
        lifecycleRow(2, 'completed'),
      ]);
    });

    expect(renderCount).toBeGreaterThan(initialRenders);
    expect(result.current?.map((message) => message.id)).toContain('msg_1');
    // The session was not recreated.
    expect(captured.session).toBe(initialSession);
  });

  it('should re-render when the chat status moves with its run phase', () => {
    const captured: { store?: ChatSessionStore } = {};
    const { result } = renderHook(
      () => {
        useChatSession('chat_a', 'proj_a');
        const store = useChatSessionStore();
        captured.store = store;
        return useChatSessionSnapshot('chat_a', () => store.getChatStatus('chat_a'));
      },
      { wrapper: createWrapper() },
    );

    expect(result.current).toBe('ready');

    act(() => {
      publishLogRows(captured.store!, 'chat_a', runningRows());
    });

    expect(result.current).toBe('streaming');
  });

  it('does not wake snapshot subscribers from a different chatId', () => {
    let renderCountA = 0;

    function ProbeA() {
      renderCountA += 1;
      useChatSession('chat_a', 'proj_a');
      useChatSessionSnapshot('chat_a', (session) => session?.messages);
      return null;
    }

    const captured: { store?: ChatSessionStore } = {};
    function ProbeB() {
      useChatSession('chat_b', 'proj_a');
      captured.store = useChatSessionStore();
      return null;
    }

    render(
      <ChatSessionStoreProvider>
        <ProbeA />
        <ProbeB />
      </ChatSessionStoreProvider>,
    );

    const initial = renderCountA;
    act(() => {
      publishLogRows(captured.store!, 'chat_b', [
        lifecycleRow(0, 'admitted'),
        logRow(1, { type: 'message.appended', message: { id: 'msg_b', role: 'user', content: 'Hello' } }),
        lifecycleRow(2, 'completed'),
      ]);
    });
    expect(renderCountA).toBe(initial);
  });
});
