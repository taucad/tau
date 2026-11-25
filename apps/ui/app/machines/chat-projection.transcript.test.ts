// @vitest-environment node
/**
 * The displayed transcript as a pure fold of the projection (use_skill startup latency blueprint, T2): part identity
 * across deltas and rewrites, the overlay's rebase and retirement, and the counted cost of a delta on a long chat.
 */

import { describe, expect, it, vi } from 'vitest';
import type { AgentLiveEvent } from '@taucad/agent-host';
import type { MyUIMessage } from '@taucad/chat';
import type * as ReducerModule from '@taucad/chat-ui/services/ui-message-reducer';
import { initialChatProjection, reduceChatProjection, selectTranscript } from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionEvent } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';

/** Chunks the reducer has consumed, to count what one notification reduces. */
const reduced = vi.hoisted(() => ({ chunks: 0 }));
vi.mock('@taucad/chat-ui/services/ui-message-reducer', async (importOriginal) => {
  const original = await importOriginal<typeof ReducerModule>();
  return {
    ...original,
    reduceChunks: (
      chunks: Parameters<typeof original.reduceChunks>[0],
      from?: Parameters<typeof original.reduceChunks>[1],
    ) =>
      original.reduceChunks(
        (function* counted() {
          for (const chunk of chunks) {
            reduced.chunks++;
            yield chunk;
          }
        })(),
        from,
      ),
  };
});

const checkpoint = { tauInternal: { kind: 'stream-checkpoint', streamState: 'checkpoint' } };

/** Fold rows as one read answer from `cursor`, then live events, returning the projection. */
const fold = (state: ChatProjection, rows: readonly unknown[], cursor: number): ChatProjection =>
  reduceChatProjection(state, {
    type: 'batch',
    answer: {
      status: 'batch',
      cursor,
      nextCursor: cursor + rows.length,
      endCursor: cursor + rows.length,
      events: rows,
    },
  }).state;

const live = (state: ChatProjection, ...events: ReadonlyArray<Record<string, unknown>>): ChatProjection => {
  let next = state;
  for (const event of events) {
    next = reduceChatProjection(next, {
      type: 'live',
      event: { chatId: 'chat', ...event } as unknown as AgentLiveEvent,
    } satisfies ChatProjectionEvent).state;
  }
  return next;
};

const text = (runId: string, contentIndex: number) => ({ runId, messageId: 'step-1', contentIndex });

/** One run that is running with its user message and an assistant checkpoint holding `checkpointText`. */
const runningWith = (checkpointText: string): ChatProjection =>
  fold(
    initialChatProjection,
    [
      lifecycleRow(0, 'admitted'),
      lifecycleRow(1, 'running'),
      logRow(2, { type: 'message.appended', message: { id: 'user-1', role: 'user', content: 'Build it.' } }),
      logRow(3, {
        type: 'message.appended',
        message: {
          id: 'step-1',
          role: 'assistant',
          content: [{ type: 'text', text: checkpointText }],
          metadata: checkpoint,
        },
      }),
    ],
    0,
  );

const assistantOf = (transcript: readonly MyUIMessage[]): MyUIMessage => {
  const message = transcript.at(-1);
  if (message?.role !== 'assistant') {
    throw new Error('Missing assistant message');
  }
  return message;
};

const textsOf = (message: MyUIMessage): string[] =>
  message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []));

