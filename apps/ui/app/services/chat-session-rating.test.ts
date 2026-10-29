import { describe, expect, it, vi } from 'vitest';
import type { ReadAnswer } from '@taucad/agent-host/wire';
import { ChatSessionStore } from '#services/chat-session-store.js';
import type { RunRating } from '#services/chat-session-store.js';
import { lifecycleRow, logRow, writerOwnedCatchUp } from '#machines/chat-projection.fixture.js';
import type { AgentHostClient } from '#services/agent-host-client.js';

const unusedHostCommand = async (): Promise<never> => {
  throw new Error('Unexpected host command.');
};

/** A run that answered the turn `turn-1` from `sequence`, open or ended. */
const rows = (ended: boolean, runId = 'run_1', sequence = 0): Array<Record<string, unknown>> => [
  lifecycleRow(sequence, 'admitted', runId),
  logRow(sequence + 1, {
    runId,
    type: 'turn.history-projection-committed',
    retainedMessageIds: [],
    message: { id: 'turn-1', role: 'user', content: 'hello' },
    context: { version: 1, systemPrompt: '', initialMessages: [], postCompactionMessages: [] },
  }),
  lifecycleRow(sequence + 2, 'running', runId),
  ...(ended ? [lifecycleRow(sequence + 3, 'completed', runId)] : []),
];

const observed = async (events: ReadonlyArray<Record<string, unknown>>) => {
  const store = new ChatSessionStore();
  const release = store.observe('chat_rated', 'project_1');
  const batch: ReadAnswer = {
    status: 'batch',
    sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
    chatId: 'chat_rated',
    cursor: 0,
    nextCursor: events.length,
    endCursor: events.length,
    events: events as Extract<ReadAnswer, { status: 'batch' }>['events'],
  };
  const rated = vi.fn<(rating: RunRating) => Promise<void>>(async () => undefined);
  const unpublish = store.publishProjectHostConnector(
    'project_1',
    async () => ({
      catchUp: writerOwnedCatchUp,
      read: async (): Promise<ReadAnswer> => batch,
      subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
        queueMicrotask(() => {
          parameters[3]?.(batch);
        });
        return () => undefined;
      },
      hostCommand: unusedHostCommand,
      close: async () => undefined,
    }),
    { rated },
  );
  await vi.waitFor(() => {
    expect(store.getProjection('chat_rated')?.ledger.position.cursor).toBe(events.length);
  });
  return {
    store,
    rated,
    close: () => {
      unpublish();
      release();
    },
  };
};

describe('ChatSessionStore ratings', () => {
  it('rates the ended run that answered a turn once, through the project host', async () => {
    const { store, rated, close } = await observed(rows(true));
    try {
      expect(store.ratableRun('chat_rated', 'turn-1')).toBe('run_1');
      expect(store.ratableRun('chat_rated', 'turn-other')).toBeUndefined();

      expect(store.rateRun('chat_rated', 'run_1', 'negative')).toBe('negative');
      expect(store.rateRun('chat_rated', 'run_1', 'positive')).toBe('negative');

      expect(store.ratingOf('chat_rated', 'run_1')).toBe('negative');
      expect(rated).toHaveBeenCalledTimes(1);
      expect(rated).toHaveBeenCalledWith({
        chatId: 'chat_rated',
        runId: 'run_1',
        value: 'negative',
        at: expect.any(Number) as unknown,
      });
    } finally {
      close();
    }
  });

  it('offers no rating for a run that is still open', async () => {
    const { store, close } = await observed(rows(false));
    try {
      expect(store.ratableRun('chat_rated', 'turn-1')).toBeUndefined();
    } finally {
      close();
    }
  });

  it('offers no rating for a paused run, whose attempt ended but whose reply resumes', async () => {
    const paused = await observed([...rows(false), lifecycleRow(3, 'paused')]);
    try {
      expect(paused.store.getProjection('chat_rated')?.ledger.runs['run_1']?.appendState).toBe('terminal');
      expect(paused.store.ratableRun('chat_rated', 'turn-1')).toBeUndefined();
    } finally {
      paused.close();
    }
  });

  it('offers the newest run of a regenerated turn, never the ended run it replaced', async () => {
    const open = await observed([...rows(true), ...rows(false, 'run_2', 4)]);
    try {
      expect(open.store.ratableRun('chat_rated', 'turn-1')).toBeUndefined();
    } finally {
      open.close();
    }
    const ended = await observed([...rows(true), ...rows(true, 'run_2', 4)]);
    try {
      expect(ended.store.ratableRun('chat_rated', 'turn-1')).toBe('run_2');
    } finally {
      ended.close();
    }
  });
});
