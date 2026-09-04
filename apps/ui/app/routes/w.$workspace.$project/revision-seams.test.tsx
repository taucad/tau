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
import { emptyRevisionGraph } from '#lib/revision-graph.js';
import { useFinalizedChatWorkspaces } from '#providers/chat-workspace-authority-provider.js';
import type { FinalizedChatWorkspace } from '#providers/chat-workspace-authority-provider.js';
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
  useChats: () => ({ chats: projectChatIds.map((id) => mock<Chat>({ id })) }),
}));
vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({
  useRevisionActor: vi.fn(),
}));
vi.mock('#hooks/use-revisions.js', () => ({ useRevisions: vi.fn() }));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useFinalizedChatWorkspaces: vi.fn(),
}));

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
const dispatchHandlers = new Map<string, (event: { request: { kind: string; message?: MyUIMessage } }) => void>();
const terminalHandlers = new Map<string, (event: { messages: MyUIMessage[] }) => void>();
const sessions = new Map<string, ChatSession>();
const store = mock<ChatSessionStore>();
let finalizedWorkspaces: readonly FinalizedChatWorkspace[] = [];

const finalizedWorkspace = (over: Partial<FinalizedChatWorkspace> = {}): FinalizedChatWorkspace => ({
  projectId: 'p1',
  turnId: 'u-authoritative-1',
  revisionId: 'rev-authoritative-1',
  baseRevisionId: 'rev-base',
  treeId: 'tree-authoritative-1',
  branchName: 'main',
  publication: {
    status: 'updated',
    branchName: 'main',
    expectedHeadRevisionId: 'rev-base',
    previousHeadRevisionId: 'rev-base',
    headRevisionId: 'rev-authoritative-1',
  },
  changedPaths: ['main.ts'],
  provenance: { source: 'agent', actorId: 'tau-chat-runner', runId: 'run-1', createdAt: 100 },
  generatedSummary: 'Built the model',
  chatId: 'c1',
  jobIds: [],
  workspaceId: 'workspace-1',
  nativeGit: { status: 'not-configured' },
  ...over,
});

const terminalHandler = (chatId: string, event: string) => terminalHandlers.get(`${chatId}:${event}`);