describe('selectTranscript (T2)', () => {
  it('should keep a completed part while a later live part grows, and replace only the part a rewrite corrects', () => {
    let state = live(
      runningWith('Completed paragraph'),
      { type: 'text-start', ...text('run_1', 1) },
      { type: 'text-delta', ...text('run_1', 1), delta: 'Live', offset: 0 },
    );
    const first = selectTranscript(state);
    const before = assistantOf(first);
    const beforeParts = [...before.parts];
    expect(textsOf(before)).toEqual(['Completed paragraph', 'Live']);

    state = live(state, { type: 'text-delta', ...text('run_1', 1), delta: ' grows', offset: 4 });
    const second = selectTranscript(state, first);
    const grown = assistantOf(second);
    expect(textsOf(grown)).toEqual(['Completed paragraph', 'Live grows']);
    expect(second[0]).toBe(first[0]);
    const completed = before.parts.find((part) => part.type === 'text' && part.text === 'Completed paragraph');
    expect(grown.parts).toContain(completed);
    // The fold never mutates what it showed: the previous message keeps its parts.
    expect(before.parts).toEqual(beforeParts);
    expect(textsOf(before)).toEqual(['Completed paragraph', 'Live']);

    state = fold(
      state,
      [
        logRow(4, {
          type: 'message.envelope-replaced',
          messageId: 'step-1',
          replacement: {
            id: 'step-1',
            role: 'assistant',
            content: [{ type: 'text', text: 'Corrected earlier paragraph' }],
            metadata: checkpoint,
          },
        }),
      ],
      4,
    );
    const third = selectTranscript(state, second);
    const corrected = assistantOf(third);
    expect(textsOf(corrected)).toEqual(['Corrected earlier paragraph', 'Live grows']);
    expect(corrected.parts).not.toContain(completed);
    expect(third[0]).toBe(second[0]);
  });

  it('should rebase live-only content onto a rewrite and continue its later deltas', () => {
    let state = live(
      runningWith('Loading'),
      { type: 'text-start', ...text('run_1', 1) },
      { type: 'text-delta', ...text('run_1', 1), delta: 'Streamed past the checkpoint', offset: 0 },
    );
    expect(textsOf(assistantOf(selectTranscript(state)))).toEqual(['Loading', 'Streamed past the checkpoint']);

    state = fold(
      state,
      [
        logRow(4, {
          type: 'message.envelope-replaced',
          messageId: 'step-1',
          replacement: {
            id: 'step-1',
            role: 'assistant',
            content: [{ type: 'text', text: 'Loaded' }],
            metadata: checkpoint,
          },
        }),
      ],
      4,
    );
    expect(textsOf(assistantOf(selectTranscript(state)))).toEqual(['Loaded', 'Streamed past the checkpoint']);

    state = live(state, { type: 'text-delta', ...text('run_1', 1), delta: ', still', offset: 28 });
    expect(textsOf(assistantOf(selectTranscript(state)))).toEqual(['Loaded', 'Streamed past the checkpoint, still']);
  });

  it('should change no part, order or identity when a terminal batch retires the overlay', () => {
    let state = live(
      runningWith('Done'),
      { type: 'text-start', ...text('run_1', 1) },
      { type: 'text-delta', ...text('run_1', 1), delta: 'Final words', offset: 0 },
    );
    state = fold(
      state,
      [
        logRow(4, {
          type: 'message.envelope-replaced',
          messageId: 'step-1',
          replacement: {
            id: 'step-1',
            role: 'assistant',
            content: [
              { type: 'text', text: 'Done' },
              { type: 'text', text: 'Final words' },
            ],
          },
        }),
      ],
      4,
    );
    const streamed = selectTranscript(state);
    state = fold(state, [lifecycleRow(5, 'completed')], 5);
    const terminal = selectTranscript(state, streamed);
    state = reduceChatProjection(state, { type: 'clear-live', runId: 'run_1' }).state;
    expect(state.live).toBeUndefined();
    const retired = selectTranscript(state, terminal);

    expect(retired.map((message) => message.id)).toEqual(streamed.map((message) => message.id));
    expect(retired).toBe(terminal);
    expect(textsOf(assistantOf(retired))).toEqual(['Done', 'Final words']);
    expect(assistantOf(retired).parts.filter((part) => part.type === 'text')).toEqual(
      assistantOf(streamed).parts.filter((part) => part.type === 'text'),
    );
  });

  it('should reduce only a delta and keep every other run identical on a chat of 200 runs', () => {
    const runs = 200;
    const rows = Array.from({ length: runs }, (_, index) => {
      const runId = `run_${String(index)}`;
      const at = index * 5;
      return [
        lifecycleRow(at, 'admitted', runId),
        lifecycleRow(at + 1, 'running', runId),
        logRow(at + 2, {
          runId,
          type: 'message.appended',
          message: { id: `user-${String(index)}`, role: 'user', content: `Turn ${String(index)}` },
        }),
        logRow(at + 3, {
          runId,
          type: 'message.appended',
          message: { id: `step-${String(index)}`, role: 'assistant', content: `Answer ${String(index)}` },
        }),
        lifecycleRow(at + 4, 'completed', runId),
      ];
    }).flat();
    const last = 'run_live';
    let state = fold(initialChatProjection, rows, 0);
    state = fold(
      state,
      [
        lifecycleRow(rows.length, 'admitted', last),
        lifecycleRow(rows.length + 1, 'running', last),
        logRow(rows.length + 2, {
          runId: last,
          type: 'message.appended',
          message: { id: 'user-live', role: 'user', content: 'One more' },
        }),
      ],
      rows.length,
    );
    state = live(
      state,
      { type: 'text-start', runId: last, messageId: 'step-live', contentIndex: 0 },
      { type: 'text-delta', runId: last, messageId: 'step-live', contentIndex: 0, delta: 'Thinking', offset: 0 },
    );
    const before = selectTranscript(state);
    expect(before).toHaveLength(2 * runs + 2);

    state = live(state, {
      type: 'text-delta',
      runId: last,
      messageId: 'step-live',
      contentIndex: 0,
      delta: ' harder',
      offset: 8,
    });
    reduced.chunks = 0;
    const after = selectTranscript(state, before);

    // One delta chunk is reduced; no other run is reduced again.
    expect(reduced.chunks).toBe(1);
    expect(after.slice(0, -1).every((message, index) => message === before[index])).toBe(true);
    expect(textsOf(assistantOf(after))).toEqual(['Thinking harder']);
  });
});
