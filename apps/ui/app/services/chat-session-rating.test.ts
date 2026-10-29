import { describe, expect, it, vi } from 'vitest';
import type { ReadAnswer } from '@taucad/agent-host/wire';
import { ChatSessionStore } from '#services/chat-session-store.js';
import type { RunRating } from '#services/chat-session-store.js';
import { lifecycleRow, logRow, writerOwnedCatchUp } from '#machines/chat-projection.fixture.js';
import type { AgentHostClient } from '#services/agent-host-client.js';

const unusedHostCommand = async (): Promise<never> => {
  throw new Error('Unexpected host command.');
};

/** A run that answered the turn `turn-1`, open or ended. */
const rows = (ended: boolean): Array<Record<string, unknown>> => [
  lifecycleRow(0, 'admitted'),
  logRow(1, {
    type: 'turn.history-projection-committed',
    retainedMessageIds: [],
    message: { id: 'turn-1', role: 'user', content: 'hello' },
    context: { version: 1, systemPrompt: '', initialMessages: [], postCompactionMessages: [] },
  }),
  lifecycleRow(2, 'running'),
  ...(ended ? [lifecycleRow(3, 'completed')] : []),
];

const observed = async (ended: boolean) => {
  const store = new ChatSessionStore();
  const release = store.observe('chat_rated', 'project_1');
  const events = rows(ended);
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
    const { store, rated, close } = await observed(true);
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
    const { store, close } = await observed(false);
    try {
      expect(store.ratableRun('chat_rated', 'turn-1')).toBeUndefined();
    } finally {
      close();
    }
  });
});
