// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChatPaneSkeleton,
  ChatHistoryGate,
  ChatInterfaceSessionGate,
  FocusedChatErrorPanel,
} from '#routes/projects_.$id/focused-chat-gate.js';

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

const { mockEditorRefSend, mockState } = vi.hoisted(() => ({
  mockEditorRefSend: vi.fn(),
  mockState: { current: undefined as unknown },
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    editorRef: { send: mockEditorRefSend },
  }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: (_reference: unknown, selector: (state: unknown) => unknown) => selector(mockState.current),
}));

vi.mock('#hooks/active-chat-provider.js', () => ({
  ActiveChatProvider: ({ children, chatId }: { readonly children: React.ReactNode; readonly chatId: string }) => (
    <div data-testid='active-chat-provider' data-chat-id={chatId}>
      {children}
    </div>
  ),
}));

describe('ChatPaneSkeleton', () => {
  it('renders the loading variant with an aria-label and testid', () => {
    render(<ChatPaneSkeleton variant='loading' />);

    const placeholder = screen.getByTestId('chat-pane-skeleton-loading');
    expect(placeholder).toBeDefined();
    expect(placeholder.getAttribute('aria-busy')).toBe('true');
    expect(placeholder.getAttribute('aria-label')).toContain('Loading');
  });

  it('renders the ensuring variant with the matching aria-label', () => {
    render(<ChatPaneSkeleton variant='ensuring' />);

    const placeholder = screen.getByTestId('chat-pane-skeleton-ensuring');
    expect(placeholder).toBeDefined();
    expect(placeholder.getAttribute('aria-busy')).toBe('true');
    expect(placeholder.getAttribute('aria-label')).toContain('Preparing');
  });

  it('carries the floating-panel data-slot so it inherits chat-pane chrome', () => {
    render(<ChatPaneSkeleton variant='loading' />);

    const placeholder = screen.getByTestId('chat-pane-skeleton-loading');
    expect(placeholder.dataset['slot']).toBe('floating-panel');
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
    mockEditorRefSend.mockClear();
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

  it('renders the ensuring skeleton while ensureFocusedChatActor is in flight (load-time)', () => {
    mockState.current = buildState({
      value: { loading: 'ensuringFocusedChat' },
      focusedChatId: undefined,
    });

    render(
      <ChatHistoryGate>
        <div data-testid='chat-pane-child'>chat content</div>
      </ChatHistoryGate>,
    );

    expect(screen.getByTestId('chat-pane-skeleton-ensuring')).toBeDefined();
    expect(screen.queryByTestId('chat-pane-child')).toBeNull();
  });

  it('renders the ensuring skeleton while ensureFocusedChatActor is in flight (runtime)', () => {
    mockState.current = buildState({
      value: { ready: { operation: 'ensuringFocusedChat' } },
      focusedChatId: undefined,
    });

    render(
      <ChatHistoryGate>
        <div data-testid='chat-pane-child'>chat content</div>
      </ChatHistoryGate>,
    );

    expect(screen.getByTestId('chat-pane-skeleton-ensuring')).toBeDefined();
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
    expect(screen.queryByTestId('chat-pane-skeleton-ensuring')).toBeNull();
  });
});

describe('ChatInterfaceSessionGate', () => {
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
