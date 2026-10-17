// @vitest-environment jsdom
import { useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { MyUIMessage } from '@taucad/chat';
import type { ProjectTask, ProjectTaskSnapshot } from '@taucad/agent-host/wire';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import type {
  ChatTextareaHandle,
  ChatTextareaProperties,
  ChatTextareaSubmitPayload,
} from '#components/chat/chat-textarea-types.js';
import type { CadChatSubmitInput } from '#chat-clients/use-cad-chat-client.js';
import { storedRef } from '#utils/attachment.test-utils.js';
import { buildTurnGroups } from '#routes/w.$workspace.$project/chat-turn-groups.js';

// `useKernel` must NOT be called from chat-history anymore — guard with a
// throwing mock so any regression is caught loudly.
vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => {
    throw new Error('chat-history should no longer call useKernel — switch to useCadChatClient');
  },
}));

// Chat-history only reads `messageOrder` / `messages` selectors from useChat
// now; sendMessage / regenerate / etc. flow through useCadChatClient.
const chatStateRef: { current: { messages: readonly MyUIMessage[] } } = { current: { messages: [] } };
const setMockMessages = (messages: readonly MyUIMessage[]): void => {
  chatStateRef.current = { messages };
};
let locationState: { readonly focusChatComposer?: boolean } | undefined;
let archiveOpen = false;
vi.mock('react-router', () => ({ useLocation: () => ({ state: locationState }) }));
vi.mock('#hooks/use-search-parameter.js', () => ({ useSearchParameter: () => [archiveOpen, vi.fn()] }));
vi.mock('#routes/w.$workspace.$project/archived-chats.js', () => ({
  ArchivedChats: () => <section aria-label='Archived chats' />,
}));
// Fake persistence actor — `chat-history.tsx` subscribes to
// `restoreCancelledDraft` emits to refocus the composer after the
// persistence machine lifts a cancelled user message back into the draft.
// The fake captures registered callbacks so the empty-cancel test below
// can drive the emit synchronously.
type FakePersistenceListener = (payload: unknown) => void;
const persistenceListeners = new Map<string, Set<FakePersistenceListener>>();
const fakePersistenceActorRef = {
  on: (type: string, callback: FakePersistenceListener) => {
    let bucket = persistenceListeners.get(type);
    if (!bucket) {
      bucket = new Set();
      persistenceListeners.set(type, bucket);
    }
    bucket.add(callback);
    const ownedBucket = bucket;
    return {
      unsubscribe: () => {
        ownedBucket.delete(callback);
      },
    };
  },
};

const emitRestoreCancelledDraft = (payload: unknown): void => {
  const bucket = persistenceListeners.get('restoreCancelledDraft');
  if (!bucket) {
    return;
  }
  for (const listener of bucket) {
    listener(payload);
  }
};

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: (selector: (state: unknown) => unknown) => {
    const { messages } = chatStateRef.current;
    return selector({
      messages,
      messageOrder: messages.map((m) => m.id),
      turnGroups: buildTurnGroups(messages),
      agentInvocations: '',
    });
  },
  useChatContext: () => ({ activeChatId: 'chat_test', persistenceActorRef: fakePersistenceActorRef }),
  useDraftSelector: (selector: (state: { draftText: string; draftAttachments: readonly unknown[] }) => unknown) =>
    selector({ draftText: selectedDraftText, draftAttachments: [] }),
}));
let selectedDraftText = '';
const consumeSelectedDraft = vi.fn(async () => undefined);
vi.mock('#hooks/active-chat-provider.js', () => ({
  ActiveChatProvider: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  useChatComposer: () => ({ consumeDraft: consumeSelectedDraft }),
}));

// Capture the body the chat client receives on submit so the wire-format
// invariant test below can validate it against the shared API schema.
const submitMock = vi.fn();
const cadChatRef: {
  current: {
    submit: (input: CadChatSubmitInput) => void;
    agent: unknown;
  };
} = {
  current: {
    submit: submitMock,
    agent: {
      profile: 'cad',
      execution: { kind: 'tau', model: 'openai-gpt-5.5' },
      kernel: 'replicad',
      mode: 'agent',
      toolChoice: 'auto',
      testingEnabled: true,
    },
  },
};
vi.mock('#chat-clients/use-cad-chat-client.js', () => ({
  useCadChatClient: () => cadChatRef.current,
}));

