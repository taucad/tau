import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RevisionGraph, RevisionLogRequest, RevisionRow, RevisionStatusProjection } from '@taucad/revisions';
import { createRevisionHistoryHooks, revisionPageSize } from '#hooks/use-revisions.js';
import type { RevisionAuthorship, RevisionHistoryServices, RevisionSettlementStore } from '#hooks/use-revisions.js';
import type { RevisionClient } from '#types/revision-client.types.js';

const row = (over: Partial<RevisionRow> & Pick<RevisionRow, 'revisionId'>): RevisionRow => ({
  revisionNumber: undefined,
  changeId: `change-${over.revisionId}`,
  who: { kind: 'recorded', identity: { kind: 'user', id: 'usr_ada' } },
  source: 'user',
  createdAt: 1_788_220_800_000,
  summary: 'Saved',
  conflicted: false,
  turnId: undefined,
  tags: [],
  ...over,
});

/** A numbered first-parent line, newest first: `rev-<count>` down to `rev-1`. */
const line = (count: number): readonly RevisionRow[] =>
  Array.from({ length: count }, (_, index) => {
    const n = count - index;
    return row({ revisionId: `rev-${n}`, revisionNumber: n, ...(n > 1 ? { parent: `rev-${n - 1}` } : {}) });
  });

/* What the services answer, and what the hooks asked of them. */
const state = {
  status: undefined as RevisionStatusProjection | undefined,
  rows: [] as readonly RevisionRow[],
  graph: undefined as RevisionGraph | undefined,
  logRequests: [] as RevisionLogRequest[],
  settlements: [] as Array<{ turnId: string; revisionId: string; changedPaths: readonly string[] }>,
};

const emptyStatus: RevisionStatusProjection = {
  projectId: 'p',
  checkoutId: 'live',
  checkoutRoot: '/projects/p',
  line: { kind: 'branch', name: 'main' },
  registrySettled: true,
  projectDirty: false,
  dirty: false,
  minting: false,
  headRevisionId: undefined,
  follow: 'chat',
  attention: 0,
  restore: { busy: false, revisionNumber: undefined, undoable: false, canUndo: false },
  remote: {
    kind: 'none',
    url: undefined,
    phase: 'none',
    storage: undefined,
    overQuota: [],
    error: undefined,
    reason: undefined,
    fetchOnly: false,
    provider: undefined,
    repositoryId: undefined,
    quota: undefined,
  },
  branches: [],
  branchVerb: { busy: false, operation: undefined, branch: undefined },
  publish: { phase: 'idle', tags: [], publicationId: undefined, shareUrl: undefined, error: undefined },
  sync: {
    state: 'noRemote',
    pendingCount: 0,
    online: true,
    conflictRef: undefined,
    error: undefined,
    reason: undefined,
  },
  conflicts: [],
};

const branchAt = (name: string, head: string | undefined): RevisionStatusProjection['branches'][number] => ({
  name,
  head,
  checkoutId: name,
  checkoutRoot: `/projects/${name}`,
  leaseChatIds: [],
});

const statusOn = (
  head: string | undefined,
  over: Partial<RevisionStatusProjection> = {},
): RevisionStatusProjection => ({
  ...emptyStatus,
  headRevisionId: head,
  branches: [branchAt('main', head)],
  ...over,
});

const client = mock<RevisionClient>({
  log: async (request?: RevisionLogRequest): Promise<readonly RevisionRow[]> => {
    state.logRequests.push(request ?? {});
    if (request?.from !== undefined) {
      return state.rows.filter((entry) => entry.revisionId === request.from);
    }
    return request?.limit === undefined ? state.rows : state.rows.slice(0, request.limit);
  },
  graph: async (request?: Readonly<{ limit?: number }>): Promise<RevisionGraph> => {
    const graph = state.graph ?? { branches: [], rows: [] };
    return request?.limit === undefined ? graph : { ...graph, rows: graph.rows.slice(0, request.limit) };
  },
  divergence: async () => ({ ahead: 0, behind: 0 }),
  diff: async () => [],
  compare: async () => ({ original: 'a', modified: 'b', kind: 'text', change: 'modified', notices: [] }),
  subscribeEvents: () => () => undefined,
});

