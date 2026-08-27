// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import type { Chat, MyUIMessage } from '@taucad/chat';
import { useRevisions, useVisibleRevisions } from '#hooks/use-revisions.js';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

// ---------------------------------------------------------------------------
// useRevisions head-derivation regression: the stale "Revision 0 · baseline"
// top-bar chip while a Revision demonstrably exists (bug report img3).
//
// `useRevisions` matches the head by TIMESTAMP EQUALITY:
//   headRevision = revisions.find((r) => r.anchor === restorePoint)
//                  ?? (restorePoint === 0 ? latest : undefined)
// `restorePoint` is persisted by Seam 2 (`TURN_COMPLETED`) from a LIVE snapshot
// (`revisions.at(-1).anchor`). If the anchor basis later drifts — e.g. the
// reloaded user messages lack `createdAt`, so every turn collapses onto
// `chat.createdAt` — no revision's anchor equals the persisted `restorePoint`,
// so the head resolves to `undefined` and the chip reads "Revision 0 ·
// baseline" even though Revisions exist and "Return to latest" is offered.
// ---------------------------------------------------------------------------

const actorContext = { headTurnId: '', supersededTurnIds: [] as string[], dirty: false };

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) =>
    selector(actor?.getSnapshot()),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'p' }),
}));

const chatsRef: { current: Chat[] } = { current: [] };
vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({ chats: chatsRef.current }),
}));

vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: vi.fn(),
}));

vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({
  useRevisionActor: () => ({ getSnapshot: () => ({ context: actorContext }) }),
}));

// --- fixtures ---------------------------------------------------------------

const createPart = (targetFile: string, content: string): MyUIMessage['parts'][number] =>
  ({
    type: 'tool-create_file',
    toolCallId: `c-${targetFile}`,
    state: 'output-available',
    input: { targetFile, content },
    output: {
      diffStats: { linesAdded: 1, linesRemoved: 0, originalContent: '', modifiedContent: content },
    },
  }) as unknown as MyUIMessage['parts'][number];

const editPart = (targetFile: string, before: string, after: string): MyUIMessage['parts'][number] =>
  ({
    type: 'tool-edit_file',
    toolCallId: `e-${targetFile}-${after.length}`,
    state: 'output-available',
    input: { targetFile, codeEdit: after },
    output: {
      diffStats: { linesAdded: 1, linesRemoved: 1, originalContent: before, modifiedContent: after },
    },
  }) as unknown as MyUIMessage['parts'][number];

const user = (id: string, createdAt?: number): MyUIMessage =>
  ({
    id,
    role: 'user',
    parts: [{ type: 'text', text: 'p' }],
    ...(createdAt === undefined ? {} : { metadata: { createdAt } }),
  }) as unknown as MyUIMessage;

const assistant = (createdAt: number, parts: MyUIMessage['parts']): MyUIMessage =>
  ({ id: `a-${createdAt}`, role: 'assistant', parts, metadata: { createdAt } }) as unknown as MyUIMessage;

const chat = (createdAt: number, messages: MyUIMessage[], id = 'chatA'): Chat =>
  ({
    id,
    resourceId: 'p',
    name: 'Initial design',
    messages,
    createdAt,
    updatedAt: createdAt,
  }) as unknown as Chat;

const sessions = new Map<string, ChatSession>();
const sessionStore = mock<ChatSessionStore>();

const installSession = (
  chatId: string,
  messages: MyUIMessage[],
  options: {
    requestLifecycle: 'idle' | 'invoking' | 'retrying' | 'stopping';
    status?: 'ready' | 'submitted' | 'streaming' | 'error';
  },
): void => {
  const { requestLifecycle, status = requestLifecycle === 'idle' ? 'ready' : 'streaming' } = options;
  const persistenceActorRef = mock<ChatSession['persistenceActorRef']>();
  const snapshot = {
    context: {
      isLoadingChat: false,
      retryAttempt: requestLifecycle === 'retrying' ? 1 : 0,
    },
    matches: (value: unknown) =>
      typeof value === 'object' &&
      value !== null &&
      'requestLifecycle' in value &&
      value.requestLifecycle === requestLifecycle,
  } as unknown as ReturnType<ChatSession['persistenceActorRef']['getSnapshot']>;
  persistenceActorRef.getSnapshot.mockReturnValue(snapshot);
  persistenceActorRef.subscribe.mockReturnValue({ unsubscribe: vi.fn() });
  const liveChat = { messages, status } as unknown as ChatSession['chat'];
  sessions.set(chatId, { chatId, chat: liveChat, persistenceActorRef } as unknown as ChatSession);
};

