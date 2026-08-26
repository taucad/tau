/**
 * R2: ChatMessagePlanning renders 'Reconnecting... N/M' while the
 * persistence machine is in `requestLifecycle.retrying`.
 *
 * Verifies:
 *   - retryAttempt > 0 swaps copy from "Planning next moves..." to
 *     "Reconnecting... N/M" and switches the icon.
 *   - The render gate is relaxed so the indicator stays visible during
 *     `chat.status === 'error'` (otherwise we'd flash to nothing between
 *     the failure and the next retry).
 *   - Default retryAttempt of 0 keeps the original "Planning" copy.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { messageRole } from '@taucad/chat/constants';
import type { MyUIMessage } from '@taucad/chat';
import { ChatMessagePlanning } from '#routes/w.$workspace.$project/chat-message-planning.js';
import type { ChatRetrySnapshot } from '#hooks/use-chat.js';

type SelectorState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: MyUIMessage[];
  messagesById: Map<string, MyUIMessage>;
};

let mockSelectorState: SelectorState = {
  status: 'streaming',
  messages: [],
  messagesById: new Map(),
};

let mockRetrySnapshot: ChatRetrySnapshot = { retryAttempt: 0, retryMaxAttempts: 5 };

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector<T>(selector: (state: SelectorState) => T): T {
    return selector(mockSelectorState);
  },
  useChatRetrySnapshot(): ChatRetrySnapshot {
    return mockRetrySnapshot;
  },
}));

// `ChatToolCard` transitively reads route loader data via useCookie which
// requires a router context. Mocking the card avoids the router stub
// entirely -- mirrors `chat-message-reasoning.test.tsx`.
vi.mock('#components/chat/chat-tool-card.js', () => ({
  ChatToolCard({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card'>{children}</div>;
  },
  ChatToolCardHeader({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div>{children}</div>;
  },
  ChatToolCardIcon(): React.JSX.Element {
    return <span data-testid='chat-tool-card-icon' />;
  },
  ChatToolCardTitle({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div>{children}</div>;
  },
}));

function setMockState(partial: Partial<SelectorState>): void {
  const next = { ...mockSelectorState, ...partial };
  next.messagesById = new Map(next.messages.map((m) => [m.id, m]));
  mockSelectorState = next;
}

function makeUserMessage(id: string): MyUIMessage {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal MyUIMessage shape for test
  return {
    id,
    role: messageRole.user,
    parts: [{ type: 'text', text: 'hi' }],
    metadata: { createdAt: 0 },
  } as MyUIMessage;
}

function makeAssistantMessage(id: string): MyUIMessage {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal MyUIMessage shape for test
  return {
    id,
    role: messageRole.assistant,
    parts: [{ type: 'text', text: 'done', state: 'done' }],
    metadata: { createdAt: 0 },
  } as MyUIMessage;
}

function makeAssistantWithTextStreaming(id: string): MyUIMessage {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal assistant tail mid-stream
  return {
    id,
    role: messageRole.assistant,
    parts: [{ type: 'text', text: 'partial', state: 'streaming' }],
    metadata: { createdAt: 0 },
  } as MyUIMessage;
}

function makeAssistantWithToolState(id: string, toolState: 'input-streaming' | 'input-available'): MyUIMessage {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal tool part shape
  return {
    id,
    role: messageRole.assistant,
    parts: [
      {
        type: 'dynamic-tool',
        toolName: 'test_tool',
        toolCallId: 'call_1',
        state: toolState,
        input: {},
      },
    ],
    metadata: { createdAt: 0 },
  } as MyUIMessage;
}

describe('ChatMessagePlanning (reconnect-aware)', () => {
  it('T25: shows Reconnecting for unconcluded text tail when retryAttempt > 0', () => {
    const message = makeAssistantWithTextStreaming('msg_tail');
    setMockState({ status: 'error', messages: [message] });
    mockRetrySnapshot = { retryAttempt: 2, retryMaxAttempts: 5 };

    render(<ChatMessagePlanning messageId='msg_tail' />);

    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
  });

  it('T25: shows Reconnecting for input-streaming tool when retryAttempt > 0', () => {
    const message = makeAssistantWithToolState('msg_tool', 'input-streaming');
    setMockState({ status: 'error', messages: [message] });
    mockRetrySnapshot = { retryAttempt: 1, retryMaxAttempts: 5 };

    render(<ChatMessagePlanning messageId='msg_tool' />);

    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
  });

  it('T25: shows Reconnecting for input-available tool when retryAttempt > 0', () => {
    const message = makeAssistantWithToolState('msg_tool2', 'input-available');
    setMockState({ status: 'error', messages: [message] });
    mockRetrySnapshot = { retryAttempt: 3, retryMaxAttempts: 5 };

    render(<ChatMessagePlanning messageId='msg_tool2' />);

    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
  });

  it('T25: with retryAttempt 0, unconcluded parts do not show Planning under error status', () => {
    const message = makeAssistantWithTextStreaming('msg_tail');
    setMockState({ status: 'error', messages: [message] });
    mockRetrySnapshot = { retryAttempt: 0, retryMaxAttempts: 5 };

    const { container } = render(<ChatMessagePlanning messageId='msg_tail' />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "Planning" when retryAttempt is 0 and the chat is streaming', () => {
    const message = makeUserMessage('msg_1');
    setMockState({ status: 'streaming', messages: [message] });
    mockRetrySnapshot = { retryAttempt: 0, retryMaxAttempts: 5 };

    render(<ChatMessagePlanning messageId='msg_1' />);

    expect(screen.getByText(/Planning/)).toBeInTheDocument();
    expect(screen.getByText(/next moves\.{3}/)).toBeInTheDocument();
    expect(screen.queryByText(/Reconnecting/)).not.toBeInTheDocument();
  });

  it('renders "Reconnecting... N/M" when retryAttempt > 0', () => {
    const message = makeUserMessage('msg_1');
    setMockState({ status: 'error', messages: [message] });
    mockRetrySnapshot = { retryAttempt: 2, retryMaxAttempts: 5 };

    render(<ChatMessagePlanning messageId='msg_1' />);

    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
    expect(screen.getByText(/2\/5\.{3}/)).toBeInTheDocument();
    expect(screen.queryByText(/Planning/)).not.toBeInTheDocument();
  });

  it('relaxes the render gate to allow showing the indicator during chat.status === "error"', () => {
    const message = makeAssistantMessage('msg_assistant');
    setMockState({ status: 'error', messages: [message] });
    mockRetrySnapshot = { retryAttempt: 1, retryMaxAttempts: 5 };

    const { container } = render(<ChatMessagePlanning messageId='msg_assistant' />);

    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
  });

  it('does NOT render when retryAttempt is 0 AND status is not streaming/submitted', () => {
    const message = makeAssistantMessage('msg_assistant');
    setMockState({ status: 'error', messages: [message] });
    mockRetrySnapshot = { retryAttempt: 0, retryMaxAttempts: 5 };

    const { container } = render(<ChatMessagePlanning messageId='msg_assistant' />);

    expect(container.firstChild).toBeNull();
  });

  it('renders for the trailing user message when streaming', () => {
    const message = makeUserMessage('msg_1');
    setMockState({ status: 'submitted', messages: [message] });
    mockRetrySnapshot = { retryAttempt: 0, retryMaxAttempts: 5 };

    render(<ChatMessagePlanning messageId='msg_1' />);

    expect(screen.getByText(/Planning/)).toBeInTheDocument();
  });
});
