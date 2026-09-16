// @vitest-environment jsdom
/**
 * `turn.conflicted` and `turn.failed` reach a person (W5 review R5, A4).
 *
 * Both are published by every host in the same schema as `turn.finalized`, and
 * before this they were read by nothing: a turn that recorded no revision was
 * silent on browser and desktop alike. The pin is the notice.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import {
  clearTurnOutcome,
  RevisionOutcomes,
  useTurnOutcomes,
} from '#routes/w.$workspace.$project/revision-outcomes.js';
import type { WorkerRevisionEvent } from '#machines/file-manager.worker.revisions.js';

const listeners = new Set<(event: WorkerRevisionEvent) => void>();
const publish = (event: WorkerRevisionEvent): void => {
  /* The port delivers outside React's own work loop, which is exactly how it
   * arrives in the product. */
  act(() => {
    for (const listener of listeners) {
      listener(event);
    }
  });
};

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));

vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  const base = harness.revisionStatusMock();
  return {
    ...base,
    useRevisionClient: () => ({
      ...(base['useRevisionClient'] as () => Record<string, unknown>)(),
      subscribeEvents: (listener: (event: WorkerRevisionEvent) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    }),
  };
});

const errors: Array<{ title: string; description?: string }> = [];
vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    error: (title: string, options?: { description?: string }) => {
      errors.push({ title, ...(options?.description === undefined ? {} : { description: options.description }) });
    },
  },
}));

/** Reads the same store the pane's attention line reads. */
function Latest(): React.JSX.Element {
  const outcome = useTurnOutcomes('p').at(-1);
  return <span data-testid='latest'>{outcome === undefined ? 'none' : `${outcome.kind}:${outcome.turnId}`}</span>;
}

let projectedChats: ReadonlyArray<Readonly<{ id: string; name: string }>> = [];

/** Reads the same cached project inventory the sidebar reads. */
function CachedChatInventory(): React.JSX.Element {
  const { data = [] } = useQuery({
    queryKey: ['chats', 'p', { includeDeleted: false }],
    queryFn: async () => projectedChats,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return <span data-testid='chats'>{data.map((chat) => chat.name).join(',') || 'none'}</span>;
}

const renderTurnOutcomes = (): ReturnType<typeof render> =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RevisionOutcomes />
      <Latest />
    </QueryClientProvider>,
  );

beforeEach(() => {
  revisionStatusHarness.reset();
  errors.length = 0;
  projectedChats = [];
  clearTurnOutcome('p');
});

afterEach(() => {
  listeners.clear();
});

describe('RevisionOutcomes', () => {
  it('says so when a turn ends without recording anything', () => {
    const { getByTestId } = renderTurnOutcomes();

    publish({
      type: 'turn.failed',
      turnId: 'turn-1',
      runId: 'run-1',
      chatId: 'chat-1',
      checkoutId: 'live',
      reason: 'The turn ended before it recorded a revision.',
    });

    expect(errors).toEqual([
      {
        title: 'Nothing was saved for that change',
        description: 'The turn ended before it recorded a revision.',
      },
    ]);
    expect(getByTestId('latest')).toHaveTextContent('failed:turn-1');
  });

  it('says so when a turn conflicts, in document words', () => {
    const { getByTestId } = renderTurnOutcomes();

    publish({ type: 'turn.conflicted', turnId: 'turn-2', runId: 'run-2', chatId: 'chat-1', checkoutId: 'live' });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.title).toBe('That change needs your attention');
    expect(`${errors[0]?.title ?? ''} ${errors[0]?.description ?? ''}`).not.toMatch(/merge conflict|branch|HEAD/iu);
    expect(getByTestId('latest')).toHaveTextContent('conflicted:turn-2');
  });

  it('stays quiet for the outcome that did record a revision', () => {
    const { getByTestId } = renderTurnOutcomes();

    publish({
      type: 'turn.finalized',
      turnId: 'turn-3',
      runId: 'run-3',
      chatId: 'chat-1',
      projectId: 'p',
      checkoutId: 'live',
      revisionId: 'rev-1',
      changedPaths: [],
      trigger: 'turn',
      runIds: ['run-3'],
    });

    expect(errors).toEqual([]);
    expect(getByTestId('latest')).toHaveTextContent('none');
  });

  it('should refresh a cached empty chat inventory after remote chats are projected', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await queryClient.prefetchQuery({
      queryKey: ['chats', 'p', { includeDeleted: false }],
      queryFn: async () => projectedChats,
      staleTime: Number.POSITIVE_INFINITY,
    });
    queryClient.setQueryData(['all-chats'], []);
    queryClient.setQueryData(['chat', 'remote-chat'], { id: 'remote-chat', name: 'Stale name' });
    queryClient.setQueryData(['chat', 'unrelated-chat'], { id: 'unrelated-chat' });
    queryClient.setQueryData(['chats', 'other-project', { includeDeleted: false }], []);
    const { getByTestId } = render(
      <QueryClientProvider client={queryClient}>
        <RevisionOutcomes />
        <CachedChatInventory />
      </QueryClientProvider>,
    );
    expect(getByTestId('chats')).toHaveTextContent('none');

    projectedChats = [{ id: 'remote-chat', name: 'Remote design' }];
    publish({ type: 'chats.projected', projectId: 'p', chatIds: ['remote-chat'] });

    await waitFor(() => {
      expect(getByTestId('chats')).toHaveTextContent('Remote design');
    });
    expect(queryClient.getQueryState(['all-chats'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['chat', 'remote-chat'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['chat', 'unrelated-chat'])?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(['chats', 'other-project', { includeDeleted: false }])?.isInvalidated).toBe(false);
  });
});
