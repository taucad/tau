import { describe, expect, it } from 'vitest';

import { followChat } from '#log/follow-chat.js';
import type { ChatRead } from '#log/follow-chat.js';
import type { AgentLogEvent } from '#log/event-types.js';
import type { ReadAnswer, ReadInput } from '#wire/frames.schema.js';

const row = (sequence: number, body: Record<string, unknown>): AgentLogEvent =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- seeded rows over a closed body union.
  ({
    version: 1,
    leaderEpoch: 'e01',
    epoch: 1,
    sequence,
    recordedAt: '2026-09-26T00:00:00.000Z',
    runId: 'run-1',
    ...body,
  }) as AgentLogEvent;

const log = [
  row(0, { type: 'run.lifecycle', state: 'admitted' }),
  row(1, { type: 'run.lifecycle', state: 'running' }),
  row(2, { type: 'run.lifecycle', state: 'completed' }),
];

/** A read over `log`, one row per batch, that answers the scripted refusals first. */
const scripted = (refusals: ReadAnswer[] = []): { read: ChatRead; cursors: number[] } => {
  const cursors: number[] = [];
  const read: ChatRead = async (input: ReadInput) => {
    cursors.push(input.cursor);
    const refusal = refusals.shift();
    if (refusal) {
      return refusal;
    }
    const events = log.slice(input.cursor, input.cursor + 1);
    return {
      status: 'batch',
      chatId: input.chatId,
      cursor: input.cursor,
      nextCursor: input.cursor + events.length,
      endCursor: log.length,
      events,
    };
  };
  return { read, cursors };
};

const drain = async (follow: ReturnType<typeof followChat>) => {
  const cursors: number[] = [];
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- the follow is sequential by definition.
    const next = await follow.next();
    if (next.done === true) {
      return { cursors, ended: next.value };
    }
    cursors.push(next.value.ledger.position.cursor);
  }
};

describe('followChat', () => {
  it('should refold from row 0 after a reset, and end when the condition holds', async () => {
    const { read, cursors } = scripted([
      { status: 'batch', chatId: 'c', cursor: 0, nextCursor: 1, endCursor: 3, events: [log[0]] },
      { status: 'refused', chatId: 'c', reason: 'identity-mismatch' },
    ]);

    const result = await drain(
      followChat(read, 'c', {
        signal: new AbortController().signal,
        until: (ledger) => ledger.runs['run-1']?.lifecycle === 'completed',
      }),
    );

    expect({ reads: cursors, result }).toEqual({
      reads: [0, 1, 0, 1, 2],
      result: { cursors: [1, 1, 2, 3], ended: undefined },
    });
  });

  it('should return a refusal instead of throwing it, and end on an empty batch', async () => {
    const fenced = await drain(
      followChat(scripted([{ status: 'refused', chatId: 'c', reason: 'owner-fenced' }]).read, 'c', {
        signal: new AbortController().signal,
      }),
    );
    const idle = await drain(
      followChat(
        async (input) => ({
          status: 'batch',
          chatId: 'c',
          cursor: input.cursor,
          nextCursor: input.cursor,
          endCursor: 0,
          events: [],
        }),
        'c',
        { signal: new AbortController().signal },
      ),
    );

    expect({ fenced, idle }).toEqual({
      fenced: { cursors: [], ended: 'owner-fenced' },
      idle: { cursors: [], ended: undefined },
    });
  });
});
