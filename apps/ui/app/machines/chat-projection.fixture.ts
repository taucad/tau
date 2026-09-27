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

/** A run that is running, as its first two rows. */
export const runningRows = (runId = 'run_1'): Array<Record<string, unknown>> => [
  logRow(0, { runId, type: 'run.lifecycle', state: 'admitted', attempt: 1 }),
  logRow(1, { runId, type: 'run.lifecycle', state: 'running', attempt: 1 }),
];

/**
 * Publish rows as one read answer from `cursor`, as a stream's replay would.
 *
 * @param chatId - The chat.
 * @param rows - The rows, in log order.
 * @param cursor - The first row's position.
 */
export const publishLogRows = (chatId: string, rows: readonly unknown[], cursor = 0): void => {
  publishChatLogAnswer(chatId, {
    status: 'batch',
    cursor,
    nextCursor: cursor + rows.length,
    endCursor: cursor + rows.length,
    events: rows,
  });
};
