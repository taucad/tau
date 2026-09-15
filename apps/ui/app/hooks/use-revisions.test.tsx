// @vitest-environment jsdom
/**
 * `useRevisions` reads the host-attested graph and nothing else (S10, I3).
 *
 * The number, "Current", dirty and *Return to latest* are all answers the
 * revision root already gave — the first-parent ordinal on the selected branch,
 * the checkout's head, the checkout machine's own state — so this suite scripts
 * that root and asserts what the hook makes of its answers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { RevisionRow } from '@taucad/revisions';
import type { TurnFinalizedEvent } from '@taucad/revisions/revision-effects';
import { useRevisionChanges, useRevisionFileComparison, useRevisions } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});

const settlements: TurnFinalizedEvent[] = [];
vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', () => ({
  getHostFinalizedTurns: () => settlements,
  subscribeHostFinalizedTurns: () => () => undefined,
}));

const row = (over: Partial<RevisionRow> & Pick<RevisionRow, 'revisionId'>): RevisionRow => ({
  revisionNumber: undefined,
  changeId: `change-${over.revisionId}`,
  actor: 'tau-browser-agent-host',
  source: 'agent',
  createdAt: 1_788_220_800_000,
  summary: 'Agent turn u1',
  conflicted: false,
  turnId: undefined,
  tags: [],
  ...over,
});

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  revisionStatusHarness.reset();
  settlements.length = 0;
});

describe('useRevisions', () => {
  it('reads the branch, its history and the head the projection reports', async () => {
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-2', revisionNumber: 2, turnId: 'u2' }),
      row({ revisionId: 'rev-1', revisionNumber: 1, turnId: 'u1' }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main', headRevisionId: 'rev-2' };

    const { result } = renderHook(() => useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.revisions).toHaveLength(2);
    });
    expect(result.current.branch).toBe('main');
    expect(result.current.headRevisionId).toBe('rev-2');
    expect(result.current.revisions.map((revision) => revision.n)).toEqual([2, 1]);
    expect(result.current.byTurnId.get('u1')?.revisionId).toBe('rev-1');
    /* The head *is* the newest revision on the branch, so there is nothing to
     * return to — the control stays hidden rather than offering a no-op. */
    expect(result.current.canReturnToLatest).toBe(false);
  });

  it('settles an empty branch instead of treating its disabled history query as loading', async () => {
    const { result } = renderHook(() => useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.revisions).toEqual([]);
  });

  it('offers Return to latest only while the checkout sits behind the branch tip', async () => {
    revisionStatusHarness.rows = [
      row({ revisionId: 'rev-2', revisionNumber: 2 }),
      row({ revisionId: 'rev-1', revisionNumber: 1 }),
    ];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main', headRevisionId: 'rev-1' };

    const { result } = renderHook(() => useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.canReturnToLatest).toBe(true);
    });
  });

  it('takes dirty from the checkout machine rather than recomputing it', async () => {
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1 })];
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
      headRevisionId: 'rev-1',
      dirty: true,
    };

    const { result } = renderHook(() => useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.isDirty).toBe(true);
    });
  });

  it('derives each branch revision number and divergence from graph history', async () => {
    const base = row({ revisionId: 'base', revisionNumber: 1 });
    revisionStatusHarness.rows = [row({ revisionId: 'main-2', revisionNumber: 2 }), base];
    revisionStatusHarness.rowsByBranch.set('feature', [row({ revisionId: 'feature-2', revisionNumber: 2 }), base]);
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
      headRevisionId: 'main-2',
      branches: [
        { name: 'main', head: 'main-2', checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        { name: 'feature', head: 'feature-2', checkoutId: 'co-2', checkoutRoot: '/checkouts/co-2', leaseChatIds: [] },
      ],
    };

    const { result } = renderHook(() => useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.branchFacts?.get('feature')).toEqual({ revisionNumber: 2, ahead: 1, behind: 1 });
    });
    expect(result.current.branchFacts?.get('main')).toEqual({ revisionNumber: 2, ahead: 0, behind: 0 });
  });

  it('carries a card for a turn a remote host settled, which this graph does not hold', async () => {
    settlements.push({
      type: 'turn.finalized',
      turnId: 'u9',
      runId: 'run-9',
      chatId: 'chat-1',
      projectId: 'p',
      checkoutId: 'live',
      revisionId: 'rev-remote',
      branch: 'main',
      changedPaths: ['main.scad'],
      trigger: 'turn',
      runIds: ['run-9'],
    });
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main', headRevisionId: 'rev-remote' };

    const { result } = renderHook(() => useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.byTurnId.get('u9')?.revisionId).toBe('rev-remote');
    });
    /* No row names it on this branch, so it carries no number rather than
     * inventing a position. */
    expect(result.current.byTurnId.get('u9')?.n).toBeUndefined();
  });

  it('prefers the graph row over a settlement for the same turn, because the row has its number', async () => {
    settlements.push({
      type: 'turn.finalized',
      turnId: 'u1',
      runId: 'run-1',
      chatId: 'chat-1',
      projectId: 'p',
      checkoutId: 'live',
      revisionId: 'rev-1',
      changedPaths: ['main.scad'],
      trigger: 'turn',
      runIds: ['run-1'],
    });
    revisionStatusHarness.rows = [row({ revisionId: 'rev-1', revisionNumber: 1, turnId: 'u1' })];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main', headRevisionId: 'rev-1' };

    const { result } = renderHook(() => useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.byTurnId.get('u1')?.n).toBe(1);
    });
  });

  it("keeps a settled turn's branch metadata when another branch is selected", async () => {
    settlements.push({
      type: 'turn.finalized',
      turnId: 'u3',
      runId: 'run-3',
      chatId: 'chat-1',
      projectId: 'p',
      checkoutId: 'candidate-1',
      revisionId: 'rev-3',
      branch: 'isolated-run',
      changedPaths: ['main.scad'],
      trigger: 'turn',
      runIds: ['run-3'],
    });
    const candidate = row({
      revisionId: 'rev-3',
      revisionNumber: 3,
      turnId: 'u3',
      createdAt: 1_788_307_200_000,
      summary: 'Agent turn u3',
    });
    revisionStatusHarness.rowsByBranch.set('isolated-run', [candidate]);
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
      branches: [
        { name: 'main', head: 'rev-2', checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'isolated-run',
          head: 'rev-3',
          checkoutId: 'candidate-1',
          checkoutRoot: '/checkouts/candidate-1',
          leaseChatIds: ['chat-1'],
        },
      ],
    };

    const { result } = renderHook(() => useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.byTurnId.get('u3')).toMatchObject({
        revisionId: 'rev-3',
        n: 3,
        createdAt: 1_788_307_200_000,
        summary: 'Agent turn u3',
      });
    });
  });

  it('refreshes a settled branch whose cached facet head predates the settlement', async () => {
    settlements.push({
      type: 'turn.finalized',
      turnId: 'u3',
      runId: 'run-3',
      chatId: 'chat-1',
      projectId: 'p',
      checkoutId: 'candidate-1',
      revisionId: 'rev-3',
      branch: 'isolated-run',
      changedPaths: ['main.scad'],
      trigger: 'turn',
      runIds: ['run-3'],
    });
    revisionStatusHarness.rowsByBranch.set('isolated-run', [
      row({ revisionId: 'rev-3', revisionNumber: 3, turnId: 'u3' }),
    ]);
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
      branches: [
        { name: 'main', head: 'rev-2', checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'isolated-run',
          head: 'rev-1',
          checkoutId: 'candidate-1',
          checkoutRoot: '/checkouts/candidate-1',
          leaseChatIds: ['chat-1'],
        },
      ],
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['revision-log', 'p', 'isolated-run', 'rev-1'], []);
    const cachedWrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRevisions(), { wrapper: cachedWrapper });

    await waitFor(() => {
      expect(result.current.byTurnId.get('u3')?.n).toBe(3);
    });
  });

  it('reads nothing at all until the root has answered with a branch', () => {
    const { result } = renderHook(() => useRevisions(), { wrapper });
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: undefined };

    expect(result.current.revisions).toEqual([]);
    expect(result.current.canReturnToLatest).toBe(false);
  });
});

