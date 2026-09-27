/**
 * Log rows for tests that drive a chat through its projection (W9 PV-S7): the rows a stream would read, published
 * where the chat store's projection hears them.
 */

import { publishChatLogAnswer } from '#chat-clients/_internal/browser-agent-host-transport.js';

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
 * @param chatId - The chat.
 * @param rows - The rows, in log order.
 * @param cursor - The first row's position.
 */
export const publishLogRows = (chatId: string, rows: readonly unknown[], cursor = 0): void => {
  publishLogPage(chatId, rows, { cursor, endCursor: cursor + rows.length });
};

/**
 * Publish one page of a longer replay: its answer says the log ends at `endCursor`, past these rows.
 *
 * @param chatId - The chat.
 * @param rows - The page's rows, in log order.
 * @param page - The first row's position and where the log ends.
 */
export const publishLogPage = (
  chatId: string,
  rows: readonly unknown[],
  { cursor, endCursor }: Readonly<{ cursor: number; endCursor: number }>,
): void => {
  publishChatLogAnswer(chatId, { status: 'batch', cursor, nextCursor: cursor + rows.length, endCursor, events: rows });
};
