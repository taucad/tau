/**
 * Log rows for tests that drive a chat through its projection (W9 PV-S7): the rows a stream would read, published
 * where the chat store's projection hears them.
 */

import { agentLogEventSchema, projectionFactSchema } from '@taucad/agent-host';
import type { ProjectionFact } from '@taucad/agent-host';
import type { CatchUpFrame } from '@taucad/agent-host/wire';
import type { ChatSessionStore } from '#services/chat-session-store.js';

type ProjectionReader = Pick<ChatSessionStore, 'receiveHostReadAnswer'>;

/**
 * One durable row of a test chat's log.
 *
 * @param sequence - Its sequence, which is also its position in the log.
 * @param fields - Its type and payload.
 * @returns The row.
 */
export const logRow = (sequence: number, fields: Readonly<Record<string, unknown>>): Record<string, unknown> => ({
  version: 1,
  leaderEpoch: 'g1',
  sequence,
  recordedAt: '2026-09-28T00:00:00.000Z',
  runId: 'run_1',
  ...fields,
});

/**
 * One `run.lifecycle` row of attempt 1.
 *
 * @param sequence - Its position in the log.
 * @param state - The lifecycle it states.
 * @param runId - Its run.
 * @returns The row.
 */
export const lifecycleRow = (sequence: number, state: string, runId = 'run_1'): Record<string, unknown> =>
  logRow(sequence, { runId, type: 'run.lifecycle', state, attempt: 1 });

/** A run that is running, as its first two rows. */
export const runningRows = (runId = 'run_1'): Array<Record<string, unknown>> => [
  lifecycleRow(0, 'admitted', runId),
  lifecycleRow(1, 'running', runId),
];

/**
 * Publish rows as one read answer from `cursor`, as a stream's replay would.
 *
 * @param store - The store reading the answer.
 * @param chatId - The chat.
 * @param rows - The rows, in log order.
 * @param cursor - The first row's position.
 */
// oxlint-disable-next-line eslint/max-params -- The read fixture names its reader, chat, rows and optional cursor.
export const publishLogRows = (store: ProjectionReader, chatId: string, rows: readonly unknown[], cursor = 0): void => {
  publishLogPage(store, chatId, rows, { cursor, endCursor: cursor + rows.length });
};

/**
 * Publish one page of a longer replay: its answer says the log ends at `endCursor`, past these rows.
 *
 * @param store - The store reading the answer.
 * @param chatId - The chat.
 * @param rows - The page's rows, in log order.
 * @param page - The first row's position and where the log ends.
 */
// oxlint-disable-next-line eslint/max-params -- A page needs its reader, chat, rows and cursor/end boundary.
export const publishLogPage = (
  store: ProjectionReader,
  chatId: string,
  rows: readonly unknown[],
  { cursor, endCursor }: Readonly<{ cursor: number; endCursor: number }>,
): void => {
  store.receiveHostReadAnswer(chatId, {
    status: 'batch',
    cursor,
    nextCursor: cursor + rows.length,
    endCursor,
    events: rows,
  });
};

/** Simulate the explicit in-memory writer owner for fixtures driven through ordinary read answers. */
export const writerOwnedCatchUp = async function* ({ chatId }: { chatId: string }): AsyncIterable<CatchUpFrame> {
  yield { type: 'refused', answer: { status: 'refused', chatId, reason: 'writer-owned' } };
};

/** Explicit lifecycle/message fixtures for current compact attachment frames; other rows require their own fixture. */
export const compactRow = (input: unknown): ProjectionFact => {
  const event = agentLogEventSchema.parse(input);
  if ((event.type !== 'run.lifecycle' || 'admission' in event) && event.type !== 'message.appended') {
    throw new Error('Use an explicit compact fact for this fixture event.');
  }
  const { version, leaderEpoch, sequence, recordedAt, runId, epoch, commandId, attempt, ...effect } = event;
  return projectionFactSchema.parse({
    classification: 'known',
    row: { version, leaderEpoch, sequence, recordedAt, runId, epoch, commandId, attempt },
    effect,
  });
};
