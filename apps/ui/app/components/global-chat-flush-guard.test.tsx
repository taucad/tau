// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat class uses the SDK's own `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

const harness = vi.hoisted(() => ({
  projectManager: {
    getChat: vi.fn().mockResolvedValue(undefined),
    patchChat: vi.fn().mockResolvedValue(undefined),
    touchChatRecency: vi.fn().mockResolvedValue(undefined),
    setChatUnreadState: vi.fn().mockResolvedValue(undefined),
    setMessageEdit: vi.fn().mockResolvedValue(undefined),
    clearMessageEdit: vi.fn().mockResolvedValue(undefined),
    consumeChatStartupRequest: vi.fn().mockResolvedValue(undefined),
    commitCancelledDraftRestore: vi.fn().mockResolvedValue(undefined),
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
const { UnloadProvider } = await import('#hooks/use-flush-on-close.js');
const { GlobalChatFlushGuard } = await import('#components/global-chat-flush-guard.js');
const { ChatSessionStore } = await import('#services/chat-session-store.js');

/**
 * Renders the guard inside the real `<ChatSessionStoreProvider>` and exposes
 * the underlying store so each test can `acquire()` real sessions and spy on
 * their actor `send` methods. We could not do this with the prior
 * `<ChatRegistryProvider>` because consumers had to manufacture matching
 * `ChatInstanceRecord`s by hand; with the store, every acquired session is
 * a first-class object whose XState refs we can intercept directly.
 */
function renderWithStore(): {
  store: InstanceType<typeof ChatSessionStore>;
  unmount: () => void;
} {
  let captured: InstanceType<typeof ChatSessionStore> | undefined;

  function Capture(): ReactNode {
    captured = useChatSessionStore();
    return null;
  }

  const utils = render(
    <UnloadProvider>
      <ChatSessionStoreProvider>
        <Capture />
        <GlobalChatFlushGuard />
      </ChatSessionStoreProvider>
    </UnloadProvider>,
  );

  if (!captured) {
    throw new Error('useChatSessionStore() did not capture a store');
  }

  return { store: captured, unmount: utils.unmount };
}

function spyOnActorSends(session: ReturnType<InstanceType<typeof ChatSessionStore>['acquire']>): {
  persistenceSend: ReturnType<typeof vi.fn>;
  draftSend: ReturnType<typeof vi.fn>;
} {
  const persistenceSend = vi.fn();
  const draftSend = vi.fn();
  // Replacing `.send` with a mock is the cleanest way to assert the guard's
  // fan-out without depending on machine internals — the guard's contract
  // is that it `.send({ type: 'flushNow' })` to every actor.
  vi.spyOn(session.persistenceActorRef, 'send').mockImplementation(persistenceSend);
  vi.spyOn(session.draftActorRef, 'send').mockImplementation(draftSend);
  return { persistenceSend, draftSend };
}

function dispatchVisibilityHidden(): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('GlobalChatFlushGuard', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flushes a single live chat session on visibility hidden', () => {
    const { store } = renderWithStore();
    const session = store.acquire('chat_alpha');
    const { persistenceSend, draftSend } = spyOnActorSends(session);

    dispatchVisibilityHidden();

    expect(persistenceSend).toHaveBeenCalledWith({ type: 'flushNow' });
    expect(draftSend).toHaveBeenCalledWith({ type: 'flushNow' });
  });

  it('fans out flushNow to every live chat session', () => {
    const { store } = renderWithStore();
    const sessions = ['chat_a', 'chat_b', 'chat_c'].map((id) => {
      const session = store.acquire(id);
      return spyOnActorSends(session);
    });

    dispatchVisibilityHidden();

    for (const spies of sessions) {
      expect(spies.persistenceSend).toHaveBeenCalledWith({ type: 'flushNow' });
      expect(spies.draftSend).toHaveBeenCalledWith({ type: 'flushNow' });
    }
  });

  it('does not flush sessions that have been released before the close event', () => {
    const { store } = renderWithStore();
    const a = spyOnActorSends(store.acquire('chat_a'));
    const b = spyOnActorSends(store.acquire('chat_b'));

    store.release('chat_b');

    dispatchVisibilityHidden();

    expect(a.persistenceSend).toHaveBeenCalledWith({ type: 'flushNow' });
    expect(a.draftSend).toHaveBeenCalledWith({ type: 'flushNow' });
    expect(b.persistenceSend).not.toHaveBeenCalledWith({ type: 'flushNow' });
    expect(b.draftSend).not.toHaveBeenCalledWith({ type: 'flushNow' });
  });

  it('flushes on beforeunload as well as visibilitychange', () => {
    const { store } = renderWithStore();
    const session = store.acquire('chat_alpha');
    const { persistenceSend, draftSend } = spyOnActorSends(session);

    globalThis.dispatchEvent(new Event('beforeunload'));

    expect(persistenceSend).toHaveBeenCalledWith({ type: 'flushNow' });
    expect(draftSend).toHaveBeenCalledWith({ type: 'flushNow' });
  });

  it('does nothing when no sessions are live', () => {
    expect(() => renderWithStore()).not.toThrow();
    expect(() => {
      dispatchVisibilityHidden();
    }).not.toThrow();
  });
});
