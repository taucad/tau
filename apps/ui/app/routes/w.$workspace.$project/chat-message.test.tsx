// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MyUIMessage, SkillMetadata } from '@taucad/chat';
import { ChatMessage } from '#routes/w.$workspace.$project/chat-message.js';

const { mockMessagesById, mockMessageOrder, mockStatus, mockSkillsCatalog } = vi.hoisted(() => ({
  mockMessagesById: new Map<string, MyUIMessage>(),
  mockMessageOrder: [] as string[],
  mockStatus: { value: 'ready' as 'ready' | 'streaming' | 'submitted' | 'error' },
  mockSkillsCatalog: [] as SkillMetadata[],
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
    regenerateTail: vi.fn(),
    stop: vi.fn(),
    messages: [],
    status: 'ready',
    error: undefined,
    agent: {
      profile: 'cad',
      execution: { kind: 'tau', model: 'openai-gpt-5.5' },
      kernel: 'replicad',
      mode: 'agent',
      toolChoice: 'auto',
      testingEnabled: true,
    },
  }),
}));

vi.mock('#hooks/use-skills-catalog.js', () => ({
  useSkillsCatalog: () => mockSkillsCatalog,
}));

vi.mock('#routes/w.$workspace.$project/chat-message-planning.js', () => ({
  ChatMessagePlanning({ messageId, className }: { readonly messageId: string; readonly className?: string }) {
    return (
      <div data-testid='chat-message-planning' data-message-id={messageId} className={className}>
        Planning next moves...
      </div>
    );
  },
}));

vi.mock('#routes/w.$workspace.$project/chat-message-reasoning.js', () => ({
  ChatMessageReasoning({ parts }: { readonly parts: ReadonlyArray<{ readonly text: string }> }) {
    return <div data-testid='chat-message-reasoning'>{parts.map((part) => part.text).join('|')}</div>;
  },
}));

vi.mock('#routes/w.$workspace.$project/chat-message-data-usage.js', () => ({
  ChatMessageDataUsage() {
    return <div data-testid='chat-message-data-usage' />;
  },
}));

vi.mock('#routes/w.$workspace.$project/chat-message-tool-use-skill.js', () => ({
  ChatMessageToolUseSkill({
    part,
  }: {
    readonly part: { output?: { skillName: string; skillPath?: string; resourceUri?: string } };
  }) {
    return (
      <div data-testid='chat-message-tool-use-skill'>
        {part.output?.skillName} {part.output?.skillPath ?? part.output?.resourceUri}
      </div>
    );
  },
}));

vi.mock('#routes/w.$workspace.$project/chat-message-context-compaction.js', () => ({
  ChatMessageContextCompaction() {
    return <div data-testid='chat-message-context-compaction' />;
  },
}));

vi.mock('#routes/w.$workspace.$project/chat-message-text.js', () => ({
  ChatMessageText({ part }: { readonly part: { text: string } }) {
    return <div data-testid='chat-message-text'>{part.text}</div>;
  },
}));

vi.mock('#routes/w.$workspace.$project/chat-message-file.js', () => ({
  ChatMessageFileAttachments() {
    return <div data-testid='chat-message-file-attachments' />;
  },
}));

vi.mock('#routes/w.$workspace.$project/chat-message-tool-web-search.js', () => ({
  ChatMessageToolWebSearch: () => <div data-testid='tool-web-search' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-web-browser.js', () => ({
  ChatMessageToolWebBrowser: () => <div data-testid='tool-web-browser' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-edit-file.js', () => ({
  ChatMessageToolFileEdit: () => <div data-testid='tool-edit-file' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-test-model.js', () => ({
  ChatMessageToolTestModel: () => <div data-testid='tool-test-model' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-read-file.js', () => ({
  ChatMessageToolReadFile: () => <div data-testid='tool-read-file' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-list-directory.js', () => ({
  ChatMessageToolListDirectory: () => <div data-testid='tool-list-directory' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-create-file.js', () => ({
  ChatMessageToolCreateFile: () => <div data-testid='tool-create-file' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-delete-file.js', () => ({
  ChatMessageToolDeleteFile: () => <div data-testid='tool-delete-file' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-grep.js', () => ({
  ChatMessageToolGrep: () => <div data-testid='tool-grep' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-glob-search.js', () => ({
  ChatMessageToolGlobSearch: () => <div data-testid='tool-glob-search' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-get-kernel-result.js', () => ({
  ChatMessageToolGetKernelResult: ({ part }: { readonly part: { readonly state: string } }) => (
    <div data-testid='tool-get-kernel-result' data-state={part.state} />
  ),
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-screenshot.js', () => ({
  ChatMessageToolScreenshot: () => <div data-testid='tool-screenshot' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-message-tool-unknown.js', () => ({
  ChatMessagePartUnknown: () => <div data-testid='tool-unknown' />,
}));