// Capture the textarea onSubmit callback and focus handle so the tests
// can both invoke onSubmit directly and assert that empty-cancel
// recoveries refocus the composer.
const capturedTextarea: {
  onSubmit?: ChatTextareaProperties['onSubmit'];
  className?: string;
  isSubmitDisabled?: boolean;
  focus: ReturnType<typeof vi.fn<() => void>>;
} = {
  focus: vi.fn<() => void>(),
};
vi.mock('#components/chat/chat-textarea.js', () => ({
  ChatTextarea: (properties: {
    readonly ref?: React.Ref<ChatTextareaHandle>;
    readonly onSubmit?: ChatTextareaProperties['onSubmit'];
    readonly className?: string;
    readonly isSubmitDisabled?: boolean;
  }): React.JSX.Element => {
    capturedTextarea.onSubmit = properties.onSubmit;
    capturedTextarea.className = properties.className;
    capturedTextarea.isSubmitDisabled = properties.isSubmitDisabled;
    useImperativeHandle(properties.ref, () => ({ focus: capturedTextarea.focus }), []);
    return <div data-testid='chat-textarea' />;
  },
}));

// Queue behavior is covered by its view and session-store suites; this leaf fixture owns history composition.
vi.mock('#components/chat/chat-message-queue.js', () => ({ ChatMessageQueue: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-message-planning.js', () => ({
  ChatMessagePlanning: () => (
    <div role='status' aria-label='Current activity'>
      Reading files
    </div>
  ),
}));

vi.mock('#routes/w.$workspace.$project/chat-message.js', () => ({
  ChatMessage: ({
    messageId,
    footer,
    readOnly,
  }: {
    readonly messageId: string;
    readonly footer?: React.ReactNode;
    // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors ChatMessage's standard readOnly prop
    readonly readOnly?: boolean;
  }) => (
    <div data-testid='chat-message' data-message-id={messageId} data-read-only={String(readOnly)}>
      {footer}
    </div>
  ),
}));

vi.mock('#routes/w.$workspace.$project/chat-revision-marker.js', () => ({
  ChatRevisionMarker: ({
    userMessageId,
    isLatestTurn,
  }: {
    readonly userMessageId: string;
    readonly isLatestTurn: boolean;
  }) => <div data-testid='turn-revision' data-user-message-id={userMessageId} data-latest={String(isLatestTurn)} />,
}));

vi.mock('#routes/w.$workspace.$project/scroll-down-button.js', () => ({
  ScrollDownButton: () => <button type='button' aria-label='Scroll to bottom' />,
}));

vi.mock('#routes/w.$workspace.$project/revision-seams.js', () => ({
  RevisionSeams: () => null,
}));

vi.mock('#routes/w.$workspace.$project/fork-divider.js', () => ({
  ForkDivider: () => null,
}));

vi.mock('#routes/w.$workspace.$project/chat-error.js', () => ({
  ChatError: ({ isClosedDelegatedTask }: { readonly isClosedDelegatedTask?: boolean }) => (
    <div data-testid='chat-error-adornment' data-closed-delegated-task={String(isClosedDelegatedTask)} />
  ),
}));

vi.mock('#routes/w.$workspace.$project/chat-title-bar.js', () => ({
  ChatTitleBar: () => <span data-testid='chat-title-bar' />,
}));

vi.mock('#routes/w.$workspace.$project/chat-history-empty.js', () => ({
  ChatHistoryEmpty: () => null,
}));

vi.mock('#components/ui/floating-panel.js', () => ({
  FloatingPanel: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelClose: () => null,
  FloatingPanelContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentHeader: ({
    children,
    className,
  }: {
    readonly children: React.ReactNode;
    readonly className?: string;
  }) => (
    <div data-slot='floating-panel-content-header' className={className}>
      {children}
    </div>
  ),
  FloatingPanelErrorContent: () => null,
}));

vi.mock('@taucad/ui/components/key-shortcut', () => ({
  KeyShortcut: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@taucad/ui/components/keyboard', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Ctrl+C' }),
}));

vi.mock('#components/chat/at-reference-context.js', () => ({
  AtReferenceProvider: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ treeService: undefined }),
}));

vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({ chats: [] }),
}));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: () => ({ chats: [] }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'project_test' }),
}));

