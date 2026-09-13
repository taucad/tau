// @vitest-environment jsdom
/**
 * Red pin for the workspace-filesystem north star, wave W0 — flipped in W5.
 *
 * The number a card shows is the **first-parent ordinal on the selected
 * branch**, answered by the graph at read time (I3, AC3). Chat membership is
 * not an input to it at all, which is what makes it stable when a chat is gone:
 * the hook asks the revision root, and nothing in that answer knows how many
 * chats this project has.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Chat } from '@taucad/chat';
import type { RevisionRow } from '@taucad/revisions';
import { useRevisions } from '#hooks/use-revisions.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});

const chatsRef: { current: readonly Chat[] } = { current: [] };
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats: chatsRef.current }) }));

const chat = (id: string): Chat =>
  ({ id, resourceId: 'p', name: id, messages: [], createdAt: 0, updatedAt: 0 }) satisfies Partial<Chat> as Chat;

/**
 * Two turns on one branch, one per chat: `u1` is the branch's first revision
 * and `u2` descends from it, so the ordinals are 1 and 2.
 */
const row = (turnId: string, revisionId: string, parentOrdinal: number): RevisionRow => ({
  revisionNumber: parentOrdinal,
  revisionId,
  changeId: `change-${turnId}`,
  actor: 'tau-browser-agent-host',
  source: 'agent',
  createdAt: 1000 * parentOrdinal,
  summary: `Agent turn ${turnId}`,
  conflicted: false,
  turnId,
  tags: [],
});

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  revisionStatusHarness.reset();
  revisionStatusHarness.rows = [row('u2', 'rev-u2', 2), row('u1', 'rev-u1', 1)];
  revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main', headRevisionId: 'rev-u2' };
  chatsRef.current = [chat('chat_first'), chat('chat_second')];
});

describe('revision numbering across chat deletion (north star W0)', () => {
  it('should read Rev N as the first-parent ordinal the graph answered', async () => {
    const { result } = renderHook(() => useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.byTurnId.get('u2')?.n).toBe(2);
    });
    expect(result.current.byTurnId.get('u1')?.n).toBe(1);
  });

  it('should keep a revision number stable when another chat is deleted', async () => {
    const { result, rerender } = renderHook(() => useRevisions(), { wrapper });
    await waitFor(() => {
      expect(result.current.byTurnId.get('u2')?.n).toBe(2);
    });
    const before = result.current.byTurnId.get('u2')?.n;

    chatsRef.current = [chat('chat_second')];
    rerender();

    expect(result.current.byTurnId.get('u2')?.n).toBe(before);
  });
});
