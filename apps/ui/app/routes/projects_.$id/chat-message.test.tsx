// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MyUIMessage } from '@taucad/chat';
import { ChatMessage } from '#routes/projects_.$id/chat-message.js';

const { mockMessagesById, mockMessageOrder, mockStatus } = vi.hoisted(() => ({
  mockMessagesById: new Map<string, MyUIMessage>(),
  mockMessageOrder: [] as string[],
  mockStatus: { value: 'ready' as 'ready' | 'streaming' | 'submitted' | 'error' },
}));

const getMockChatSelectorState = (): {
  messages: MyUIMessage[];
  messagesById: Map<string, MyUIMessage>;
  messageEdits: Record<string, MyUIMessage>;
  messageOrder: string[];
  status: 'ready' | 'streaming' | 'submitted' | 'error';
} => {
  const messages = mockMessageOrder.map((id) => {
    const message = mockMessagesById.get(id);
    if (!message) {
      throw new Error(`mockMessagesById missing id ${id}`);
    }

    return message;
  });
  return {
    messages,
    messagesById: mockMessagesById,
    messageEdits: {},
    messageOrder: mockMessageOrder,
    status: mockStatus.value,
  };
};

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector<T>(selector: (state: ReturnType<typeof getMockChatSelectorState>) => T): T {
    return selector(getMockChatSelectorState());
  },
  useChatActions() {
    return {
      editMessage: vi.fn(),
      retryMessage: vi.fn(),
      startEditingMessage: vi.fn(),
      exitEditMode: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

vi.mock('#chat-clients/use-cad-chat-client.js', () => ({
  useCadChatClient: () => ({
    submit: vi.fn(),
    edit: vi.fn(),
    retry: vi.fn(),
    regenerateTail: vi.fn(),
    stop: vi.fn(),
    messages: [],
    status: 'ready',
    error: undefined,
    agent: {
      profile: 'cad',
      model: 'openai-gpt-5.5',
      kernel: 'replicad',
      mode: 'agent',
      toolChoice: 'auto',
      testingEnabled: true,
    },
  }),
}));

vi.mock('#routes/projects_.$id/chat-message-planning.js', () => ({
  ChatMessagePlanning({ messageId, className }: { readonly messageId: string; readonly className?: string }) {
    return (
      <div data-testid='chat-message-planning' data-message-id={messageId} className={className}>
        Planning next moves...
      </div>
    );
  },
}));

vi.mock('#routes/projects_.$id/chat-message-reasoning.js', () => ({
  ChatMessageReasoning() {
    return <div data-testid='chat-message-reasoning' />;
  },
}));

vi.mock('#routes/projects_.$id/chat-message-data-usage.js', () => ({
  ChatMessageDataUsage() {
    return <div data-testid='chat-message-data-usage' />;
  },
}));

vi.mock('#routes/projects_.$id/chat-message-context-compaction.js', () => ({
  ChatMessageContextCompaction() {
    return <div data-testid='chat-message-context-compaction' />;
  },
}));

vi.mock('#routes/projects_.$id/chat-message-text.js', () => ({
  ChatMessageText({ part }: { readonly part: { text: string } }) {
    return <div data-testid='chat-message-text'>{part.text}</div>;
  },
}));

vi.mock('#routes/projects_.$id/chat-message-file.js', () => ({
  ChatMessageFile() {
    return <div data-testid='chat-message-file' />;
  },
}));

vi.mock('#routes/projects_.$id/chat-message-tool-web-search.js', () => ({
  ChatMessageToolWebSearch: () => <div data-testid='tool-web-search' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-web-browser.js', () => ({
  ChatMessageToolWebBrowser: () => <div data-testid='tool-web-browser' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-edit-file.js', () => ({
  ChatMessageToolFileEdit: () => <div data-testid='tool-edit-file' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-test-model.js', () => ({
  ChatMessageToolTestModel: () => <div data-testid='tool-test-model' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-edit-tests.js', () => ({
  ChatMessageToolEditTests: () => <div data-testid='tool-edit-tests' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-read-file.js', () => ({
  ChatMessageToolReadFile: () => <div data-testid='tool-read-file' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-list-directory.js', () => ({
  ChatMessageToolListDirectory: () => <div data-testid='tool-list-directory' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-create-file.js', () => ({
  ChatMessageToolCreateFile: () => <div data-testid='tool-create-file' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-delete-file.js', () => ({
  ChatMessageToolDeleteFile: () => <div data-testid='tool-delete-file' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-grep.js', () => ({
  ChatMessageToolGrep: () => <div data-testid='tool-grep' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-glob-search.js', () => ({
  ChatMessageToolGlobSearch: () => <div data-testid='tool-glob-search' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-get-kernel-result.js', () => ({
  ChatMessageToolGetKernelResult: () => <div data-testid='tool-get-kernel-result' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-screenshot.js', () => ({
  ChatMessageToolScreenshot: () => <div data-testid='tool-screenshot' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-unknown.js', () => ({
  ChatMessagePartUnknown: () => <div data-testid='tool-unknown' />,
}));
vi.mock('#routes/projects_.$id/chat-message-tool-transfer.js', () => ({
  ChatMessageToolTransfer: () => <div data-testid='tool-transfer' />,
}));

vi.mock('#components/chat/chat-textarea.js', () => ({
  ChatTextarea: () => <div data-testid='chat-textarea' />,
}));

vi.mock('#components/chat/chat-model-selector.js', () => ({
  ChatModelSelector: ({ children }: { readonly children: unknown }) => {
    if (typeof children === 'function') {
      const renderProperty = children as (context: { selectedModel: { name: string } }) => React.ReactNode;
      return <div data-testid='chat-model-selector'>{renderProperty({ selectedModel: { name: 'mock' } })}</div>;
    }
    return <div data-testid='chat-model-selector' />;
  },
}));

vi.mock('#components/chat/at-reference-chip.js', () => ({
  AtReferenceChip: () => <span data-testid='at-reference-chip' />,
}));

vi.mock('#components/chat/context-chip.js', () => ({
  ContextChip: () => <span data-testid='context-chip' />,
}));

vi.mock('#components/chat/chat-activity-group.js', () => ({
  ChatActivityGroup: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='chat-activity-group'>{children}</div>
  ),
}));

vi.mock('#components/chat/chat-activity-section.js', () => ({
  ChatActivitySection: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='chat-activity-section'>{children}</div>
  ),
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { readonly children: React.ReactNode }) => <div data-testid='tooltip'>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='tooltip-trigger'>{children}</div>
  ),
  TooltipContent: ({ children }: { readonly children: React.ReactNode }) => (
    <span data-testid='tooltip-content'>{children}</span>
  ),
}));