beforeEach(() => {
  sessions.clear();
  sessionStore.get.mockImplementation((chatId) => sessions.get(chatId));
  sessionStore.subscribeMembership.mockReturnValue(() => undefined);
  sessionStore.subscribeChat.mockReturnValue(() => undefined);
  vi.mocked(useChatSessionStore).mockReturnValue(sessionStore);
});

// The "Cube Design" session, as it looks AFTER a reload that dropped the user
// messages' `createdAt`: two mutating turns, both anchoring onto chat.createdAt.
const collapsedCubeSession = (): Chat[] => [
  chat(50, [
    user('u1' /* createdAt dropped */),
    assistant(200, [createPart('main.scad', 'a\nb\nc')]),
    user('u2' /* createdAt dropped */),
    assistant(400, [editPart('main.scad', 'a\nb', 'a\nB')]),
  ]),
];

// The same session with intact, distinct user `createdAt` — buildRevisions
// yields two clean Revisions (isolating the head-derivation bug from the
// anchor-collapse bug).
const intactCubeSession = (): Chat[] => [
  chat(50, [
    user('u1', 100),
    assistant(200, [createPart('main.scad', 'a\nb\nc')]),
    user('u2', 300),
    assistant(400, [editPart('main.scad', 'a\nb', 'a\nB')]),
  ]),
];

describe('useRevisions — stale head derivation (REGRESSION)', () => {
  it('T-REV-HEAD-DRIFT: an unresolvable head id falls back to the latest Revision, never baseline', () => {
    // The collapsed session (dropped createdAt) still builds two Revisions after
    // the ownership fix; a head id that no longer resolves (the drift the old
    // anchor-equality match stranded) must fall back to the latest, not baseline.
    chatsRef.current = collapsedCubeSession();
    actorContext.headTurnId = 'stale-drifted-id';
    actorContext.supersededTurnIds = [];
    actorContext.dirty = false;

    const { result } = renderHook(() => useRevisions());

    expect(result.current.maxRevision).toBeGreaterThan(0);
    expect(result.current.headRevision).toBeDefined(); // Never "Revision 0 · baseline".
    expect(result.current.headRevision?.n).toBe(result.current.maxRevision);
  });

  it('T-REV-HEAD-RETURN-TO-LATEST: an unresolvable head must not offer a phantom "Return to latest"', () => {
    chatsRef.current = intactCubeSession();
    actorContext.headTurnId = 'does-not-exist';
    actorContext.supersededTurnIds = [];
    actorContext.dirty = false;

    const { result } = renderHook(() => useRevisions());

    expect(result.current.maxRevision).toBe(2);
    expect(result.current.headRevision?.n).toBe(2);
    expect(result.current.canReturnToLatest).toBe(false);
  });

  it('T-REV-HEAD-TIP: the tip sentinel ("") resolves to the newest Revision', () => {
    chatsRef.current = intactCubeSession();
    actorContext.headTurnId = '';
    actorContext.supersededTurnIds = [];
    actorContext.dirty = false;

    const { result } = renderHook(() => useRevisions());

    expect(result.current.headRevision?.n).toBe(2);
    expect(result.current.canReturnToLatest).toBe(false);
  });

  it('T-REV-HEAD-PARKED: a valid non-tip head id resolves to that Revision and offers "Return to latest"', () => {
    chatsRef.current = intactCubeSession();
    actorContext.headTurnId = 'u1'; // Parked at the first Revision.
    actorContext.supersededTurnIds = [];
    actorContext.dirty = false;

    const { result } = renderHook(() => useRevisions());

    expect(result.current.headRevision?.messageId).toBe('u1');
    expect(result.current.headRevision?.n).toBe(1);
    expect(result.current.canReturnToLatest).toBe(true);
  });
});

