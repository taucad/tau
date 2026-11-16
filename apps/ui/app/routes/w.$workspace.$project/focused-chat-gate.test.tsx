// @vitest-environment jsdom
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChatHistoryGate,
  ChatInterfaceSessionGate,
  FocusedChatErrorPanel,
} from '#routes/w.$workspace.$project/focused-chat-gate.js';
import { ChatLaneFrame } from '#routes/w.$workspace.$project/workspace-frame.js';

type StateValue = string | { [key: string]: StateValue };

const matchesValue = (value: StateValue, target: StateValue): boolean => {
  if (typeof target === 'string') {
    if (typeof value === 'string') {
      return value === target;
    }
    return target in value;
  }
  if (typeof value === 'string') {
    return false;
  }
  for (const [key, sub] of Object.entries(target)) {
    if (!(key in value)) {
      return false;
    }
    const child = value[key];
    if (child === undefined || !matchesValue(child, sub)) {
      return false;
    }
  }
  return true;
};

const buildState = ({
  value,
  focusedChatId,
  focusedChatError,
}: {
  readonly value: StateValue;
  readonly focusedChatId?: string;
  readonly focusedChatError?: Error;
}): unknown => ({
  context: { focusedChatId, focusedChatError },
  matches: (target: StateValue) => matchesValue(value, target),
});

const { mockEditorRefSend, mockState, syncNow, chatSync, availability } = vi.hoisted(() => ({
  mockEditorRefSend: vi.fn(),
  syncNow: vi.fn(),
  chatSync: { state: 'loading' },
  mockState: { current: undefined as unknown },
  /* The whole apply's availability, and the chats surface's own (SP2h). */
  availability: { whole: 'ready', chats: 'ready' },
}));

vi.mock('#hooks/use-project-availability.js', () => ({
  useProjectAvailability: (surface?: string) => (surface === 'chats' ? availability.chats : availability.whole),
  useModelAvailability: () => 'ready',
  useLargeObjectPending: () => false,
}));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionStatus: () => ({ sync: { chats: chatSync.state } }),
  useRevisionClient: () => undefined,
  useRevisionCommands: () => ({ syncNow, connectRemote: vi.fn() }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    editorRef: { send: mockEditorRefSend },
  }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: (_reference: unknown, selector: (state: unknown) => unknown) => selector(mockState.current),
}));

/* The chat's turn host owns the agent-host binding and the bodyless body
 * factory; it reaches the whole project subtree to compose them. This gate's
 * contract is only that exactly one of them is mounted inside the provider. */
vi.mock('#chat-clients/chat-turn-host.js', () => ({
  ChatTurnHost: () => <div data-testid='chat-turn-host' />,
}));

vi.mock('#hooks/active-chat-provider.js', () => ({
  ActiveChatProvider: ({ children, chatId }: { readonly children: React.ReactNode; readonly chatId: string }) => (
    <div data-testid='active-chat-provider' data-chat-id={chatId}>
      {children}
    </div>
  ),
}));

/* A15b: the chat pane's skeleton became the chat lane's bare frame, which the workspace frame draws while the
 * workspace opens and the chat gate shows while the focused chat is ensured. */
describe('ChatLaneFrame', () => {
  it("renders the workspace frame's chat lane with its testid and no busy state of its own", () => {
    render(<ChatLaneFrame />);

    const placeholder = screen.getByTestId('chat-lane-frame');
    expect(placeholder).toBeDefined();
    expect(placeholder.getAttribute('aria-busy')).toBeNull();
    expect(placeholder.querySelector('[data-slot=skeleton]')).toBeNull();
  });

  it('renders the ensuring wait with the matching aria-label', () => {
    render(<ChatLaneFrame busyLabel='Preparing chat session…' />);

    const placeholder = screen.getByTestId('chat-lane-frame');
    expect(placeholder).toBeDefined();
    expect(placeholder.getAttribute('aria-busy')).toBe('true');
    expect(placeholder.getAttribute('aria-label')).toContain('Preparing');
    expect(screen.getByRole('status', { name: /Preparing chat session/u })).toBe(placeholder);
  });

  it('carries the floating-panel data-slot so it inherits chat-pane chrome', () => {
    render(<ChatLaneFrame />);

    const placeholder = screen.getByTestId('chat-lane-frame');
    expect(placeholder.dataset['slot']).toBe('floating-panel');
  });

  it('draws the composer as the live empty composer frame rather than a pulsing block', () => {
    render(<ChatLaneFrame />);

    const composer = screen.getByTestId('chat-lane-frame-composer');
    expect(composer.className).toContain('rounded-2xl');
    expect(composer.className).toContain('min-h-20.5');
    expect(composer.className).not.toContain('animate-pulse');
  });
});