const store: RevisionSettlementStore = {
  observedChatIdsOf: () => (state.settlements.length === 0 ? [] : ['chat-1']),
  subscribeMembership: () => () => undefined,
  subscribeProjection: () => () => undefined,
  getProjection: () =>
    ({
      ledger: {
        position: { cursor: state.settlements.length },
        runs: Object.fromEntries(
          state.settlements.map((settlement, index) => [
            `run-${index}`,
            {
              settlements: [
                {
                  event: {
                    type: 'turn.finalized',
                    runId: `run-${index}`,
                    turnId: settlement.turnId,
                    revisionId: settlement.revisionId,
                    changedPaths: settlement.changedPaths,
                  },
                },
              ],
            },
          ]),
        ),
      },
    }) as unknown as ReturnType<RevisionSettlementStore['getProjection']>,
};

const authorship: RevisionAuthorship = {
  accountId: 'usr_ada',
  whoOf: (entry) => ({ line: entry.source === 'agent' ? 'Agent' : '', isYou: entry.source !== 'agent' }),
};

const holdRevisionGraph = vi.fn<RevisionHistoryServices['pushRecords']['holdRevisionGraph']>();
const refreshPushRecords = vi.fn<RevisionHistoryServices['pushRecords']['refreshPushRecords']>();

const hooks = createRevisionHistoryHooks({
  useProjectId: () => 'p',
  useRevisionClient: () => client,
  useRevisionStatus: () => state.status,
  useSettlementStore: () => store,
  useRevisionAuthorship: () => authorship,
  pushRecords: {
    holdRevisionGraph: (projectId, rows) => {
      holdRevisionGraph(projectId, rows);
    },
    refreshPushRecords: (input) => {
      refreshPushRecords(input);
    },
  },
});

/* One cache per case across renders, as the app has: an append lands in the cache it was read from. */
let queryClient = new QueryClient();
const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.status = undefined;
  state.rows = [];
  state.graph = undefined;
  state.logRequests = [];
  state.settlements = [];
  holdRevisionGraph.mockClear();
  refreshPushRecords.mockClear();
});

