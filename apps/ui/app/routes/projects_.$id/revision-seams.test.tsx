import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';
import { RevisionSeams } from '#routes/projects_.$id/revision-seams.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useRevisionActor } from '#routes/projects_.$id/revision-provider.js';
import { useRevisions } from '#hooks/use-revisions.js';
import type { RevisionsView } from '#hooks/use-revisions.js';
import type { Revision } from '#lib/file-restore-timeline.js';

vi.mock('#hooks/active-chat-provider.js', () => ({
  useActiveChatSession: vi.fn(),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: vi.fn(),
}));
vi.mock('#routes/projects_.$id/revision-provider.js', () => ({
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
let statusListener: (() => void) | undefined;
let currentStatus = 'ready';

const setup = (view: Partial<RevisionsView>): void => {
  send.mockClear();
  dispatchHandler = undefined;
  statusListener = undefined;
  currentStatus = 'ready';

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

  const persistenceActorRef = mock<ChatSession['persistenceActorRef']>();
  persistenceActorRef.on.mockImplementation(
    (event: string, handler: (payload: { request: { kind: string } }) => void) => {
      if (event === 'dispatchRequest') {
        dispatchHandler = handler;
      }
      return { unsubscribe: vi.fn() };
    },
  );
  const session = mock<ChatSession>({ persistenceActorRef });

  const store = mock<ChatSessionStore>();
  store.get.mockReturnValue(session);
  store.getStatus.mockImplementation(() => currentStatus as ReturnType<ChatSessionStore['getStatus']>);
  store.subscribeStatus.mockImplementation((_chatId, listener) => {
    statusListener = listener;
    return () => undefined;
  });
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

  it('T-WIRE-STATUS-COMPLETE: a streaming→ready edge advances the head to the latest anchor', () => {
    setup({
      revisions: [rev({ anchor: 100, n: 1 }), rev({ messageId: 'u2', anchor: 200, n: 2 })],
    });
    render(<RevisionSeams />);

    currentStatus = 'streaming';
    statusListener?.();
    currentStatus = 'ready';
    statusListener?.();

    expect(send).toHaveBeenCalledWith({ type: 'TURN_COMPLETED' });
  });

  it('T-WIRE-STATUS-COMPLETE: unrelated status edges do not advance the head', () => {
    setup({ revisions: [rev({ anchor: 100, n: 1 })] });
    render(<RevisionSeams />);

    currentStatus = 'submitted';
    statusListener?.();

    expect(send).not.toHaveBeenCalled();
  });
});