describe('FocusedChatErrorPanel', () => {
  beforeEach(() => {
    mockEditorRefSend.mockClear();
  });

  it('surfaces the error message and dispatches retryEnsureFocusedChat on click', () => {
    render(<FocusedChatErrorPanel error={new Error('worker offline')} />);

    expect(screen.getByText('worker offline')).toBeDefined();
    expect(screen.getByText("Couldn't open this project's chat")).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(mockEditorRefSend).toHaveBeenCalledWith({ type: 'retryEnsureFocusedChat' });
  });
});

describe('ChatHistoryGate', () => {
  beforeEach(() => {
    chatSync.state = 'loading';
    availability.whole = 'ready';
    availability.chats = 'ready';
    syncNow.mockClear();
    mockEditorRefSend.mockClear();
  });

  /* SP2h: a chat opens on its records while the apply still writes the files. */
  it('opens the focused chat on the chats surface, before the whole apply lands', () => {
    chatSync.state = 'ready';
    availability.whole = 'preparing';
    mockState.current = buildState({ value: { ready: { operation: 'idle' } }, focusedChatId: 'chat-123' });
    const { rerender } = render(
      <ChatHistoryGate>
        <div data-testid='chat-pane-child'>chat content</div>
      </ChatHistoryGate>,
    );
    expect(screen.getByTestId('chat-pane-child')).toBeDefined();

    /* Until the chats surface opens, its placeholder speaks: never a partial history (I7). */
    availability.chats = 'preparing';
    rerender(
      <MemoryRouter>
        <ChatHistoryGate>
          <div data-testid='chat-pane-child'>chat content</div>
        </ChatHistoryGate>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('chat-pane-child')).toBeNull();
  });

  it('should retry failed chat discovery without hiding available project files', () => {
    chatSync.state = 'failed';
    mockState.current = buildState({ value: { ready: { operation: 'idle' } } });
    render(
      <ChatHistoryGate>
        <div>Chat content</div>
      </ChatHistoryGate>,
    );
    expect(screen.getByText('Couldn’t load chat history')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(syncNow).toHaveBeenCalledOnce();
    expect(screen.queryByText('Chat content')).not.toBeInTheDocument();
  });

  it('renders the error panel when ensure has rejected (focusedChatUnresolved + error)', () => {
    mockState.current = buildState({
      value: { ready: { operation: 'focusedChatUnresolved' } },
      focusedChatId: undefined,
      focusedChatError: new Error('worker offline'),
    });

    render(
      <ChatHistoryGate>
        <div data-testid='chat-pane-child'>chat content</div>
      </ChatHistoryGate>,
    );

    expect(screen.queryByTestId('chat-pane-child')).toBeNull();
    expect(screen.getByTestId('focused-chat-error-panel')).toBeDefined();
    expect(screen.getByText('worker offline')).toBeDefined();
  });

  it('shows chat discovery while ensureFocusedChatActor is in flight (load-time)', () => {
    mockState.current = buildState({
      value: { loading: 'ensuringFocusedChat' },
      focusedChatId: undefined,
    });

    render(
      <ChatHistoryGate>
        <div data-testid='chat-pane-child'>chat content</div>
      </ChatHistoryGate>,
    );

    expect(screen.getByText('Loading chat history')).toBeDefined();
    expect(screen.queryByTestId('chat-pane-child')).toBeNull();
  });

  it('shows chat discovery while ensureFocusedChatActor is in flight (runtime)', () => {
    mockState.current = buildState({
      value: { ready: { operation: 'ensuringFocusedChat' } },
      focusedChatId: undefined,
    });

    render(
      <ChatHistoryGate>
        <div data-testid='chat-pane-child'>chat content</div>
      </ChatHistoryGate>,
    );

    expect(screen.getByText('Loading chat history')).toBeDefined();
  });

  it('renders children directly (no provider mount) when ready and not ensuring', () => {
    mockState.current = buildState({
      value: { ready: { operation: 'idle' } },
      focusedChatId: 'chat-123',
    });

    render(
      <ChatHistoryGate>
        <div data-testid='chat-pane-child'>chat content</div>
      </ChatHistoryGate>,
    );

    expect(screen.getByTestId('chat-pane-child')).toBeDefined();
    // Provider mount is now owned by ChatInterfaceSessionGate upstream, not by ChatHistoryGate.
    expect(screen.queryByTestId('active-chat-provider')).toBeNull();
    expect(screen.queryByTestId('focused-chat-error-panel')).toBeNull();
    expect(screen.queryByTestId('chat-lane-frame')).toBeNull();
  });
});

describe('ChatInterfaceSessionGate', () => {
  it('should open the model while chat discovery is pending, then mounts the discovered session', () => {
    mockState.current = buildState({ value: { ready: { operation: 'idle' } } });
    const content = (
      <ChatInterfaceSessionGate fallback={<div data-testid='session-gate-fallback' />}>
        <div data-testid='model-pane'>Model controls</div>
        <ChatHistoryGate>
          <div data-testid='chat-pane-child'>Chat history</div>
        </ChatHistoryGate>
      </ChatInterfaceSessionGate>
    );
    const { rerender } = render(content);
    expect(screen.getByTestId('model-pane')).toBeInTheDocument();
    expect(screen.getByText('Loading chat history')).toBeInTheDocument();
    expect(screen.queryByTestId('active-chat-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('session-gate-fallback')).not.toBeInTheDocument();
    mockState.current = buildState({ value: { ready: { operation: 'idle' } }, focusedChatId: 'discovered-chat' });
    rerender(
      <ChatInterfaceSessionGate fallback={<div data-testid='session-gate-fallback' />}>
        <div data-testid='model-pane'>Model controls</div>
        <ChatHistoryGate>
          <div data-testid='chat-pane-child'>Chat history</div>
        </ChatHistoryGate>
      </ChatInterfaceSessionGate>,
    );
    expect(screen.getByTestId('active-chat-provider').dataset['chatId']).toBe('discovered-chat');
    expect(screen.getByTestId('model-pane')).toBeInTheDocument();
    expect(screen.getByTestId('chat-pane-child')).toBeInTheDocument();
    expect(screen.queryByText('Loading chat history')).not.toBeInTheDocument();
  });

  it('mounts <ActiveChatProvider> with the focused chat id when one is set', () => {
    mockState.current = buildState({
      value: { ready: { operation: 'idle' } },
      focusedChatId: 'chat-123',
    });

    render(
      <ChatInterfaceSessionGate fallback={<div data-testid='session-gate-fallback' />}>
        <div data-testid='session-gate-child'>editor content</div>
      </ChatInterfaceSessionGate>,
    );

    const provider = screen.getByTestId('active-chat-provider');
    expect(provider.dataset['chatId']).toBe('chat-123');
    expect(screen.getByTestId('session-gate-child')).toBeDefined();
    expect(screen.queryByTestId('session-gate-fallback')).toBeNull();
    /* One turn host per chat, inside the provider: it is what owns the chat's
     * agent-host binding and its bodyless body factory (C1). */
    expect(screen.getAllByTestId('chat-turn-host')).toHaveLength(1);
    expect(provider.contains(screen.getByTestId('chat-turn-host'))).toBe(true);
  });

  it('renders the fallback when focusedChatId has never been set', () => {
    mockState.current = buildState({
      value: { loading: 'hydrating' },
      focusedChatId: undefined,
    });

    render(
      <ChatInterfaceSessionGate fallback={<div data-testid='session-gate-fallback' />}>
        <div data-testid='session-gate-child'>editor content</div>
      </ChatInterfaceSessionGate>,
    );

    expect(screen.getByTestId('session-gate-fallback')).toBeDefined();
    expect(screen.queryByTestId('active-chat-provider')).toBeNull();
    expect(screen.queryByTestId('session-gate-child')).toBeNull();
  });

  it('keeps the previous chatId mounted across a transient focusedChatId=undefined window', () => {
    mockState.current = buildState({
      value: { ready: { operation: 'idle' } },
      focusedChatId: 'chat-123',
    });

    const { rerender } = render(
      <ChatInterfaceSessionGate fallback={<div data-testid='session-gate-fallback' />}>
        <div data-testid='session-gate-child'>editor content</div>
      </ChatInterfaceSessionGate>,
    );

    expect(screen.getByTestId('active-chat-provider').dataset['chatId']).toBe('chat-123');

    // Simulate the runtime ensure window: focusedChatId is briefly undefined.
    mockState.current = buildState({
      value: { ready: { operation: 'ensuringFocusedChat' } },
      focusedChatId: undefined,
    });

    rerender(
      <ChatInterfaceSessionGate fallback={<div data-testid='session-gate-fallback' />}>
        <div data-testid='session-gate-child'>editor content</div>
      </ChatInterfaceSessionGate>,
    );

    // Provider stays mounted with the previous chatId — no Allotment/viewer remount.
    expect(screen.getByTestId('active-chat-provider').dataset['chatId']).toBe('chat-123');
    expect(screen.getByTestId('session-gate-child')).toBeDefined();
    expect(screen.queryByTestId('session-gate-fallback')).toBeNull();
  });

  it('updates the provider chatId when focusedChatId flips to a new string', () => {
    mockState.current = buildState({
      value: { ready: { operation: 'idle' } },
      focusedChatId: 'chat-123',
    });

    const { rerender } = render(
      <ChatInterfaceSessionGate fallback={<div data-testid='session-gate-fallback' />}>
        <div data-testid='session-gate-child'>editor content</div>
      </ChatInterfaceSessionGate>,
    );

    expect(screen.getByTestId('active-chat-provider').dataset['chatId']).toBe('chat-123');

    mockState.current = buildState({
      value: { ready: { operation: 'idle' } },
      focusedChatId: 'chat-456',
    });

    rerender(
      <ChatInterfaceSessionGate fallback={<div data-testid='session-gate-fallback' />}>
        <div data-testid='session-gate-child'>editor content</div>
      </ChatInterfaceSessionGate>,
    );

    expect(screen.getByTestId('active-chat-provider').dataset['chatId']).toBe('chat-456');
  });
});