describe('createRevisionHistoryHooks', () => {
  it('should read nothing and say the line is unknown until the projection arrives', () => {
    const { result } = renderHook(() => hooks.useRevisions(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.line).toEqual({ kind: 'unknown' });
    expect(state.logRequests).toEqual([]);
  });

  it('should number the selected branch, label each card through the injected authorship and hold the rows read', async () => {
    state.rows = [
      row({ revisionId: 'rev-2', revisionNumber: 2, parent: 'rev-1', source: 'agent', turnId: 'u2' }),
      ...line(1),
    ];
    state.status = statusOn('rev-2');

    const { result } = renderHook(() => hooks.useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.revisions).toHaveLength(2);
    });
    expect(result.current.revisions.map((card) => [card.n, card.actor, card.isYours])).toEqual([
      [2, 'Agent', undefined],
      [1, '', true],
    ]);
    expect(result.current.byTurnId.get('u2')?.revisionId).toBe('rev-2');
    expect(result.current.branchFacts?.get('main')).toEqual({ revisionNumber: 2, ahead: 0, behind: 0 });
    expect(holdRevisionGraph).toHaveBeenCalledWith('p', [
      { revisionId: 'rev-2', parents: ['rev-1'] },
      { revisionId: 'rev-1', parents: [] },
    ]);
  });

  it('should refresh push records only for a connected Tau Cloud project, at each backed-up head', async () => {
    state.rows = line(1);
    state.status = statusOn('rev-1');
    const { rerender } = renderHook(() => hooks.useRevisions(), { wrapper });
    expect(refreshPushRecords).not.toHaveBeenCalled();

    state.status = statusOn('rev-1', {
      remote: { ...emptyStatus.remote, kind: 'tau', phase: 'connected' },
      sync: { ...emptyStatus.sync, state: 'backedUp' },
    });
    rerender();

    await waitFor(() => {
      expect(refreshPushRecords).toHaveBeenCalledWith({
        projectId: 'p',
        accountId: 'usr_ada',
        token: 'backedUp:rev-1',
      });
    });
  });

  it("should carry a settled turn the graph does not hold, with the host's paths and no number", async () => {
    state.settlements = [{ turnId: 'u-remote', revisionId: 'rev-remote', changedPaths: ['main.ts'] }];
    state.rows = line(1);
    state.status = statusOn('rev-1');

    const { result } = renderHook(() => hooks.useRevisions(), { wrapper });

    await waitFor(() => {
      expect(result.current.byTurnId.get('u-remote')?.changedPaths).toEqual(['main.ts']);
    });
    expect(result.current.byTurnId.get('u-remote')?.n).toBeUndefined();
  });

  it('should append a one-row read when the head moves by one ordinary revision (E6)', async () => {
    state.rows = line(2);
    state.status = statusOn('rev-2');
    const { result, rerender } = renderHook(() => hooks.useRevisions(), { wrapper });
    await waitFor(() => {
      expect(result.current.revisions).toHaveLength(2);
    });
    state.logRequests = [];

    state.rows = line(3);
    state.status = statusOn('rev-3');
    rerender();

    await waitFor(() => {
      expect(result.current.revisions.map((card) => card.revisionId)).toEqual(['rev-3', 'rev-2', 'rev-1']);
    });
    expect(state.logRequests).toEqual([{ branch: 'main', limit: 1 }]);
  });

  it('should read one page first and the next under it on Show more (B4)', async () => {
    state.rows = line(revisionPageSize + 5);
    state.status = statusOn(`rev-${revisionPageSize + 5}`);
    const { result } = renderHook(() => hooks.useRevisions(), { wrapper });
    await waitFor(() => {
      expect(result.current.revisions).toHaveLength(revisionPageSize);
    });
    expect(result.current.hasOlder).toBe(true);

    await act(async () => {
      await result.current.loadOlder();
    });

    await waitFor(() => {
      expect(result.current.revisions).toHaveLength(revisionPageSize + 5);
    });
    expect(result.current.hasOlder).toBe(false);
  });

  it('should read the lanes graph only while the project has more than one branch (D2)', async () => {
    state.status = statusOn('rev-1');
    const single = renderHook(() => hooks.useRevisionGraph(), { wrapper });
    expect(single.result.current).toBeUndefined();

    state.status = statusOn('rev-1', {
      branches: [branchAt('main', 'rev-1'), branchAt('idea', 'rev-i')],
    });
    state.graph = {
      branches: [
        { name: 'main', head: 'rev-1' },
        { name: 'idea', head: 'rev-i' },
      ],
      rows: [
        { ...row({ revisionId: 'rev-i', parent: 'rev-1' }), line: 'idea', branch: 'idea' },
        { ...row({ revisionId: 'rev-1' }), line: 'main', branch: 'main' },
      ],
    };
    const { result } = renderHook(() => hooks.useRevisionGraph(), { wrapper });

    await waitFor(() => {
      expect(result.current?.revisions.map((card) => card.revisionId)).toEqual(['rev-i', 'rev-1']);
    });
    expect(result.current?.lineOf.get('rev-i')).toBe('idea');
    expect(result.current?.hasOlder).toBe(false);
  });

  it('should read both sides of a file through the client', async () => {
    state.status = statusOn('rev-1');
    const { result } = renderHook(() => hooks.useRevisionFileComparison('rev-1', 'main.ts'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect([result.current.original, result.current.modified]).toEqual(['a', 'b']);
  });
});
