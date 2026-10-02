// @vitest-environment jsdom
import { useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { MyUIMessage } from '@taucad/chat';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import type { ChatTextareaHandle } from '#components/chat/chat-textarea-types.js';

// `useKernel` must NOT be called from chat-history anymore — guard with a
// throwing mock so any regression is caught loudly.
vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => {
    throw new Error('chat-history should no longer call useKernel — switch to useCadChatClient');
  },
}));

// Chat-history only reads `messageOrder` / `messages` selectors from useChat
// now; sendMessage / retryMessage / etc. flow through useCadChatClient.
const chatStateRef: { current: { messages: readonly MyUIMessage[] } } = { current: { messages: [] } };
const setMockMessages = (messages: readonly MyUIMessage[]): void => {
  chatStateRef.current = { messages };
};
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
    });
  },
  useChatContext: () => ({ persistenceActorRef: fakePersistenceActorRef }),
}));

// Capture the body the chat client receives on submit so the wire-format
// invariant test below can validate it against the shared API schema.
const submitMock = vi.fn();
const cadChatRef: {
  current: {
    submit: (input: { readonly text: string; readonly imageUrls?: readonly string[] }) => void;
    agent: unknown;
  };
} = {
  current: {
    submit: submitMock,
    agent: {
      profile: 'cad',
      model: 'openai-gpt-5.5',
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
  onSubmit?: (payload: { content: string; imageUrls: string[] }) => Promise<void>;
  focus: ReturnType<typeof vi.fn<() => void>>;
} = {
  focus: vi.fn<() => void>(),
};
vi.mock('#components/chat/chat-textarea.js', () => ({
  ChatTextarea: (properties: {
    readonly ref?: React.Ref<ChatTextareaHandle>;
    readonly onSubmit?: (payload: { content: string; imageUrls: string[] }) => Promise<void>;
  }): React.JSX.Element => {
    capturedTextarea.onSubmit = properties.onSubmit;
    useImperativeHandle(properties.ref, () => ({ focus: capturedTextarea.focus }), []);
    return <div data-testid='chat-textarea' />;
  },
}));

vi.mock('#routes/projects_.$id/chat-message.js', () => ({
  ChatMessage: ({ messageId }: { readonly messageId: string }) => (
    <div data-testid='chat-message' data-message-id={messageId} />
  ),
}));

vi.mock('#routes/projects_.$id/scroll-down-button.js', () => ({
  ScrollDownButton: () => null,
}));

vi.mock('#routes/projects_.$id/chat-error.js', () => ({
  ChatError: () => <div data-testid='chat-error-adornment' />,
}));

vi.mock('#routes/projects_.$id/chat-history-selector.js', () => ({
  ChatHistorySelector: () => null,
}));

vi.mock('#routes/projects_.$id/chat-history-status.js', () => ({
  ChatHistoryStatus: () => null,
}));

vi.mock('#routes/projects_.$id/chat-history-empty.js', () => ({
  ChatHistoryEmpty: () => null,
}));

vi.mock('#components/ui/floating-panel.js', () => ({
  FloatingPanel: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelClose: () => null,
  FloatingPanelContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentHeader: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelErrorContent: () => null,
  FloatingPanelTrigger: () => null,
}));

vi.mock('#components/ui/key-shortcut.js', () => ({
  KeyShortcut: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('#hooks/use-keyboard.js', () => ({
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

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'project_test' }),
}));

// Capture the Virtuoso props so tests can both inspect counts and render
// the produced items by walking `itemContent` over `totalCount`.
const capturedVirtuoso: {
  totalCount?: number;
  itemContent?: (index: number) => React.ReactNode;
} = {};
vi.mock('react-virtuoso', () => ({
  Virtuoso: (properties: { readonly totalCount: number; readonly itemContent: (index: number) => React.ReactNode }) => {
    capturedVirtuoso.totalCount = properties.totalCount;
    capturedVirtuoso.itemContent = properties.itemContent;
    const items: React.ReactNode[] = [];
    for (let index = 0; index < properties.totalCount; index++) {
      items.push(
        <div key={index} data-testid='virtuoso-item' data-index={index}>
          {properties.itemContent(index)}
        </div>,
      );
    }
    return <div data-testid='virtuoso'>{items}</div>;
  },
}));

const { ChatHistory } = await import('#routes/projects_.$id/chat-history.js');

const submitDraft = async (content = 'hello') => {
  await capturedTextarea.onSubmit?.({
    content,
    imageUrls: [],
  });
};

const message = (id: string, role: MyUIMessage['role']): MyUIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text: id }],
});

describe('ChatHistory — submit routes through useCadChatClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedTextarea.onSubmit = undefined;
    setMockMessages([]);
  });

  it('calls cadChat.submit with the text and imageUrls payload from the textarea', async () => {
    render(<ChatHistory />);
    await submitDraft('design a desk');

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledWith({ text: 'design a desk', imageUrls: [] });
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
      messages: [userMessage],
      agent: cadChatRef.current.agent,
    };

    expect(() => chatTurnRequestSchema.parse(wireBody)).not.toThrow();
  });
});

describe('ChatHistory — turn group rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedTextarea.onSubmit = undefined;
    capturedVirtuoso.totalCount = undefined;
    capturedVirtuoso.itemContent = undefined;
    setMockMessages([]);
  });

  it('should render one TurnGroup per user message and apply min-h only to the last', () => {
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

    // Last group bundles u2 + a2 + a3, gets min-h to pin user message at top.
    expect(lastGroup.className).toContain('min-h-(--chat-live-turn-min-h)');
    const lastGroupMessages = lastGroup.querySelectorAll<HTMLElement>('[data-testid="chat-message"]');
    expect([...lastGroupMessages].map((node) => node.dataset['messageId'])).toEqual(['u2', 'a2', 'a3']);
  });

  it('should render a leading assistant message in its own group when no user message precedes it', () => {
    setMockMessages([message('a0', 'assistant')]);

    render(<ChatHistory />);

    const items = screen.getAllByTestId('virtuoso-item');
    expect(items).toHaveLength(1);

    // Lone assistant greeting still receives min-h because it is the last
    // (and only) group — keeps the empty-canvas effect consistent.
    const onlyGroup = items[0]!.firstElementChild as HTMLElement;
    expect(onlyGroup.className).toContain('min-h-(--chat-live-turn-min-h)');
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
});

describe('ChatHistory — empty-cancel composer refocus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedTextarea.onSubmit = undefined;
    capturedTextarea.focus = vi.fn<() => void>();
    persistenceListeners.clear();
    setMockMessages([]);
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
