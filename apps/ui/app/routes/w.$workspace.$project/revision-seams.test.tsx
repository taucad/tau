import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';
import { RevisionSeams } from '#routes/w.$workspace.$project/revision-seams.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useRevisionActor } from '#routes/w.$workspace.$project/revision-provider.js';
import { useRevisions } from '#hooks/use-revisions.js';
import type { RevisionsView } from '#hooks/use-revisions.js';
import type { Revision } from '#lib/file-restore-timeline.js';
import type { Chat, MyUIMessage } from '@taucad/chat';

vi.mock('#hooks/active-chat-provider.js', () => ({
  useActiveChatSession: vi.fn(),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: vi.fn(),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'p1' }),
}));
const projectChatIds: string[] = [];
vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({ chats: projectChatIds.map((id) => ({ id }) as Chat) }),
}));
vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({
  useRevisionActor: vi.fn(),
}));
vi.mock('#hooks/use-revisions.js', () => ({ useRevisions: vi.fn() }));

const rev = (over: Partial<Revision> = {}): Revision => ({
  n: 1,
  chatId: 'a',
  messageId: 'u1',
  anchor: 100,
  cutoffSeq: 1,
  files: [],
  changedPaths: [],
  linesAdded: 0,
  linesRemoved: 0,
  ...over,
});

const send = vi.fn();
let dispatchHandler: ((event: { request: { kind: string } }) => void) | undefined;
const terminalHandlers = new Map<string, (event: { messages: MyUIMessage[] }) => void>();
const sessions = new Map<string, ChatSession>();
const store = mock<ChatSessionStore>();

const terminalHandler = (chatId: string, event: string) => terminalHandlers.get(`${chatId}:${event}`);

const installSession = (chatId: string): void => {
  const persistenceActorRef = mock<ChatSession['persistenceActorRef']>();
  persistenceActorRef.on.mockImplementation((event: string, handler: (payload: never) => void) => {
    if (chatId === 'c1' && event === 'dispatchRequest') {
      dispatchHandler = handler as (event: { request: { kind: string } }) => void;
    }
    if (['applyFinishedRequest', 'applyStoppedRequest', 'applyResumedRequest'].includes(event)) {
      terminalHandlers.set(`${chatId}:${event}`, handler as (event: { messages: MyUIMessage[] }) => void);
    }
    return { unsubscribe: vi.fn() };
  });
  sessions.set(chatId, mock<ChatSession>({ chatId, persistenceActorRef }));
};

const userMessage = (id: string): MyUIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text: 'build it' }],
});

const assistantMessage = (parts: MyUIMessage['parts']): MyUIMessage => ({
  id: 'assistant',
  role: 'assistant',
  parts,
});

const mutatingMessages = (): MyUIMessage[] => [
  userMessage('u1'),
  assistantMessage([
    {
      type: 'tool-create_file',
      toolCallId: 'create-1',
      state: 'output-available',
      input: { targetFile: 'main.scad', content: 'cube(10);' },
      output: {
        diffStats: {
          linesAdded: 1,
          linesRemoved: 0,
          originalContent: '',
          modifiedContent: 'cube(10);',
        },
      },
    },
  ]),
];

const chatOnlyMessages = (): MyUIMessage[] => [
  userMessage('u1'),
  assistantMessage([{ type: 'text', text: 'No file changes.' }]),
];

const setup = (view: Partial<RevisionsView>): void => {
  send.mockClear();
  dispatchHandler = undefined;
  terminalHandlers.clear();
  sessions.clear();
  projectChatIds.splice(0, projectChatIds.length, 'c1');
  installSession('c1');

  vi.mocked(useActiveChatSession).mockReturnValue(
    mock<ReturnType<typeof useActiveChatSession>>({ activeChatId: 'c1' }),
  );
  vi.mocked(useRevisionActor).mockReturnValue(mock<ReturnType<typeof useRevisionActor>>({ send }));
  vi.mocked(useRevisions).mockReturnValue({
    revisions: [],
    byMessageId: new Map(),
    headRevision: undefined,
    maxRevision: 0,
    headTurnId: '',
    isDirty: false,
    canReturnToLatest: false,
    ...view,
  });

  store.get.mockImplementation((chatId) => sessions.get(chatId));
  store.subscribeMembership.mockReturnValue(() => undefined);
  vi.mocked(useChatSessionStore).mockReturnValue(store);
};