let taskSnapshot: ProjectTaskSnapshot | undefined;
const openPanel = vi.fn();
vi.mock('#hooks/use-project-tasks.js', () => ({
  useProjectTasks: () => ({ snapshot: taskSnapshot }),
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));

const skillsCatalogReads = vi.hoisted(() => vi.fn(() => []));
vi.mock('#hooks/use-skills-catalog.js', () => ({ useSkillsCatalog: skillsCatalogReads }));

// Capture the Virtuoso props so tests can both inspect counts and render
// the produced items by walking `itemContent` over `totalCount`.
const capturedVirtuoso: {
  totalCount?: number;
  itemContent?: (index: number) => React.ReactNode;
  followOutput?: () => 'auto' | false;
  initialTopMostItemIndex?: { index: string; align: string };
} = {};
const scrollToIndexMock = vi.fn();
vi.mock('react-virtuoso', () => ({
  Virtuoso: (properties: {
    readonly data: readonly unknown[];
    readonly initialTopMostItemIndex: { index: string; align: string };
    readonly itemContent: (index: number, item: unknown) => React.ReactNode;
    readonly followOutput: () => 'auto' | false;
    readonly ref?: React.Ref<{ scrollToIndex: typeof scrollToIndexMock }>;
  }) => {
    capturedVirtuoso.initialTopMostItemIndex = properties.initialTopMostItemIndex;
    capturedVirtuoso.totalCount = properties.data.length;
    capturedVirtuoso.itemContent = async (index) => properties.itemContent(index, properties.data[index]);
    capturedVirtuoso.followOutput = properties.followOutput;
    useImperativeHandle(properties.ref, () => ({ scrollToIndex: scrollToIndexMock }), []);
    const items: React.ReactNode[] = [];
    for (let index = 0; index < properties.data.length; index++) {
      items.push(
        <div key={index} data-testid='virtuoso-item' data-index={index}>
          {properties.itemContent(index, properties.data[index])}
        </div>,
      );
    }
    return <div data-testid='virtuoso'>{items}</div>;
  },
}));

const { ChatHistory, SelectedTaskHistory, MetadataTaskHistory } =
  await import('#routes/w.$workspace.$project/chat-history.js');

const draftAttachment = storedRef({ hash: 'f'.repeat(64), mediaType: 'application/pdf', filename: 'spec.pdf' });

const submitDraft = async (content = 'hello', attachments: ChatTextareaSubmitPayload['attachments'] = []) => {
  await capturedTextarea.onSubmit?.({ content, attachments });
};

const message = (id: string, role: MyUIMessage['role']): MyUIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text: id }],
});