describe('useVisibleRevisions — turn completion visibility', () => {
  it.each(['invoking', 'retrying', 'stopping'] as const)(
    'should withhold the latest mutating turn while its request lifecycle is %s',
    (requestLifecycle) => {
      const messages = [
        user('u1', 100),
        assistant(200, [createPart('main.scad', 'a')]),
        user('u2', 300),
        assistant(400, [editPart('main.scad', 'a', 'b')]),
      ];
      chatsRef.current = [chat(50, messages)];
      installSession('chatA', messages, {
        requestLifecycle,
        status: requestLifecycle === 'retrying' ? 'error' : 'streaming',
      });

      const { result } = renderHook(() => useVisibleRevisions());

      expect(result.current.revisions.map((revision) => revision.messageId)).toEqual(['u1']);
      expect(result.current.byMessageId.has('u2')).toBe(false);
      expect(result.current.maxRevision).toBe(1);
      expect(result.current.headRevision?.messageId).toBe('u1');
    },
  );

  it('should reveal a partial mutating turn after terminal failure settles to idle', () => {
    const messages = [user('u1', 100), assistant(200, [createPart('main.scad', 'a')])];
    chatsRef.current = [chat(50, messages)];
    installSession('chatA', messages, { requestLifecycle: 'idle', status: 'error' });

    const { result } = renderHook(() => useVisibleRevisions());

    expect(result.current.revisions.map((revision) => revision.messageId)).toEqual(['u1']);
    expect(result.current.headRevision?.messageId).toBe('u1');
  });

  it('should withhold in-progress turns from background chats and keep completed-only numbering contiguous', () => {
    const firstMessages = [user('u1', 100), assistant(200, [createPart('a.scad', 'a')])];
    const secondMessages = [user('u2', 300), assistant(400, [createPart('b.scad', 'b')])];
    chatsRef.current = [chat(50, firstMessages, 'chatA'), chat(60, secondMessages, 'chatB')];
    installSession('chatB', secondMessages, { requestLifecycle: 'invoking' });

    const { result } = renderHook(() => useVisibleRevisions());

    expect(result.current.revisions.map(({ messageId, n }) => ({ messageId, n }))).toEqual([{ messageId: 'u1', n: 1 }]);
    expect(result.current.maxRevision).toBe(1);
  });

  it('should preserve a contiguous sequence when multiple concurrent turns are hidden', () => {
    const chatA = [user('u1', 100), assistant(110, [createPart('a.scad', 'a')])];
    const chatB = [user('u2', 200), assistant(210, [createPart('b.scad', 'b')])];
    const chatC = [user('u3', 300), assistant(310, [createPart('c.scad', 'c')])];
    const chatD = [user('u4', 400), assistant(410, [createPart('d.scad', 'd')])];
    chatsRef.current = [
      chat(50, chatA, 'chatA'),
      chat(60, chatB, 'chatB'),
      chat(70, chatC, 'chatC'),
      chat(80, chatD, 'chatD'),
    ];
    installSession('chatB', chatB, { requestLifecycle: 'invoking' });
    installSession('chatD', chatD, { requestLifecycle: 'stopping' });

    const { result } = renderHook(() => useVisibleRevisions());

    expect(result.current.revisions.map(({ messageId, n }) => ({ messageId, n }))).toEqual([
      { messageId: 'u1', n: 1 },
      { messageId: 'u3', n: 2 },
    ]);
    expect(result.current.maxRevision).toBe(2);
  });

  it('should leave raw milestone revisions available while the visible view withholds them', () => {
    const messages = [user('u1', 100), assistant(200, [createPart('main.scad', 'a')])];
    chatsRef.current = [chat(50, messages)];
    installSession('chatA', messages, { requestLifecycle: 'invoking' });

    const raw = renderHook(() => useRevisions());
    const visible = renderHook(() => useVisibleRevisions());

    expect(raw.result.current.revisions.map((revision) => revision.messageId)).toEqual(['u1']);
    expect(visible.result.current.revisions).toEqual([]);
  });
});