beforeEach(() => {
  setup({});
});

describe('RevisionSeams', () => {
  it('T-WIRE-SUBMIT-FORK: a new user turn (kind:send) below the tip sends NEW_USER_TURN with the abandoned tail', () => {
    setup({
      revisions: [rev({ messageId: 'u1', anchor: 100, n: 1 }), rev({ messageId: 'u2', anchor: 200, n: 2 })],
      headRevision: rev({ messageId: 'u1', anchor: 100, n: 1 }),
    });
    render(<RevisionSeams />);

    dispatchHandler?.({ request: { kind: 'send' } });

    expect(send).toHaveBeenCalledWith({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: ['u2'],
      atRevision: 1,
    });
  });

  it('T-WIRE-SUBMIT-FORK: a new user turn at the tip sends an empty abandoned set (no fork)', () => {
    const latest = rev({ messageId: 'u2', anchor: 200, n: 2 });
    setup({
      revisions: [rev({ messageId: 'u1', anchor: 100, n: 1 }), latest],
      headRevision: latest,
    });
    render(<RevisionSeams />);

    dispatchHandler?.({ request: { kind: 'send' } });

    expect(send).toHaveBeenCalledWith({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: [],
      atRevision: 2,
    });
  });

  it('T-WIRE-IGNORE-KIND: retry / regenerate / continue do not fork', () => {
    setup({
      revisions: [rev({ messageId: 'u1', anchor: 100, n: 1 }), rev({ messageId: 'u2', anchor: 200, n: 2 })],
      headRevision: rev({ messageId: 'u1', anchor: 100, n: 1 }),
    });
    render(<RevisionSeams />);

    dispatchHandler?.({ request: { kind: 'retry' } });
    dispatchHandler?.({ request: { kind: 'regenerate' } });
    dispatchHandler?.({ request: { kind: 'continue' } });

    expect(send).not.toHaveBeenCalled();
  });

  it.each(['applyFinishedRequest', 'applyStoppedRequest', 'applyResumedRequest'] as const)(
    'should advance the head after a mutating turn settles through %s',
    (eventType) => {
      setup({});
      render(<RevisionSeams />);

      terminalHandler('c1', eventType)?.({ messages: mutatingMessages() });

      expect(send).toHaveBeenCalledWith({ type: 'TURN_COMPLETED' });
    },
  );

  it('should advance a terminally failed partial turn because applyFinishedRequest is terminal', () => {
    setup({});
    render(<RevisionSeams />);

    terminalHandler('c1', 'applyFinishedRequest')?.({ messages: mutatingMessages() });

    expect(send).toHaveBeenCalledWith({ type: 'TURN_COMPLETED' });
  });

  it('should not advance the head or clear dirty state after a chat-only turn settles', () => {
    setup({});
    render(<RevisionSeams />);

    terminalHandler('c1', 'applyFinishedRequest')?.({ messages: chatOnlyMessages() });

    expect(send).not.toHaveBeenCalled();
  });

  it('should advance a mutating turn that settles in a background project chat', () => {
    setup({});
    projectChatIds.push('c2');
    installSession('c2');
    render(<RevisionSeams />);

    terminalHandler('c2', 'applyFinishedRequest')?.({ messages: mutatingMessages() });

    expect(send).toHaveBeenCalledWith({ type: 'TURN_COMPLETED' });
  });

  it('should not subscribe to status edges now that terminal emits own completion', () => {
    setup({});
    render(<RevisionSeams />);

    const store = vi.mocked(useChatSessionStore).mock.results.at(-1)?.value;
    expect(store?.subscribeStatus).not.toHaveBeenCalled();
  });
});
