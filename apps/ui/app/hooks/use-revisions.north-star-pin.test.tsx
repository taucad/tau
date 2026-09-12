// @vitest-environment jsdom
/**
 * Red pin for the workspace-filesystem north star, wave W0.
 *
 * The assertion states the target behaviour, so it fails today. It is wrapped
 * in `it.fails` (execution-queue ruling P2) to keep the suite green while the
 * defect stands; the wave that fixes it removes `.fails`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Chat, MyUIMessage } from '@taucad/chat';
import type { PersistedRevisionGraphNode, PersistedRevisionGraphState } from '#types/revision.types.js';
import { useRevisions } from '#hooks/use-revisions.js';

const actorContext: {
  headTurnId: string;
  supersededTurnIds: string[];
  dirty: boolean;
  graph: PersistedRevisionGraphState;
} = { headTurnId: '', supersededTurnIds: [], dirty: false, graph: { activeBranch: 'main', nodes: {}, branches: {} } };

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

vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({
  useRevisionActor: () => ({ getSnapshot: () => ({ context: actorContext }) }),
}));

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

const user = (id: string, createdAt: number): MyUIMessage =>
  ({ id, role: 'user', parts: [{ type: 'text', text: 'p' }], metadata: { createdAt } }) as unknown as MyUIMessage;

const assistant = (createdAt: number, parts: MyUIMessage['parts']): MyUIMessage =>
  ({ id: `a-${createdAt}`, role: 'assistant', parts, metadata: { createdAt } }) as unknown as MyUIMessage;

const chat = (id: string, createdAt: number, messages: MyUIMessage[]): Chat =>
  ({
    id,
    resourceId: 'p',
    name: id,
    messages,
    createdAt,
    updatedAt: createdAt,
  }) as unknown as Chat;

/** The first chat's turn, then a second chat's turn whose first parent is it. */
const firstChat = (): Chat => chat('chat_first', 50, [user('u1', 100), assistant(200, [createPart('a.scad', 'a')])]);
const secondChat = (): Chat =>
  chat('chat_second', 1000, [user('u2', 1100), assistant(1200, [createPart('b.scad', 'b')])]);

const node = (turnId: string, chatId: string, parentTurnIds: string[]): PersistedRevisionGraphNode =>
  ({
    turnId,
    parentTurnIds,
    branchName: 'main',
    chatId,
    jobIds: [],
    status: 'complete',
    revisionId: `rev-${turnId}`,
  }) satisfies PersistedRevisionGraphNode;

beforeEach(() => {
  actorContext.headTurnId = '';
  actorContext.supersededTurnIds = [];
  actorContext.dirty = false;
  // Both revisions stay in the stored graph; only the chat is removed.
  actorContext.graph = {
    activeBranch: 'main',
    nodes: {
      u1: node('u1', 'chat_first', []),
      u2: node('u2', 'chat_second', ['u1']),
    },
    branches: {},
  };
  chatsRef.current = [firstChat(), secondChat()];
});

describe('revision numbering across chat deletion (north star W0)', () => {
  // oxlint-disable-next-line eslint/capitalized-comments -- the pin header is the exact wording the W0 brief specifies
  // north-star W0 pin 3: `Rev N` changes when a chat is deleted because the number is a positional index over chat-derived timeline nodes instead of the first-parent ordinal on the stored graph; turns green in W5; remove .fails then.
  it.fails('should keep a revision number stable when another chat is deleted', () => {
    const { result, rerender } = renderHook(() => useRevisions());
    const before = result.current.byMessageId.get('u2')?.n;
    expect(before).toBe(2);

    chatsRef.current = [secondChat()];
    rerender();

    expect(result.current.byMessageId.get('u2')?.n).toBe(before);
  });
});
