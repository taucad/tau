import { describe, expect, it } from 'vitest';

import { emptyChatLedger, foldReadAnswer, foldProjectionFacts } from '#log/chat-ledger.js';
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
      sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
  it('should continue after an empty unchanged-health observation overtaken by a wake', async () => {
    const sourceHealth = { historyIntact: true, newerHistory: false, quarantined: false };
    const answers: ReadAnswer[] = [
      { status: 'batch', chatId: 'c', cursor: 0, nextCursor: 0, endCursor: 0, events: [], sourceHealth },
      { status: 'batch', chatId: 'c', cursor: 0, nextCursor: 0, endCursor: 0, events: [], sourceHealth },
      { status: 'batch', chatId: 'c', cursor: 0, nextCursor: 1, endCursor: 1, events: [log[0]], sourceHealth },
      { status: 'refused', chatId: 'c', reason: 'owner-fenced' },
    ];
    const read: ChatRead = async () => {
      const answer = answers.shift();
      if (answer === undefined) {
        throw new Error('The bounded read script ended.');
      }
      return answer;
    };
    expect(await drain(followChat(read, 'c', { signal: new AbortController().signal }))).toEqual({
      cursors: [0, 1],
      ended: 'owner-fenced',
    });
  });

  it('should reset cursor-zero source health when either read form observes a new generation', () => {
    const ledger = {
      ...emptyChatLedger,
      historyIntact: false,
      position: { cursor: 0, sourceGeneration: 'old-source' },
    };
    const base = {
      status: 'batch',
      chatId: 'c',
      cursor: 0,
      nextCursor: 0,
      endCursor: 0,
      sourceGeneration: 'new-source',
    } as const;
    expect(
      foldReadAnswer(ledger, {
        ...base,
        events: [],
        sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
      }),
    ).toEqual({ kind: 'reset', reason: 'identity-mismatch' });
    expect(foldProjectionFacts({ ledger, answer: { ...base, facts: [] } })).toEqual({
      kind: 'reset',
      reason: 'identity-mismatch',
    });
  });

  it('should yield health-only observations and echo exact host health before the next read', async () => {
    const healthy = { historyIntact: true, newerHistory: false, quarantined: false };
    const damaged = { historyIntact: false, newerHistory: false, quarantined: true };
    const answers: ReadAnswer[] = [
      { status: 'batch', chatId: 'c', cursor: 0, nextCursor: 0, endCursor: 0, events: [], sourceHealth: healthy },
      { status: 'batch', chatId: 'c', cursor: 0, nextCursor: 0, endCursor: 0, events: [], sourceHealth: damaged },
      { status: 'refused', chatId: 'c', reason: 'owner-fenced' },
    ];
    const observed: Array<ReadInput['sourceHealth']> = [];
    const read: ChatRead = async (input) => {
      observed.push(input.sourceHealth);
      const answer = answers.shift();
      if (answer === undefined) {
        throw new Error('The bounded fixture has no further read.');
      }
      return answer;
    };
    const result = await drain(followChat(read, 'c', { signal: new AbortController().signal }));
    expect({ observed, result }).toEqual({
      observed: [undefined, healthy, damaged],
      result: { cursors: [0, 0], ended: 'owner-fenced' },
    });
  });

  it('captures source identity in an empty aligned cursor-zero batch', () => {
    const fold = foldReadAnswer(emptyChatLedger, {
      status: 'batch',
      sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
      cursor: 0,
      nextCursor: 0,
      endCursor: 0,
      events: [],
      sourceGeneration: 'empty-source',
    });
    expect(fold).toMatchObject({
      kind: 'folded',
      ledger: { position: { cursor: 0, sourceGeneration: 'empty-source' } },
    });
    expect(emptyChatLedger.position).toEqual({ cursor: 0 });
  });

  it('should refold from row 0 after a reset, and end when the condition holds', async () => {
    const { read, cursors } = scripted([
      {
        status: 'batch',
        sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
        chatId: 'c',
        cursor: 0,
        nextCursor: 1,
        endCursor: 3,
        events: [log[0]],
      },
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

  it('should return a refusal and end when the owner closes after an empty observation', async () => {
    const fenced = await drain(
      followChat(scripted([{ status: 'refused', chatId: 'c', reason: 'owner-fenced' }]).read, 'c', {
        signal: new AbortController().signal,
      }),
    );
    let idleReads = 0;
    const idle = await drain(
      followChat(
        async (input) => {
          if (idleReads++ > 0) {
            throw Object.assign(new Error('Closed'), { code: 'HOST_CLOSED' });
          }
          return {
            status: 'batch',
            sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
            chatId: 'c',
            cursor: input.cursor,
            nextCursor: input.cursor,
            endCursor: 0,
            events: [],
          };
        },
        'c',
        { signal: new AbortController().signal },
      ),
    );

    expect({ fenced, idle }).toEqual({
      fenced: { cursors: [], ended: 'owner-fenced' },
      idle: { cursors: [0], ended: undefined },
    });
  });
});