vi.mock('#components/copy-button.js', () => ({
  CopyButton: () => <div data-testid='copy-button' />,
}));

vi.mock('#components/ui/dropdown-menu.js', () => ({
  DropdownMenu: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='dropdown-menu'>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='dropdown-menu-trigger'>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='dropdown-menu-content'>{children}</div>
  ),
  DropdownMenuItem: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='dropdown-menu-item'>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr data-testid='dropdown-menu-separator' />,
  DropdownMenuLabel: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='dropdown-menu-label'>{children}</div>
  ),
}));

const setMessages = (messages: MyUIMessage[], status: 'ready' | 'streaming' = 'ready'): void => {
  mockMessagesById.clear();
  mockMessageOrder.length = 0;
  for (const message of messages) {
    mockMessagesById.set(message.id, message);
    mockMessageOrder.push(message.id);
  }
  mockStatus.value = status;
};

const userMessage = (id: string, text: string): MyUIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text, state: 'done' }],
});

const assistantMessage = (id: string, text: string): MyUIMessage => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text, state: 'done' }],
});

const getColumnWrapper = (): HTMLDivElement => {
  const article = screen.getByRole('article');
  const wrapper = article.firstElementChild;
  if (!(wrapper instanceof HTMLDivElement)) {
    throw new Error('column wrapper not found');
  }
  return wrapper;
};

afterEach(() => {
  cleanup();
  mockMessagesById.clear();
  mockMessageOrder.length = 0;
  mockStatus.value = 'ready';
});