describe('useRevisionChanges', () => {
  it('asks the graph which paths a revision changed', async () => {
    revisionStatusHarness.diff = [
      { path: 'main.scad', kind: 'modified' },
      { path: 'part.scad', kind: 'added' },
    ];
    const card: RevisionCard = {
      revisionId: 'rev-1',
      n: 1,
      createdAt: 0,
      summary: '',
      actor: '',
      turnId: 'u1',
      conflicted: false,
      trigger: 'turn',
    };

    const { result } = renderHook(() => useRevisionChanges(card), { wrapper });

    await waitFor(() => {
      expect(result.current).toHaveLength(2);
    });
    expect(result.current[1]).toEqual({ path: 'part.scad', kind: 'added' });
  });

  it('re-reads the working side every time it is opened, not only after a save (review R7)', async () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, dirty: true, headRevisionId: 'rev-1' };
    revisionStatusHarness.comparison = { original: 'one', modified: 'first edit' };

    const first = renderHook(() => useRevisionFileComparison('rev-1', 'main.scad', 'checkout'), { wrapper });
    await waitFor(() => {
      expect(first.result.current.modified).toBe('first edit');
    });
    first.unmount();

    /* A second edit inside the same dirty window: the head has not moved, which
     * is exactly the case a cached answer could not see. */
    revisionStatusHarness.comparison = { original: 'one', modified: 'second edit' };

    const second = renderHook(() => useRevisionFileComparison('rev-1', 'main.scad', 'checkout'), { wrapper });

    await waitFor(() => {
      expect(second.result.current.modified).toBe('second edit');
    });
  });

  it('serves a remote settlement from the paths its host attested, without asking a graph that lacks it', async () => {
    revisionStatusHarness.diff = [{ path: 'never-read.scad', kind: 'modified' }];
    const card: RevisionCard = {
      revisionId: 'rev-remote',
      n: undefined,
      createdAt: 0,
      summary: '',
      actor: '',
      turnId: 'u9',
      conflicted: false,
      trigger: 'turn',
      changedPaths: ['main.scad'],
    };

    const { result } = renderHook(() => useRevisionChanges(card), { wrapper });

    expect(result.current).toEqual([{ path: 'main.scad', kind: 'modified' }]);
  });
});