vi.mock('#components/chat/chat-textarea.js', () => ({
  ChatTextarea: () => <div data-testid='chat-textarea' />,
}));

vi.mock('#components/chat/at-reference-chip.js', () => ({
  AtReferenceChip: () => <span data-testid='at-reference-chip' />,
}));

vi.mock('#components/chat/context-chip.js', () => ({
  ContextChip: () => <span data-testid='context-chip' />,
}));

vi.mock('#components/chat/chat-activity-group.js', () => ({
  ChatActivityGroup: ({ children, summary }: { readonly children: React.ReactNode; readonly summary: string }) => (
    <div data-testid='chat-activity-group' data-summary={summary}>
      {children}
    </div>
  ),
}));

vi.mock('@taucad/ui/components/tooltip', () => ({
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

vi.mock('@taucad/ui/components/dropdown-menu', () => ({
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
  mockSkillsCatalog.length = 0;
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

  it('renders footer after ChatMessagePlanning and before the assistant action row', () => {
    setMessages([assistantMessage('msg-1', 'Hello there')]);

    render(<ChatMessage messageId='msg-1' footer={<div data-testid='revision-footer'>marker</div>} />);

    const planning = screen.getByTestId('chat-message-planning');
    const footer = screen.getByTestId('revision-footer');
    const copyButton = screen.getByTestId('copy-button');

    expect(planning.compareDocumentPosition(footer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(footer.compareDocumentPosition(copyButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

describe('ChatMessage use_skill tool rendering', () => {
  it('should render tool-use_skill inside the activity summary', () => {
    const message: MyUIMessage = {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-use_skill',
          toolCallId: 'tc-use-skill',
          state: 'output-available',
          input: { skillName: 'woodworking' },
          output: {
            skillName: 'woodworking',
            resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
            skillPath: '.agents/skills/woodworking/SKILL.md',
            baseDirectory: '.agents/skills/woodworking',
            source: 'user',
            frontmatter: {},
            content: '# Woodworking',
            supportingFiles: [],
          },
        },
      ],
    };
    setMessages([message]);

    render(<ChatMessage messageId='msg-1' />);

    expect(screen.getByTestId('chat-message-tool-use-skill')).toHaveTextContent('woodworking');
    expect(screen.queryByTestId('tool-unknown')).toBeNull();
  });
});

describe('ChatMessage activity composition', () => {
  it('nests reasoning runs inside the activity group, one thought per run', () => {
    const message: MyUIMessage = {
      id: 'msg-reasoning-chain',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'Inspecting the model', state: 'done' },
        { type: 'reasoning', text: 'Confirming dimensions', state: 'done' },
        {
          type: 'tool-read_file',
          toolCallId: 'read-1',
          state: 'input-available',
          input: { targetFile: 'main.scad' },
        },
        { type: 'reasoning', text: 'Preparing the answer', state: 'done' },
      ],
    };
    setMessages([message], 'streaming');

    render(<ChatMessage messageId={message.id} />);

    const group = screen.getByTestId('chat-activity-group');
    const reasoningBlocks = screen.getAllByTestId('chat-message-reasoning');
    expect(screen.getAllByTestId('chat-activity-group')).toHaveLength(1);
    expect(reasoningBlocks).toHaveLength(2);
    for (const block of reasoningBlocks) {
      expect(group).toContainElement(block);
    }
    expect(reasoningBlocks[0]).toHaveTextContent('Inspecting the model|Confirming dimensions');
    expect(reasoningBlocks[1]).toHaveTextContent('Preparing the answer');
    expect(group).toHaveAttribute('data-summary', 'Reading files');
  });
});

describe('ChatMessage assistant actions', () => {
  it('does not render retry actions below assistant messages', () => {
    setMessages([assistantMessage('msg-1', 'Hello there')]);

    render(<ChatMessage messageId='msg-1' />);

    expect(screen.queryByText('Switch model')).not.toBeInTheDocument();
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  });
});

describe('ChatMessage source part rendering', () => {
  it('should render source-url parts without throwing', () => {
    const message: MyUIMessage = {
      id: 'msg-source-url',
      role: 'assistant',
      parts: [
        {
          type: 'source-url',
          sourceId: 'source-1',
          url: 'https://example.com/source',
          title: 'External reference',
        },
      ],
    };
    setMessages([message]);

    render(<ChatMessage messageId='msg-source-url' />);

    const link = screen.getByRole('link', { name: 'External reference' });
    expect(link).toHaveAttribute('href', 'https://example.com/source');
  });

  it('should render source-document parts without throwing', () => {
    const message: MyUIMessage = {
      id: 'msg-source-document',
      role: 'assistant',
      parts: [
        {
          type: 'source-document',
          sourceId: 'source-2',
          mediaType: 'application/pdf',
          title: 'Design brief',
          filename: 'brief.pdf',
        },
      ],
    };
    setMessages([message]);

    render(<ChatMessage messageId='msg-source-document' />);

    expect(screen.getByRole('article')).toHaveTextContent('Design brief');
    expect(screen.getByRole('article')).toHaveTextContent('brief.pdf');
  });
});

describe('ChatMessage ACP session state', () => {
  it('renders the current ACP plan as one read-only plan surface', () => {
    const message: MyUIMessage = {
      id: 'msg-acp-plan',
      role: 'assistant',
      parts: [
        {
          type: 'data-acp-session',
          data: {
            type: 'acp-session',
            id: 'state-1',
            agentId: 'codex',
            commands: [],
            configOptions: [],
            plan: {
              type: 'items',
              entries: [
                { content: 'Inspect the model', priority: 'high', status: 'completed' },
                { content: 'Validate the kernel', priority: 'medium', status: 'in_progress' },
              ],
            },
          },
        },
      ],
    };
    setMessages([message]);

    render(<ChatMessage messageId='msg-acp-plan' />);

    expect(screen.getByRole('region', { name: 'Agent plan' })).toHaveTextContent('Inspect the model');
    expect(screen.getByRole('region', { name: 'Agent plan' })).toHaveTextContent('Validate the kernel');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('keeps unsafe ACP plan links inert and strips display controls', () => {
    const message: MyUIMessage = {
      id: 'msg-acp-unsafe-plan',
      role: 'assistant',
      parts: [
        {
          type: 'data-acp-session',
          data: {
            type: 'acp-session',
            id: 'state-unsafe',
            agentId: 'codex',
            commands: [],
            configOptions: [],
            // oxlint-disable-next-line eslint/no-script-url -- Malicious fixture verifies unsafe schemes stay inert.
            plan: { type: 'file', planId: 'plan-unsafe', uri: 'javascript:alert(1)\u202E' },
          },
        },
      ],
    };
    setMessages([message]);

    render(<ChatMessage messageId='msg-acp-unsafe-plan' />);

    expect(screen.queryByRole('link')).toBeNull();
    // oxlint-disable-next-line eslint/no-script-url -- Assertion names the malicious fixture literally.
    expect(screen.getByRole('region', { name: 'Agent plan' })).toHaveTextContent('javascript:alert(1)');
    expect(screen.getByRole('region', { name: 'Agent plan' }).textContent).not.toContain('\u202E');
  });
});

describe('ChatMessage external Tau MCP porcelain', () => {
  it('renders a qualified dynamic call with the existing native card', () => {
    const message: MyUIMessage = {
      id: 'msg-acp-kernel',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolCallId: 'call-kernel',
          toolName: 'get_kernel_result',
          state: 'output-available',
          input: { targetFile: 'main.ts' },
          output: { status: 'ready' },
          toolMetadata: {
            tau: { origin: 'external', nativeName: 'get_kernel_result', presentation: 'tau-mcp' },
          },
        },
      ],
    };
    setMessages([message]);

    render(<ChatMessage messageId={message.id} />);

    expect(screen.getByTestId('tool-get-kernel-result')).toBeInTheDocument();
    expect(screen.queryByTestId('tool-unknown')).toBeNull();
  });

  it('does not grant native porcelain to an unqualified same-name call', () => {
    const message: MyUIMessage = {
      id: 'msg-foreign-kernel',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolCallId: 'call-foreign-kernel',
          toolName: 'get_kernel_result',
          state: 'output-available',
          input: { targetFile: 'main.ts' },
          output: { status: 'ready' },
          toolMetadata: { tau: { origin: 'external', nativeName: 'get_kernel_result' } },
        },
      ],
    };
    setMessages([message]);

    render(<ChatMessage messageId={message.id} />);

    expect(screen.queryByTestId('tool-get-kernel-result')).toBeNull();
  });

  it('keeps a preliminary qualified call in the same native loading card', () => {
    const preliminaryPart = {
      type: 'dynamic-tool',
      toolCallId: 'call-preliminary-kernel',
      toolName: 'get_kernel_result',
      state: 'output-available',
      input: { targetFile: 'main.scad' },
      output: { status: 'pending' },
      preliminary: true,
      toolMetadata: {
        tau: { origin: 'external', nativeName: 'get_kernel_result', presentation: 'tau-mcp' },
      },
    };
    const message: MyUIMessage = {
      id: 'msg-preliminary-kernel',
      role: 'assistant',
      parts: [preliminaryPart as MyUIMessage['parts'][number]],
    };
    setMessages([message], 'streaming');

    render(<ChatMessage messageId={message.id} />);

    expect(screen.getByTestId('chat-activity-group')).toHaveAttribute('data-summary', 'Rendering models');
    expect(screen.getByTestId('tool-get-kernel-result')).toHaveAttribute('data-state', 'input-available');
  });
});

describe('ChatMessage slash command rendering', () => {
  const longMessageWith = (line: string): string =>
    [line, ...Array.from({ length: 10 }, (_, index) => `filler line ${index}`)].join('\n');

  it('should render /create-skill as a skill chip when rehydrating message text', () => {
    mockSkillsCatalog.push({
      name: 'create-skill',
      description: 'Create or update a skill',
      resourceUri: 'system:skills/create-skill/SKILL.md',
      source: 'system',
      version: '1.0.0',
      fingerprint: 'test-create-skill',
      enabled: true,
      shadowedSources: [],
    });
    setMessages([userMessage('msg-1', longMessageWith('Use /create-skill now'))]);

    render(<ChatMessage messageId='msg-1' />);

    expect(screen.getByTestId('context-chip')).toBeInTheDocument();
  });

  it('should render /plan text without turning it into a skill chip', () => {
    setMessages([userMessage('msg-1', longMessageWith('Please do /plan later'))]);

    render(<ChatMessage messageId='msg-1' />);

    expect(screen.getByRole('article')).toHaveTextContent('Please do /plan later');
    expect(screen.queryByTestId('context-chip')).toBeNull();
  });

  it('should render unknown slash text without turning it into a skill chip', () => {
    setMessages([userMessage('msg-1', longMessageWith('Please do /nonsense later'))]);

    render(<ChatMessage messageId='msg-1' />);

    expect(screen.getByRole('article')).toHaveTextContent('Please do /nonsense later');
    expect(screen.queryByTestId('context-chip')).toBeNull();
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
    const bubble = article.querySelector<HTMLDivElement>('[class*="cursor-action"]');
    if (!(bubble instanceof HTMLDivElement)) {
      throw new Error('user bubble not found');
    }

    fireEvent.click(bubble);

    expectNoStickyTokens(article);
  });

  it('should keyboard-activate the editable user-message bubble', () => {
    setMessages([userMessage('msg-1', 'go')]);

    render(<ChatMessage messageId='msg-1' />);

    const article = screen.getByRole('article');
    expect(screen.queryByTestId('chat-textarea')).toBeNull();

    const bubble = article.querySelector<HTMLDivElement>('[class*="cursor-action"]');
    if (!(bubble instanceof HTMLDivElement)) {
      throw new Error('user bubble not found');
    }
    expect(bubble).toHaveAttribute('role', 'button');
    expect(bubble).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(bubble, { key: 'Enter' });

    const textarea = screen.getByTestId('chat-textarea');
    expect(article.contains(textarea)).toBe(true);
  });
});

it('shows generic diagnostics for an unsupported historical static tool', () => {
  const message: MyUIMessage = {
    id: 'msg-unknown',
    role: 'assistant',
    parts: [
      {
        type: 'tool-unregistered_operation',
        toolCallId: 'unknown',
        state: 'output-available',
        input: {},
        output: 'Old result',
      } as unknown as MyUIMessage['parts'][number],
    ],
  };
  setMessages([message]);
  render(<ChatMessage messageId='msg-unknown' />);
  expect(screen.getByTestId('tool-unknown')).toBeInTheDocument();
});

/*
 * V6. The transcript is history: a message an external agent produced says so,
 * from its own durable usage record, whatever the composer is selected on now.
 * A Tau turn shows nothing — the model selector already names its model.
 */
describe('external attribution badge', () => {
  const usagePart = (data: Record<string, unknown>): MyUIMessage['parts'][number] =>
    ({
      type: 'data-usage',
      data: {
        type: 'usage',
        id: 'usage-1',
        model: 'gpt-5.3-codex',
        inputTokens: 1200,
        outputTokens: 300,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokensCost: 0,
        outputTokensCost: 0,
        cacheReadTokensCost: 0,
        cacheWriteTokensCost: 0,
        totalCost: 0,
        ...data,
      },
    }) as unknown as MyUIMessage['parts'][number];

  it('names the external agent and the model its usage recorded', () => {
    setMessages([{ id: 'msg-external', role: 'assistant', parts: [usagePart({ agent: 'codex' })] }]);

    render(<ChatMessage messageId='msg-external' />);

    expect(screen.getByText('codex · gpt-5.3-codex')).toBeInTheDocument();
  });

  it('shows no badge on a Tau turn', () => {
    setMessages([{ id: 'msg-tau', role: 'assistant', parts: [usagePart({ model: 'openai-gpt-5.5' })] }]);

    render(<ChatMessage messageId='msg-tau' />);

    expect(screen.queryByText(/openai-gpt-5\.5/u)).not.toBeInTheDocument();
  });
});