describe('SelectedTaskHistory — host-owned child history and actions', () => {
  const attempt = (status: ProjectTask['attempts'][number]['status']): ProjectTask['attempts'][number] => ({
    id: 'attempt-child',
    number: 1,
    status,
    toolGrant: { toolChoice: 'none' },
    source: { revisionId: 'base', checkoutId: 'source' },
    createdAt: 1,
  });
  const child = (status: ProjectTask['attempts'][number]['status']): ProjectTask => ({
    id: 'child',
    projectId: 'project_test',
    chatId: 'chat-child',
    parentTaskId: 'root',
    depth: 1,
    title: 'Check fit',
    prompt: 'Check the mounting fit',
    provider: { id: 'codex' },
    createdAt: 1,
    closed: false,
    attempts: [attempt(status)],
  });
  const snapshotFor = (task: ProjectTask): ProjectTaskSnapshot => ({
    tasks: [task],
    messages: [],
    cursor: 0,
    nextCursor: 0,
    hasMore: false,
  });
  const defaultActions = {
    send: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
  };
  const propsFor = (task: ProjectTask, snapshot: ProjectTaskSnapshot, actions = defaultActions) => ({
    task,
    snapshot,
    actions,
    isReadOnly: false,
    hasClosedAncestor: false,
    onBack: vi.fn(),
    onOpenParent: vi.fn(),
    onSelectTask: vi.fn(),
    onReviewCandidate: vi.fn(),
  });
  beforeEach(() => {
    vi.clearAllMocks();
    setMockMessages([]);
    selectedDraftText = '';
  });

  it('hides the exact synthetic task start and orders timestamped mailbox receipts between log events', () => {
    const task = child('running');
    setMockMessages([
      { ...message('task-message-attempt-child', 'user'), metadata: { createdAt: 1 } },
      { ...message('assistant-before', 'assistant'), metadata: { createdAt: 3 } },
      { ...message('user-real', 'user'), metadata: { createdAt: 5 } },
    ]);
    const snapshot: ProjectTaskSnapshot = {
      ...snapshotFor(task),
      messages: [
        {
          id: 'mail-1',
          sequence: 4,
          projectId: 'project_test',
          recipientTaskId: 'child',
          requestId: 'request-1',
          text: 'Please check one more dimension',
          createdAt: 4,
        },
      ],
      deliveries: [{ taskId: 'child', attemptId: 'attempt-child', through: 4 }],
    };
    const { container } = render(<SelectedTaskHistory {...propsFor(task, snapshot)} />);
    expect(container.querySelector('[data-message-id="task-message-attempt-child"]')).toBeNull();
    expect(screen.getByRole('article', { name: 'Parent instruction' })).toHaveTextContent('Check the mounting fit');
    const ordered = [
      ...container.querySelectorAll<HTMLElement>('[data-message-id], article[aria-label^="Message from"]'),
    ].map((node) => node.dataset['messageId'] ?? node.getAttribute('aria-label'));
    expect(ordered).toEqual(['assistant-before', 'Message from You', 'user-real']);
    expect(screen.getByText('Delivered to attempt 1')).toBeInTheDocument();
    expect(container.querySelector('[data-message-id="user-real"]')).toHaveAttribute('data-read-only', 'true');
  });

  it('admits a completed follow-up once, consumes its draft, then resumes the task attempt', async () => {
    const task = child('completed');
    const actions = {
      send: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      resume: vi.fn(async () => undefined),
    };
    selectedDraftText = 'Check the second pattern';
    render(<SelectedTaskHistory {...propsFor(task, snapshotFor(task), actions)} />);
    expect(screen.queryByRole('button', { name: 'Resume thread' })).toBeNull();
    await act(async () => {
      await submitDraft(selectedDraftText);
    });
    expect(actions.send).toHaveBeenCalledExactlyOnceWith('child', 'Check the second pattern');
    expect(consumeSelectedDraft).toHaveBeenCalledTimes(1);
    expect(actions.resume).toHaveBeenCalledExactlyOnceWith('child');
    expect(actions.send.mock.invocationCallOrder[0]).toBeLessThan(actions.resume.mock.invocationCallOrder[0]!);
  });

  it('names only active descendants in stop confirmation and restores focus on Keep running', () => {
    const task = child('running');
    const active: ProjectTask = {
      ...child('running'),
      id: 'grandchild',
      parentTaskId: task.id,
      chatId: 'chat-grandchild',
    };
    const done: ProjectTask = { ...child('completed'), id: 'finished', parentTaskId: task.id, chatId: 'chat-finished' };
    const snapshot = { ...snapshotFor(task), tasks: [task, active, done] };
    render(<SelectedTaskHistory {...propsFor(task, snapshot)} />);
    const stop = screen.getByRole('button', { name: 'Stop thread' });
    stop.focus();
    fireEvent.click(stop);
    expect(screen.getByRole('group', { name: 'Stop Check fit' })).toHaveTextContent('and 1 active child thread');
    fireEvent.click(screen.getByRole('button', { name: 'Keep running' }));
    expect(document.activeElement).toBe(stop);
  });

  it('keeps durable child history and draft visible but actions disabled without a task snapshot', () => {
    setMockMessages([
      message('task-message-attempt-old', 'user'),
      message('user-real', 'user'),
      message('answer', 'assistant'),
    ]);
    render(
      <MetadataTaskHistory
        chat={{
          id: 'chat-child',
          resourceId: 'project_test',
          name: 'Check fit',
          createdAt: 1,
          updatedAt: 1,
          taskLineage: { taskId: 'child', parentTaskId: 'root', parentChatId: 'chat-root', rootChatId: 'chat-root' },
        }}
        onBack={vi.fn()}
        onOpenParent={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Check fit' })).toBeInTheDocument();
    expect(
      screen.queryAllByTestId('chat-message').some((node) => node.dataset['messageId'] === 'task-message-attempt-old'),
    ).toBe(false);
    expect(
      screen.getByText('Thread actions will be available when the project task host reconnects.'),
    ).toBeInTheDocument();
    expect(capturedTextarea.isSubmitDisabled).toBe(true);
    expect(screen.getAllByTestId('chat-message').map((node) => node.dataset['messageId'])).toEqual([
      'user-real',
      'answer',
    ]);
    expect(screen.getAllByTestId('chat-message')[0]).toHaveAttribute('data-read-only', 'true');
  });

  it('keeps receipt attribution per attempt and names a returned child mailbox message', () => {
    const task: ProjectTask = {
      ...child('running'),
      attempts: [attempt('completed'), { ...attempt('running'), id: 'attempt-two', number: 2 }],
    };
    const descendant: ProjectTask = {
      ...child('completed'),
      id: 'grandchild',
      chatId: 'chat-grandchild',
      parentTaskId: task.id,
      title: 'Verify note',
    };
    const parent: ProjectTask = {
      ...child('running'),
      id: 'root',
      chatId: 'chat-root',
      parentTaskId: undefined,
      depth: 0,
      title: 'Root design',
    };
    const snapshot: ProjectTaskSnapshot = {
      ...snapshotFor(task),
      tasks: [parent, task, descendant],
      deliveries: [{ taskId: task.id, attemptId: 'attempt-child', through: 4 }],
      messages: [
        {
          id: 'old',
          sequence: 4,
          projectId: 'project_test',
          recipientTaskId: task.id,
          requestId: 'r1',
          text: 'Old note',
          createdAt: 2,
        },
        {
          id: 'new',
          sequence: 6,
          projectId: 'project_test',
          recipientTaskId: task.id,
          requestId: 'r2',
          text: 'New note',
          createdAt: 3,
        },
        {
          id: 'reply',
          sequence: 7,
          projectId: 'project_test',
          senderTaskId: descendant.id,
          recipientTaskId: task.id,
          requestId: 'r3',
          text: 'Dimension verified',
          createdAt: 4,
        },
        {
          id: 'outgoing',
          sequence: 8,
          projectId: 'project_test',
          senderTaskId: task.id,
          recipientTaskId: parent.id,
          requestId: 'r4',
          text: 'Child report',
          createdAt: 5,
        },
      ],
    };
    render(<SelectedTaskHistory {...propsFor(task, snapshot)} />);
    expect(screen.getByText('Delivered to attempt 1')).toBeInTheDocument();
    expect(screen.getAllByText('Queued for this thread')).toHaveLength(2);
    expect(screen.getByRole('article', { name: 'Message from Verify note' })).toHaveTextContent('Dimension verified');
    expect(screen.getByRole('article', { name: 'Message from Check fit' })).toHaveTextContent('Queued for Root design');
    expect(screen.queryByText(/Read by/u)).toBeNull();
  });
});

describe('ChatHistory — submit routes through useCadChatClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedTextarea.onSubmit = undefined;
    capturedTextarea.className = undefined;
    setMockMessages([]);
    archiveOpen = false;
    taskSnapshot = undefined;
  });

  it('replaces the transcript and composer with the archive without reading transcript projections', () => {
    archiveOpen = true;
    const view = render(<ChatHistory />);
    expect(screen.getByRole('region', { name: 'Archived chats' })).toBeInTheDocument();
    expect(screen.queryByTestId('chat-textarea')).not.toBeInTheDocument();
    expect(screen.queryByTestId('virtuoso')).not.toBeInTheDocument();
    expect(skillsCatalogReads).not.toHaveBeenCalled();
    archiveOpen = false;
    view.rerender(<ChatHistory className='returned' />);
    expect(screen.queryByRole('region', { name: 'Archived chats' })).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-textarea')).toBeInTheDocument();
  });

  it('skips hidden transcript and skill projections, then reveals current messages', () => {
    setMockMessages([message('u1', 'user')]);
    const view = render(<ChatHistory isExpanded={false} setIsExpanded={vi.fn()} />);

    expect(skillsCatalogReads).not.toHaveBeenCalled();
    expect(screen.queryByTestId('virtuoso')).toBeNull();
    expect(screen.queryByTestId('chat-textarea')).toBeNull();

    setMockMessages([message('u1', 'user'), message('a1', 'assistant')]);
    view.rerender(<ChatHistory isExpanded={false} setIsExpanded={vi.fn()} />);
    expect(skillsCatalogReads).not.toHaveBeenCalled();

    view.rerender(<ChatHistory isExpanded setIsExpanded={vi.fn()} />);
    expect(skillsCatalogReads).toHaveBeenCalledOnce();
    expect(screen.getAllByTestId('chat-message')).toHaveLength(2);
    expect(screen.getByTestId('chat-textarea')).toBeInTheDocument();
  });

  it('opens with one header row that holds the title bar, and no status row under it', () => {
    const { container } = render(<ChatHistory />);

    const headers = container.querySelectorAll('[data-slot=floating-panel-content-header]');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveClass('gap-1');
    expect(headers[0]?.querySelector('[data-testid=chat-title-bar]')).not.toBeNull();
    expect(container.querySelector('.sticky')).toBeNull();
  });

  it('leaves the surface styling with ChatTextarea and caps the composer width', () => {
    render(<ChatHistory />);

    expect(capturedTextarea.className).toBeUndefined();
    expect(screen.getByTestId('chat-textarea').parentElement).toHaveClass('max-w-xl');
    expect(screen.getByRole('button', { name: 'Scroll to bottom' }).parentElement).toBe(
      screen.getByTestId('chat-textarea').parentElement,
    );
  });

  it('routes a completed child chat to its task mailbox and disables generic submission', async () => {
    const child: ProjectTask = {
      id: 'child',
      projectId: 'project_test',
      chatId: 'chat_test',
      parentTaskId: 'parent',
      depth: 1,
      title: 'Bracket child',
      prompt: 'Build a bracket',
      provider: { id: 'codex' },
      createdAt: 1,
      closed: false,
      attempts: [
        {
          id: 'attempt-child',
          number: 1,
          status: 'completed',
          toolGrant: { toolChoice: 'auto' },
          source: { revisionId: 'base', checkoutId: 'candidate' },
          createdAt: 1,
        },
      ],
    };
    taskSnapshot = { tasks: [child], messages: [], cursor: 1, nextCursor: 1, hasMore: false };
    render(<ChatHistory />);

    expect(capturedTextarea.isSubmitDisabled).toBe(true);
    const guidance = screen.getByText(
      'This chat belongs to Bracket child. Send a message and resume the task from Threads to continue it.',
    );
    expect(guidance.closest('[role="status"]')).toHaveAttribute('role', 'status');
    await submitDraft('Follow up on the bracket');
    expect(submitMock).not.toHaveBeenCalled();
    screen.getByRole('button', { name: 'Open Threads' }).click();
    expect(openPanel).toHaveBeenCalledWith('agents');
  });

  it('routes a closed child transcript to Threads without suggesting a message', () => {
    const child: ProjectTask = {
      id: 'child',
      projectId: 'project_test',
      chatId: 'chat_test',
      parentTaskId: 'parent',
      depth: 1,
      title: 'Bracket child',
      prompt: 'Build a bracket',
      provider: { id: 'codex' },
      createdAt: 1,
      closed: true,
      attempts: [
        {
          id: 'attempt-child',
          number: 1,
          status: 'cancelled',
          toolGrant: { toolChoice: 'auto' },
          source: { revisionId: 'base', checkoutId: 'candidate' },
          createdAt: 1,
        },
      ],
    };
    taskSnapshot = { tasks: [child], messages: [], cursor: 1, nextCursor: 1, hasMore: false };
    render(<ChatHistory />);

    expect(
      screen.getByText('This chat belongs to Bracket child. Open Threads to review the task and available actions.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('chat-error-adornment')).toHaveAttribute('data-closed-delegated-task', 'true');
    expect(capturedTextarea.isSubmitDisabled).toBe(true);
    screen.getByRole('button', { name: 'Open Threads' }).click();
    expect(openPanel).toHaveBeenCalledWith('agents');
  });

  it('calls cadChat.submit with the text and attachment references from the textarea', async () => {
    render(<ChatHistory />);
    await submitDraft('design a desk', [draftAttachment]);

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledWith({ text: 'design a desk', attachments: [draftAttachment] });
  });

  // Wire-format invariant. The chat-client builds the per-request `agent`
  // payload from `useCadAgentConfig`. We verify the request body the API
  // would receive (synthesised here from the captured agent identity + AI
  // SDK envelope fields) parses cleanly through the shared
  // `chatTurnRequestSchema`. This is the regression coverage for the
  // original "missing kernel on resubmit" bug — the chat-client owns the
  // wire body, not the chat-history component.
  it('produces a wire body satisfying chatTurnRequestSchema when submit fires', async () => {
    render(<ChatHistory />);
    await submitDraft('build a vase');

    const userMessage: MyUIMessage = {
      id: 'msg_test',
      role: 'user',
      parts: [{ type: 'text', text: 'build a vase' }],
    };
    const wireBody = {
      id: 'chat_test',
      projectId: 'project_test',
      messages: [userMessage],
      agent: cadChatRef.current.agent,
      admission: { version: 1, idempotencyKey: 'request_0000000001' },
      execution: { hostId: 'host_test', workspaceId: 'workspace_test', baseRevisionId: 'rev_test' },
    };

    expect(() => chatTurnRequestSchema.parse(wireBody)).not.toThrow();
  });
});

describe('ChatHistory — turn group rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedTextarea.onSubmit = undefined;
    capturedVirtuoso.initialTopMostItemIndex = undefined;
    capturedVirtuoso.totalCount = undefined;
    capturedVirtuoso.itemContent = undefined;
    capturedVirtuoso.followOutput = undefined;
    scrollToIndexMock.mockClear();
    setMockMessages([]);
  });

  it('should render natural-height turn groups without a trailing viewport spacer', () => {
    setMockMessages([
      message('u1', 'user'),
      message('a1', 'assistant'),
      message('u2', 'user'),
      message('a2', 'assistant'),
      message('a3', 'assistant'),
    ]);

    render(<ChatHistory />);

    const items = screen.getAllByTestId('virtuoso-item');
    expect(items).toHaveLength(2);

    const firstGroup = items[0]!.firstElementChild as HTMLElement;
    const lastGroup = items[1]!.firstElementChild as HTMLElement;

    // First group bundles u1 + a1, no min-h.
    expect(firstGroup.className).not.toContain('min-h-(--chat-live-turn-min-h)');
    const firstGroupMessages = firstGroup.querySelectorAll<HTMLElement>('[data-testid="chat-message"]');
    expect([...firstGroupMessages].map((node) => node.dataset['messageId'])).toEqual(['u1', 'a1']);

    // The last group also takes only its content height.
    expect(lastGroup.className).not.toContain('min-h-');
    const lastGroupMessages = lastGroup.querySelectorAll<HTMLElement>('[data-testid="chat-message"]');
    expect([...lastGroupMessages].map((node) => node.dataset['messageId'])).toEqual(['u2', 'a2', 'a3']);
  });

  it('should attach one revision summary to each request, before its replies', () => {
    setMockMessages([
      message('u1', 'user'),
      message('a1', 'assistant'),
      message('u2', 'user'),
      message('a2', 'assistant'),
      message('a3', 'assistant'),
    ]);
    render(<ChatHistory />);
    const [firstGroup, lastGroup] = screen
      .getAllByTestId('virtuoso-item')
      .map((item) => item.firstElementChild as HTMLElement);
    const order = (group: HTMLElement | undefined): string[] =>
      [...(group?.children ?? [])].map((node) =>
        node instanceof HTMLElement
          ? `${node.dataset['testid'] ?? ''}:${node.dataset['messageId'] ?? node.dataset['userMessageId'] ?? ''}`
          : '',
      );
    const summaryOf = (group: HTMLElement | undefined): HTMLElement | undefined =>
      group?.querySelector<HTMLElement>('[data-testid="turn-revision"]') ?? undefined;

    /* The card is the request's own footer (R11), so replies can never land between them. */
    const footerOf = (group: HTMLElement | undefined, id: string): string[] =>
      order(group?.querySelector<HTMLElement>(`[data-message-id="${id}"]`) ?? undefined);
    expect(order(firstGroup)).toEqual(['chat-message:u1', 'chat-message:a1']);
    expect(footerOf(firstGroup, 'u1')).toEqual(['turn-revision:u1']);
    expect(footerOf(firstGroup, 'a1')).toEqual([]);
    expect(order(lastGroup).slice(0, 3)).toEqual(['chat-message:u2', 'chat-message:a2', 'chat-message:a3']);
    expect(footerOf(lastGroup, 'u2')).toEqual(['turn-revision:u2']);
    expect(lastGroup?.querySelectorAll('[data-testid="turn-revision"]')).toHaveLength(1);
    expect(summaryOf(firstGroup)?.dataset['latest']).toBe('false');
    expect(summaryOf(lastGroup)?.dataset['latest']).toBe('true');
  });

  it('should render a leading assistant message in its own group when no user message precedes it', () => {
    setMockMessages([message('a0', 'assistant')]);

    render(<ChatHistory />);

    const items = screen.getAllByTestId('virtuoso-item');
    expect(items).toHaveLength(1);

    // A leading assistant greeting also takes only its content height.
    const onlyGroup = items[0]!.firstElementChild as HTMLElement;
    expect(onlyGroup.className).not.toContain('min-h-');
    const messages = onlyGroup.querySelectorAll<HTMLElement>('[data-testid="chat-message"]');
    expect([...messages].map((node) => node.dataset['messageId'])).toEqual(['a0']);
  });

  it('renders ChatError adornment inside the last turn group only', () => {
    setMockMessages([
      message('u1', 'user'),
      message('a1', 'assistant'),
      message('u2', 'user'),
      message('a2', 'assistant'),
    ]);

    render(<ChatHistory />);

    expect(screen.queryAllByTestId('chat-error-adornment')).toHaveLength(1);

    const items = screen.getAllByTestId('virtuoso-item');
    expect(items).toHaveLength(2);

    expect(items[0]!.querySelector('[data-testid="chat-error-adornment"]')).toBeNull();

    const lastTurnAdornment = items[1]!.querySelector('[data-testid="chat-error-adornment"]');
    expect(lastTurnAdornment).not.toBeNull();

    expect(screen.getByTestId('virtuoso').querySelectorAll('[data-testid="chat-error-adornment"]')).toHaveLength(1);
  });

  it('keeps the error adornment reachable on a chat with no turns yet (W19-b)', () => {
    /* The first turn of a fresh project is refused by the durable workspace
     * before any user message exists, so the banner that rides the last turn
     * group has no group to ride and the person saw nothing at all (I12). */
    setMockMessages([]);

    render(<ChatHistory />);

    expect(screen.queryAllByTestId('chat-error-adornment')).toHaveLength(1);
    expect(screen.getByTestId('virtuoso').querySelectorAll('[data-testid="chat-error-adornment"]')).toHaveLength(0);
  });

  it('should pass the correct totalCount to Virtuoso (one per turn group)', () => {
    setMockMessages([
      message('a0', 'assistant'),
      message('u1', 'user'),
      message('a1', 'assistant'),
      message('u2', 'user'),
    ]);

    render(<ChatHistory />);

    expect(capturedVirtuoso.totalCount).toBe(3);
    expect(typeof capturedVirtuoso.itemContent).toBe('function');
  });

  it('opens at the bottom and leaves scroll-away intact when a new turn arrives', () => {
    setMockMessages([message('u1', 'user'), message('a1', 'assistant')]);
    const view = render(<ChatHistory />);
    expect(capturedVirtuoso.initialTopMostItemIndex).toEqual({ index: 'LAST', align: 'end' });
    expect(capturedVirtuoso.followOutput?.()).toBe('auto');
    setMockMessages([message('u1', 'user'), message('a1', 'assistant'), message('u2', 'user')]);
    view.rerender(<ChatHistory className='updated' />);
    expect(scrollToIndexMock).not.toHaveBeenCalled();
  });

  it('keeps exactly one activity row in the composer region outside the transcript', () => {
    setMockMessages([message('u1', 'user'), message('a1', 'assistant')]);
    render(<ChatHistory />);
    const activity = screen.getByRole('status', { name: 'Current activity' });
    expect(screen.getByRole('region', { name: 'Chat composer' })).toContainElement(activity);
    expect(screen.getByTestId('virtuoso')).not.toContainElement(activity);
  });
});