describe('ChatMessage column wrapper layout', () => {
  it('should not create a nested scroll area on the message column wrapper for user messages', () => {
    setMessages([userMessage('msg-1', 'go')]);

    render(<ChatMessage messageId='msg-1' />);

    const wrapper = getColumnWrapper();
    expect(wrapper.className).not.toContain('overflow-y-auto');
    expect(wrapper.className).not.toContain('overflow-y-scroll');
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('flex-col');
    expect(wrapper.className).toContain('space-y-2');
    expect(wrapper.className).toContain('w-full');
    expect(wrapper.className).toContain('mx-2');
  });

  it('should not create a nested scroll area on the message column wrapper for assistant messages', () => {
    setMessages([assistantMessage('msg-1', 'Hello there')]);

    render(<ChatMessage messageId='msg-1' />);

    const wrapper = getColumnWrapper();
    expect(wrapper.className).not.toContain('overflow-y-auto');
    expect(wrapper.className).not.toContain('overflow-y-scroll');
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('flex-col');
    expect(wrapper.className).toContain('space-y-2');
    expect(wrapper.className).toContain('w-full');
    expect(wrapper.className).toContain('mx-4');
  });

  it('should still mount ChatMessagePlanning as a sibling of the message bubble inside the column wrapper', () => {
    setMessages([userMessage('msg-1', 'go')]);

    render(<ChatMessage messageId='msg-1' />);

    const wrapper = getColumnWrapper();
    const planning = screen.getByTestId('chat-message-planning');
    expect(planning.parentElement).toBe(wrapper);
    expect(planning.dataset['messageId']).toBe('msg-1');
  });

  it('should cap collapsed long user bubbles at max-h-58.5 for parity with focused ChatTextarea, without nested Virtuoso scroll', () => {
    const longText = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    setMessages([userMessage('msg-1', longText)]);

    render(<ChatMessage messageId='msg-1' />);

    const wrapper = getColumnWrapper();
    const innerBubble = wrapper.firstElementChild;
    if (!(innerBubble instanceof HTMLDivElement)) {
      throw new Error('inner bubble not found');
    }

    expect(innerBubble.className).toContain('max-h-58.5');
    expect(innerBubble.className).toContain('overflow-hidden');
    expect(innerBubble.querySelector('[data-testid="virtuoso-scroller"]')).toBeNull();

    expect(wrapper.className).not.toContain('overflow-y-auto');
    expect(wrapper.className).not.toContain('overflow-y-scroll');

    const rowsWrap = innerBubble.querySelector('.flex.flex-col.gap-1');
    expect(rowsWrap).not.toBeNull();
    expect(rowsWrap!.querySelectorAll('p').length).toBeGreaterThan(0);
  });
});

// Regression guard: every variant of `position: sticky` on user-message
// articles produced a multi-hundred-px viewport jump on wheel-up from the
// scroll-bottom of a multi-turn chat. If any future edit reintroduces sticky
// tokens on the article wrapper, these assertions will fail.
describe('ChatMessage article wrapper — no sticky positioning (regression guard)', () => {
  const stickyTokens = ['sticky', 'top-1', 'z-10'];

  const expectNoStickyTokens = (article: HTMLElement): void => {
    for (const token of stickyTokens) {
      expect(article.className).not.toContain(token);
    }
  };

  it('should not apply sticky positioning classes to a user-message article', () => {
    setMessages([userMessage('msg-1', 'go')]);

    render(<ChatMessage messageId='msg-1' />);

    expectNoStickyTokens(screen.getByRole('article'));
  });

  it('should not apply sticky positioning classes to an assistant-message article', () => {
    setMessages([assistantMessage('msg-1', 'Hello there')]);

    render(<ChatMessage messageId='msg-1' />);

    expectNoStickyTokens(screen.getByRole('article'));
  });

  it('should not apply sticky positioning classes to a user-message article while it is being edited', () => {
    setMessages([userMessage('msg-1', 'go')]);

    render(<ChatMessage messageId='msg-1' />);

    const article = screen.getByRole('article');
    const bubble = article.querySelector<HTMLDivElement>('[class*="cursor-pointer"]');
    if (!(bubble instanceof HTMLDivElement)) {
      throw new Error('user bubble not found');
    }

    fireEvent.click(bubble);

    expectNoStickyTokens(article);
  });

  it('should render the editing textarea inside the user-message article when isEditing && isUser', () => {
    setMessages([userMessage('msg-1', 'go')]);

    render(<ChatMessage messageId='msg-1' />);

    const article = screen.getByRole('article');
    expect(screen.queryByTestId('chat-textarea')).toBeNull();

    const bubble = article.querySelector<HTMLDivElement>('[class*="cursor-pointer"]');
    if (!(bubble instanceof HTMLDivElement)) {
      throw new Error('user bubble not found');
    }
    fireEvent.click(bubble);

    const textarea = screen.getByTestId('chat-textarea');
    expect(article.contains(textarea)).toBe(true);
  });
});
