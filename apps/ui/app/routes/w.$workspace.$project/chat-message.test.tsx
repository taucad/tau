// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { MyUIMessage, SkillMetadata, ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessage } from '#routes/w.$workspace.$project/chat-message.js';
import { AtReferenceProvider } from '#components/chat/at-reference-context.js';

const { mockMessagesById, mockMessageOrder, mockStatus, mockSkillsCatalog, mockStartEditingMessage, textRenderCounts } =
  vi.hoisted(() => ({
    mockMessagesById: new Map<string, MyUIMessage>(),
    mockMessageOrder: [] as string[],
    mockStatus: { value: 'ready' as 'ready' | 'streaming' | 'submitted' | 'error' },
    mockSkillsCatalog: [] as SkillMetadata[],
    mockStartEditingMessage: vi.fn(),
    textRenderCounts: new Map<string, number>(),
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
      startEditingMessage: mockStartEditingMessage,
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

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useWorkbenchLayoutController: () => ({
    snapshot: () => undefined,
    subscribe: () => () => undefined,
    restorePreviousArrangement: async () => false,
  }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ appliedWorkbenchRevisions: new Map(), appliedEntryRevisions: new Map() }),
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useWorkbenchLayoutController: () => ({
    snapshot: () => undefined,
    subscribe: () => () => undefined,
    restorePreviousArrangement: async () => false,
  }),
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
    textRenderCounts.set(part.text, (textRenderCounts.get(part.text) ?? 0) + 1);
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
vi.mock('#routes/w.$workspace.$project/chat-message-tool-request-job.js', () => ({
  ChatMessageToolRequestJob: ({ part }: { readonly part: { readonly state: string } }) => (
    <div data-testid='tool-request-job' data-state={part.state} />
  ),
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
  ChatActivityGroup: ({
    children,
    summary,
    hasActiveRows,
    isActive,
  }: {
    readonly children: React.ReactNode;
    readonly summary: string;
    readonly hasActiveRows?: boolean;
    readonly isActive?: boolean;
  }) => (
    <div
      data-testid='chat-activity-group'
      data-summary={summary}
      data-active-rows={String(hasActiveRows ?? false)}
      hidden={!isActive}
    >
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
  textRenderCounts.clear();
});

describe('ChatMessage completed activity rendering', () => {
  it('renders a completed paragraph once while the active tail receives five updates', () => {
    const completed: MyUIMessage['parts'][number] = { type: 'text', text: 'Completed paragraph', state: 'done' };
    setMessages(
      [{ id: 'stream', role: 'assistant', parts: [completed, { type: 'text', text: 'Live 0', state: 'streaming' }] }],
      'streaming',
    );
    const view = render(<ChatMessage messageId='stream' footer={<span>0</span>} />);
    for (let index = 1; index <= 5; index++) {
      setMessages(
        [
          {
            id: 'stream',
            role: 'assistant',
            parts: [completed, { type: 'text', text: `Live ${String(index)}`, state: 'streaming' }],
          },
        ],
        'streaming',
      );
      view.rerender(<ChatMessage messageId='stream' footer={<span>{index}</span>} />);
    }
    expect(screen.getByText('Live 5')).toBeDefined();
    expect(textRenderCounts.get('Completed paragraph')).toBe(1);
    expect([...textRenderCounts].filter(([text]) => text.startsWith('Live')).map(([, count]) => count)).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
  });
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

  it('attaches the footer to the user bubble and puts the indicator below both', () => {
    setMessages([userMessage('msg-1', 'go')]);

    render(<ChatMessage messageId='msg-1' footer={<div data-testid='revision-footer'>marker</div>} />);

    const wrapper = getColumnWrapper();
    const planning = screen.getByTestId('chat-message-planning');
    const footer = screen.getByTestId('revision-footer');
    const bubble = screen.getByRole('button', { name: 'go' });
    /* Bubble and card share one gapless surface; the indicator is the column's last row (R2, R11). */
    expect(footer.parentElement).toBe(bubble.parentElement);
    expect(bubble.className).toContain('z-10');
    expect(bubble.className).toContain('rounded-lg');
    expect(planning.parentElement).toBe(wrapper);
    expect(wrapper.lastElementChild).toBe(planning);
    expect(planning.dataset['messageId']).toBe('msg-1');
  });

  it('renders the assistant indicator flush after its parts and before the action row', () => {
    setMessages([assistantMessage('msg-1', 'Hello there')]);

    render(<ChatMessage messageId='msg-1' />);

    const planning = screen.getByTestId('chat-message-planning');
    const text = screen.getByText('Hello there');
    const copyButton = screen.getByTestId('copy-button');

    expect(text.compareDocumentPosition(planning)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(planning.compareDocumentPosition(copyButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(planning.parentElement?.className).toContain('gap-0');
    expect(planning.className).toBe('');
  });

  it('should cap collapsed long user bubbles at max-h-60.5 for parity with focused ChatTextarea, without nested Virtuoso scroll', () => {
    const longText = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    setMessages([userMessage('msg-1', longText)]);

    render(<ChatMessage messageId='msg-1' />);

    const wrapper = getColumnWrapper();
    const innerBubble = wrapper.firstElementChild?.firstElementChild;
    if (!(innerBubble instanceof HTMLDivElement)) {
      throw new Error('inner bubble not found');
    }

    expect(innerBubble.className).toContain('max-h-60.5');
    expect(innerBubble.className).toContain('overflow-hidden');
    expect(innerBubble.querySelector('[data-testid="virtuoso-scroller"]')).toBeNull();

    expect(wrapper.className).not.toContain('overflow-y-auto');
    expect(wrapper.className).not.toContain('overflow-y-scroll');

    const rowsWrap = innerBubble.querySelector('.flex.flex-col.gap-1');
    expect(rowsWrap).not.toBeNull();
    expect(rowsWrap!.querySelectorAll('p').length).toBeGreaterThan(0);
  });

  it.each([
    ['one long line', 'x'.repeat(100_000)],
    ['many lines', 'x\n'.repeat(50_000)],
  ])('bounds the collapsed preview for %s while retaining the full edit text', (_label, fullText) => {
    setMessages([userMessage('msg-1', fullText)]);
    render(<ChatMessage messageId='msg-1' />);

    const bubble = getColumnWrapper().firstElementChild?.firstElementChild;
    if (!(bubble instanceof HTMLElement)) {
      throw new Error('User bubble missing');
    }
    expect(bubble.querySelectorAll('p').length).toBeLessThanOrEqual(9);
    expect(bubble.textContent.length).toBeLessThan(2100);
    fireEvent.click(bubble);
    expect(mockStartEditingMessage).toHaveBeenCalledWith('msg-1');
    expect(screen.getByTestId('chat-textarea')).toBeInTheDocument();
    expect(mockMessagesById.get('msg-1')?.parts[0]).toMatchObject({ text: fullText });
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

  it('marks the trailing group busy while its last thought still streams behind settled tools (resting block R3)', () => {
    const message: MyUIMessage = {
      id: 'msg-resting-thought',
      role: 'assistant',
      parts: [
        {
          type: 'tool-read_file',
          toolCallId: 'read-1',
          state: 'output-available',
          input: { targetFile: 'main.scad' },
          output: { content: '', size: 0, contentKind: 'text', totalLines: 0 },
        },
        { type: 'reasoning', text: '**Refining blade geometry**', state: 'streaming' },
      ],
    };
    setMessages([message], 'streaming');

    render(<ChatMessage messageId={message.id} />);

    expect(screen.getByTestId('chat-activity-group')).toHaveAttribute('data-active-rows', 'true');
  });

  it('does not mark a group busy for a streaming thought once the message has settled', () => {
    const message: MyUIMessage = {
      id: 'msg-stale-thought',
      role: 'assistant',
      parts: [
        {
          type: 'tool-read_file',
          toolCallId: 'read-1',
          state: 'output-available',
          input: { targetFile: 'main.scad' },
          output: { content: '', size: 0, contentKind: 'text', totalLines: 0 },
        },
        { type: 'reasoning', text: 'Left open by a failed run', state: 'streaming' },
      ],
    };
    setMessages([message], 'ready');

    render(<ChatMessage messageId={message.id} />);

    expect(screen.getByTestId('chat-activity-group')).toHaveAttribute('data-active-rows', 'false');
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

  it.each([
    // oxlint-disable-next-line no-script-url -- the hostile URL under test.
    'javascript:alert(1)',
    'data:text/html,<p>hi</p>',
    'not a url',
  ])('should render a %s source-url as text, not a link', (url) => {
    const message: MyUIMessage = {
      id: 'msg-unsafe-source-url',
      role: 'assistant',
      parts: [{ type: 'source-url', sourceId: 'source-1', url, title: 'Unsafe reference' }],
    };
    setMessages([message]);

    render(<ChatMessage messageId='msg-unsafe-source-url' />);

    expect(screen.getByText('Unsafe reference')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Unsafe reference' })).not.toBeInTheDocument();
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

describe('ChatMessage agent media', () => {
  it("renders an agent's image in place, between its words, and not in the user attachment strip", () => {
    const message: MyUIMessage = {
      id: 'msg-render',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Here is the render.' },
        { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,iVBORw0K' },
        { type: 'text', text: 'Saved beside the project.' },
      ],
    };
    setMessages([message]);

    render(<ChatMessage messageId='msg-render' />);

    const article = screen.getByRole('article');
    const image = within(article).getByRole('img', { name: 'Agent image' });
    const [before, after] = within(article).getAllByTestId('chat-message-text');
    // oxlint-disable-next-line eslint/no-bitwise -- compareDocumentPosition returns a bitmask.
    expect(before!.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // oxlint-disable-next-line eslint/no-bitwise -- compareDocumentPosition returns a bitmask.
    expect(image.compareDocumentPosition(after!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('chat-message-file-attachments')).not.toBeInTheDocument();
  });

  it("keeps a user's attachments in the strip above their message", () => {
    setMessages([
      {
        id: 'msg-user-file',
        role: 'user',
        parts: [
          { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,iVBORw0K' },
          { type: 'text', text: 'Render this' },
        ],
      },
    ]);

    render(<ChatMessage messageId='msg-user-file' />);

    expect(screen.getByTestId('chat-message-file-attachments')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Agent image' })).not.toBeInTheDocument();
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
  it.each(['direct', 'qualified MCP'] as const)(
    'should keep the %s arrangement standalone and its routine details collapsed',
    (carrier) => {
      const digest: `sha256:${string}` = `sha256:${'a'.repeat(64)}`;
      const arrangement: Extract<ToolInvocation<typeof toolName.arrangeWorkbench>, { state: 'output-available' }> = {
        toolCallId: 'arrange-1',
        state: 'output-available',
        input: { views: [{ id: 'front', name: 'Front' }] },
        output: {
          status: 'written',
          revisions: [{ path: '.tau/workbench/layout.json', digest, previousDigest: 'missing' }],
          visible: [{ kind: 'view', view: 'front' }],
        },
      };
      const message: MyUIMessage = {
        id: `msg-${carrier}`,
        role: 'assistant',
        parts: [
          {
            type: 'tool-read_file',
            toolCallId: 'read-1',
            state: 'output-available',
            input: { targetFile: 'main.scad' },
            output: { content: '', size: 0, contentKind: 'text', totalLines: 0 },
          },
          carrier === 'direct'
            ? { type: 'tool-arrange_workbench', ...arrangement }
            : {
                type: 'dynamic-tool',
                toolName: 'arrange_workbench',
                ...arrangement,
                toolMetadata: { tau: { origin: 'external', nativeName: 'arrange_workbench', presentation: 'tau-mcp' } },
              },
        ],
      };
      setMessages([message]);

      render(<ChatMessage messageId={message.id} />);

      expect(screen.getByTestId('chat-activity-group')).toHaveAttribute('data-summary', 'Read files');
      expect(screen.getByText('Arranged')).toBeVisible();
      expect(screen.getByRole('status')).toHaveTextContent('Written');
      expect(screen.queryByRole('button', { name: 'Restore previous layout' })).toBeNull();
      const header = screen.getByRole('button', { name: /Arranged 1 view/u });
      expect(header).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(header);
      expect(screen.getByRole('button', { name: 'Restore previous layout' })).toBeDisabled();
    },
  );

  it.each(['direct', 'qualified MCP'] as const)(
    'should expose %s interruption/denial and treat preliminary MCP output as running',
    (carrier) => {
      const call = { toolCallId: 'arrange-running', input: {}, state: 'input-available' } as const;
      let message: MyUIMessage = {
        id: `states-${carrier}`,
        role: 'assistant',
        parts: [
          carrier === 'direct'
            ? { type: 'tool-arrange_workbench', ...call }
            : {
                type: 'dynamic-tool',
                toolName: 'arrange_workbench',
                ...call,
                state: 'output-available',
                output: {},
                preliminary: true,
                toolMetadata: { tau: { nativeName: 'arrange_workbench', presentation: 'tau-mcp' } },
              },
        ],
      };
      setMessages([message]);
      const rendered = render(<ChatMessage messageId={message.id} />);
      expect(screen.getByRole('button', { name: 'Arranging workbench' })).toBeVisible();
      message = {
        ...message,
        parts: [
          carrier === 'direct'
            ? {
                type: 'tool-arrange_workbench',
                ...call,
                state: 'output-denied',
                approval: { id: 'decision', approved: false },
              }
            : {
                type: 'dynamic-tool',
                toolName: 'arrange_workbench',
                ...call,
                state: 'output-denied',
                approval: { id: 'decision', approved: false },
                toolMetadata: { tau: { nativeName: 'arrange_workbench', presentation: 'tau-mcp' } },
              },
        ],
      };
      setMessages([message]);
      rendered.rerender(<ChatMessage key='denied' messageId={message.id} />);
      expect(screen.getByRole('button', { name: 'Denied workbench' })).toBeVisible();
      const errorText = JSON.stringify({ errorCode: 'USER_INTERRUPTED', message: 'Interrupted by operator' });
      message = {
        ...message,
        parts: [
          carrier === 'direct'
            ? { type: 'tool-arrange_workbench', ...call, state: 'output-error', errorText }
            : {
                type: 'dynamic-tool',
                toolName: 'arrange_workbench',
                ...call,
                state: 'output-error',
                errorText,
                toolMetadata: { tau: { nativeName: 'arrange_workbench', presentation: 'tau-mcp' } },
              },
        ],
      };
      setMessages([message]);
      rendered.rerender(<ChatMessage key='interrupted' messageId={message.id} />);
      expect(screen.getByRole('alert')).toHaveTextContent('outcome is unconfirmed');
      expect(screen.queryByTestId('chat-activity-group')).toBeNull();
    },
  );

  it('renders a qualified dynamic call with the existing native card', () => {
    const message: MyUIMessage = {
      id: 'msg-acp-kernel',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolCallId: 'call-kernel',
          toolName: 'evaluate_model',
          state: 'output-available',
          input: { targetFile: 'main.ts' },
          output: { status: 'ready' },
          toolMetadata: {
            tau: { origin: 'external', nativeName: 'evaluate_model', presentation: 'tau-mcp' },
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
          toolName: 'evaluate_model',
          state: 'output-available',
          input: { targetFile: 'main.ts' },
          output: { status: 'ready' },
          toolMetadata: { tau: { origin: 'external', nativeName: 'evaluate_model' } },
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
      toolName: 'evaluate_model',
      state: 'output-available',
      input: { targetFile: 'main.scad' },
      output: { status: 'pending' },
      preliminary: true,
      toolMetadata: {
        tau: { origin: 'external', nativeName: 'evaluate_model', presentation: 'tau-mcp' },
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

  const renderWithTokens = (messageId: string, knownTokens: ReadonlySet<string>): void => {
    render(
      <AtReferenceProvider treeService={undefined} chats={[]} knownTokens={knownTokens}>
        <ChatMessage messageId={messageId} />
      </AtReferenceProvider>,
    );
  };

  it('should render /create-skill as a skill chip when the chat knows the token', () => {
    setMessages([userMessage('msg-1', longMessageWith('Use /create-skill now'))]);

    renderWithTokens('msg-1', new Set(['/create-skill']));

    expect(screen.getByTestId('context-chip')).toBeInTheDocument();
  });

  it('should render a Codex $skill as a skill chip when the agent advertised it', () => {
    setMessages([userMessage('msg-1', longMessageWith('Make a render of this using $imagegen'))]);

    renderWithTokens('msg-1', new Set(['$imagegen']));

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

describe('ChatMessage machine tools', () => {
  it('should render request_job on its own card, never as an unknown part', () => {
    const message: MyUIMessage = {
      id: 'msg-request-job',
      role: 'assistant',
      parts: [
        {
          type: 'tool-request_job',
          toolCallId: 'call-job',
          state: 'input-available',
          input: { targetFile: 'main.scad' },
        },
      ],
    };
    setMessages([message], 'streaming');

    render(<ChatMessage messageId={message.id} />);

    expect(screen.getByTestId('tool-request-job')).toHaveAttribute('data-state', 'input-available');
    expect(screen.queryByTestId('tool-unknown')).toBeNull();
  });

  it('should render the other machine tools on the generic card under their own names', () => {
    const message: MyUIMessage = {
      id: 'msg-machine-tools',
      role: 'assistant',
      parts: [
        { type: 'tool-list_machines', toolCallId: 'call-list', state: 'input-available', input: {} },
        { type: 'tool-get_machine', toolCallId: 'call-machine', state: 'input-available', input: {} },
        {
          type: 'tool-machine_action',
          toolCallId: 'call-action',
          state: 'input-available',
          input: { componentId: 'chamber-light', action: 'switch.set', parameters: { on: true } },
        },
        { type: 'tool-stop_machine', toolCallId: 'call-stop', state: 'input-available', input: {} },
        {
          type: 'tool-check_job',
          toolCallId: 'call-check',
          state: 'input-available',
          input: { targetFile: 'main.scad' },
        },
      ],
    };
    setMessages([message], 'streaming');

    render(<ChatMessage messageId={message.id} />);

    for (const name of ['list_machines', 'get_machine', 'machine_action', 'stop_machine', 'check_job']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('tool-unknown')).toBeNull();
  });
});

it('shows a retired tool from an old chat on the generic card under its own name, never as an unknown part', () => {
  const message: MyUIMessage = {
    id: 'msg-unknown',
    role: 'assistant',
    parts: [
      {
        type: 'tool-request_print',
        toolCallId: 'old-print',
        state: 'output-available',
        input: {},
        output: 'Old result',
      } as unknown as MyUIMessage['parts'][number],
    ],
  };
  setMessages([message]);
  render(<ChatMessage messageId='msg-unknown' />);
  expect(screen.getByText('request_print')).toBeInTheDocument();
  expect(screen.queryByTestId('tool-unknown')).toBeNull();
});

it('shows generic diagnostics for a part that is not a tool part at all', () => {
  const message: MyUIMessage = {
    id: 'msg-unknown-data',
    role: 'assistant',
    parts: [{ type: 'data-retired', data: {} } as unknown as MyUIMessage['parts'][number]],
  };
  setMessages([message]);
  render(<ChatMessage messageId='msg-unknown-data' />);
  expect(screen.getByTestId('tool-unknown')).toBeInTheDocument();
});

/*
 * The action row under an assistant message: Copy, the usage button (its card
 * carries the model and any external agent — V6 lives there now) and the
 * message's timestamp. A user message has none of it.
 */
describe('assistant action row', () => {
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
        ...data,
      },
    }) as unknown as MyUIMessage['parts'][number];

  it('shows Copy, usage and a relative timestamp whose tooltip is the exact time', () => {
    const createdAt = Date.now() - 3 * 60_000;
    setMessages([{ id: 'msg-a', role: 'assistant', parts: [usagePart({ agent: 'codex' })], metadata: { createdAt } }]);

    render(<ChatMessage messageId='msg-a' />);

    expect(screen.getByTestId('copy-button')).toBeInTheDocument();
    expect(screen.getByTestId('chat-message-data-usage')).toBeInTheDocument();
    const time = screen.getByText('3 minutes ago');
    expect(time.tagName).toBe('TIME');
    expect(time.getAttribute('datetime')).toBe(new Date(createdAt).toISOString());
  });

  it('gives a user message the same copy and timestamp, and no usage button', () => {
    const createdAt = Date.now() - 2 * 60 * 60_000;
    setMessages([
      { id: 'msg-u', role: 'user', parts: [{ type: 'text', text: 'make the blade longer' }], metadata: { createdAt } },
    ]);

    render(<ChatMessage messageId='msg-u' />);

    const copy = screen.getByTestId('copy-button');
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-message-data-usage')).not.toBeInTheDocument();
    /* Right-aligned under the bubble, time left of the buttons: one reversed row. */
    const row = copy.parentElement;
    expect(row?.className).toContain('flex-row-reverse');
    expect(row?.firstElementChild).toBe(copy);
  });

  it('omits the usage button without usage parts and the timestamp without a stamp', () => {
    setMessages([{ id: 'msg-b', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] }]);

    render(<ChatMessage messageId='msg-b' />);

    expect(screen.queryByTestId('chat-message-data-usage')).not.toBeInTheDocument();
    expect(document.querySelector('time')).toBeNull();
  });
});