describe('ChatHistory — composer refocus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedTextarea.onSubmit = undefined;
    capturedTextarea.focus = vi.fn<() => void>();
    persistenceListeners.clear();
    locationState = undefined;
    setMockMessages([]);
  });

  it('focuses the composer when a new-chat surface requests it', () => {
    locationState = { focusChatComposer: true };
    render(<ChatHistory />);

    expect(capturedTextarea.focus).toHaveBeenCalledTimes(1);
  });

  it('refocuses the composer on the next animation frame when persistence emits restoreCancelledDraft', async () => {
    const requestAnimationFrameSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });

    try {
      render(<ChatHistory />);

      const userMessage: MyUIMessage = {
        id: 'msg_user_cancelled',
        role: 'user',
        parts: [{ type: 'text', text: 'design a bracket' }],
      };

      // Subscriber registers during the mount effect.
      expect(persistenceListeners.get('restoreCancelledDraft')?.size).toBe(1);
      expect(capturedTextarea.focus).not.toHaveBeenCalled();

      act(() => {
        emitRestoreCancelledDraft({
          type: 'restoreCancelledDraft',
          userMessage,
          truncatedMessages: [],
          cause: 'user_stop',
        });
      });

      expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
      expect(capturedTextarea.focus).toHaveBeenCalledTimes(1);
    } finally {
      requestAnimationFrameSpy.mockRestore();
    }
  });

  it('unsubscribes the restore listener on unmount', () => {
    const { unmount } = render(<ChatHistory />);

    expect(persistenceListeners.get('restoreCancelledDraft')?.size).toBe(1);

    unmount();

    expect(persistenceListeners.get('restoreCancelledDraft')?.size ?? 0).toBe(0);
  });
});