const installSession = (chatId: string): void => {
  const persistenceActorRef = mock<ChatSession['persistenceActorRef']>();
  persistenceActorRef.on.mockImplementation((event: string, handler: (payload: never) => void) => {
    if (event === 'dispatchRequest') {
      dispatchHandlers.set(chatId, handler as (event: { request: { kind: string; message?: MyUIMessage } }) => void);
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
  dispatchHandlers.clear();
  terminalHandlers.clear();
  sessions.clear();
  finalizedWorkspaces = [];
  projectChatIds.splice(0, projectChatIds.length, 'c1');
  installSession('c1');

  vi.mocked(useActiveChatSession).mockReturnValue(
    mock<ReturnType<typeof useActiveChatSession>>({ activeChatId: 'c1' }),
  );
  vi.mocked(useRevisionActor).mockReturnValue(mock<ReturnType<typeof useRevisionActor>>({ send }));
  vi.mocked(useRevisions).mockReturnValue({
    revisions: view.revisions ?? [],
    byMessageId: view.byMessageId ?? new Map<string, Revision>(),
    headRevision: view.headRevision,
    maxRevision: view.maxRevision ?? 0,
    headTurnId: view.headTurnId ?? '',
    isDirty: view.isDirty ?? false,
    canReturnToLatest: view.canReturnToLatest ?? false,
    graph: view.graph ?? emptyRevisionGraph(),
  });

  store.get.mockImplementation((chatId) => sessions.get(chatId));
  store.subscribeMembership.mockReturnValue(() => undefined);
  vi.mocked(useChatSessionStore).mockReturnValue(store);
  vi.mocked(useFinalizedChatWorkspaces).mockImplementation(() => finalizedWorkspaces);
};

beforeEach(() => {
  setup({});
});

describe('RevisionSeams', () => {
  it('dispatches each authoritative workspace/revision pair once while admitting a later result', () => {
    setup({});
    const first = finalizedWorkspace();
    finalizedWorkspaces = [first];
    const { rerender } = render(<RevisionSeams />);

    expect(send).toHaveBeenCalledWith({ type: 'authoritativeRevisionFinalized', result: first });

    finalizedWorkspaces = [{ ...first }];
    rerender(<RevisionSeams />);
    expect(send).toHaveBeenCalledTimes(1);

    const second = finalizedWorkspace({
      turnId: 'u-authoritative-2',
      revisionId: 'rev-authoritative-2',
      treeId: 'tree-authoritative-2',
    });
    finalizedWorkspaces = [first, second];
    rerender(<RevisionSeams />);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ type: 'authoritativeRevisionFinalized', result: second });
  });

  it('T-WIRE-SUBMIT-FORK: a new user turn (kind:send) below the tip sends NEW_USER_TURN with the abandoned tail', () => {
    setup({
      revisions: [rev({ messageId: 'u1', anchor: 100, n: 1 }), rev({ messageId: 'u2', anchor: 200, n: 2 })],
      headRevision: rev({ messageId: 'u1', anchor: 100, n: 1 }),
    });
    render(<RevisionSeams />);

    dispatchHandlers.get('c1')?.({ request: { kind: 'send', message: userMessage('u3') } });

    expect(send).toHaveBeenCalledWith({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: ['u2'],
      atRevision: 1,
      newTurnId: 'u3',
      chatId: 'c1',
      parentTurnId: 'u1',
    });
  });

  it('T-WIRE-SUBMIT-FORK: a new user turn at the tip sends an empty abandoned set (no fork)', () => {
    const latest = rev({ messageId: 'u2', anchor: 200, n: 2 });
    setup({
      revisions: [rev({ messageId: 'u1', anchor: 100, n: 1 }), latest],
      headRevision: latest,
    });
    render(<RevisionSeams />);

    dispatchHandlers.get('c1')?.({ request: { kind: 'send', message: userMessage('u3') } });

    expect(send).toHaveBeenCalledWith({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: [],
      atRevision: 2,
      newTurnId: 'u3',
      chatId: 'c1',
      parentTurnId: 'u2',
    });
  });

  it('T-WIRE-IGNORE-KIND: retry / regenerate / continue do not fork', () => {
    setup({
      revisions: [rev({ messageId: 'u1', anchor: 100, n: 1 }), rev({ messageId: 'u2', anchor: 200, n: 2 })],
      headRevision: rev({ messageId: 'u1', anchor: 100, n: 1 }),
    });
    render(<RevisionSeams />);

    dispatchHandlers.get('c1')?.({ request: { kind: 'retry' } });
    dispatchHandlers.get('c1')?.({ request: { kind: 'regenerate' } });
    dispatchHandlers.get('c1')?.({ request: { kind: 'continue' } });

    expect(send).not.toHaveBeenCalled();
  });

  it.each(['applyFinishedRequest', 'applyStoppedRequest', 'applyResumedRequest'] as const)(
    'should retire the pending transcript turn without claiming publication through %s',
    (eventType) => {
      setup({});
      render(<RevisionSeams />);

      terminalHandler('c1', eventType)?.({ messages: mutatingMessages() });

      expect(send).toHaveBeenCalledWith({ type: 'DISCARD_PENDING_TURN', turnId: 'u1' });
      expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TURN_COMPLETED' }));
    },
  );

  it('should not advance a terminally failed partial turn containing successful file tool output', () => {
    setup({});
    render(<RevisionSeams />);

    terminalHandler('c1', 'applyFinishedRequest')?.({ messages: mutatingMessages() });

    expect(send).toHaveBeenCalledWith({ type: 'DISCARD_PENDING_TURN', turnId: 'u1' });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TURN_COMPLETED' }));
  });

  it('retires the pending graph reservation without advancing the revision head after a chat-only turn settles', () => {
    setup({});
    render(<RevisionSeams />);

    terminalHandler('c1', 'applyFinishedRequest')?.({ messages: chatOnlyMessages() });

    expect(send).toHaveBeenCalledWith({ type: 'DISCARD_PENDING_TURN', turnId: 'u1' });
  });

  it('should retire a mutating transcript turn that settles in a background project chat', () => {
    setup({});
    projectChatIds.push('c2');
    installSession('c2');
    render(<RevisionSeams />);

    terminalHandler('c2', 'applyFinishedRequest')?.({ messages: mutatingMessages() });

    expect(send).toHaveBeenCalledWith({ type: 'DISCARD_PENDING_TURN', turnId: 'u1' });
  });

  it('registers a new turn dispatched from a background project chat', () => {
    setup({ headRevision: rev({ messageId: 'u1', n: 1 }) });
    projectChatIds.push('c2');
    installSession('c2');
    render(<RevisionSeams />);

    dispatchHandlers.get('c2')?.({ request: { kind: 'send', message: userMessage('u9') } });

    expect(send).toHaveBeenCalledWith({
      type: 'NEW_USER_TURN',
      abandonedTurnIds: [],
      atRevision: 1,
      newTurnId: 'u9',
      chatId: 'c2',
      parentTurnId: 'u1',
    });
  });

  it('should not subscribe to status edges now that terminal emits own completion', () => {
    setup({});
    render(<RevisionSeams />);

    expect(store.subscribeStatus).not.toHaveBeenCalled();
  });
});
