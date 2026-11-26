import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLiveConflater, liveConflationMilliseconds, mergeLiveEvents } from '#launchers/live-conflater.js';

type Event = Readonly<Record<string, unknown> & { type: string }>;

const base = { chatId: 'chat', runId: 'run', messageId: 'message', contentIndex: 0, sourceGeneration: 'g1' };
const text = (delta: string, extra: Record<string, unknown> = {}): Event => ({
  type: 'text-delta',
  ...base,
  delta,
  ...extra,
});

/** The text a reader rebuilds from deltas, per block, as `projectAgentHostLiveEvent` does. */
const rebuild = (events: readonly Event[]): Record<string, string> => {
  const blocks: Record<string, string> = {};
  for (const event of events) {
    if (typeof event['delta'] !== 'string') {
      continue;
    }
    const key = `${String(event['messageId'])}:${String(event['contentIndex'])}:${event.type}`;
    const content = blocks[key] ?? '';
    const offset = typeof event['offset'] === 'number' ? event['offset'] : content.length;
    if (offset > content.length) {
      continue;
    }
    blocks[key] = content + event['delta'].slice(content.length - offset);
  }
  return blocks;
};

describe('mergeLiveEvents', () => {
  it('should merge adjacent deltas of one block into their concatenation', () => {
    expect(mergeLiveEvents(text('Hel'), text('lo'))).toEqual(text('Hello'));
  });

  it('should keep the first offset when the second continues it', () => {
    expect(mergeLiveEvents(text('ab', { offset: 4 }), text('cd', { offset: 6 }))).toEqual(text('abcd', { offset: 4 }));
  });

  it('should refuse deltas whose offsets are not contiguous', () => {
    expect(mergeLiveEvents(text('ab', { offset: 4 }), text('cd', { offset: 5 }))).toBeUndefined();
    expect(mergeLiveEvents(text('ab'), text('cd', { offset: 2 }))).toBeUndefined();
  });

  it('should refuse deltas of another block, message, run, writer or phase', () => {
    expect(mergeLiveEvents(text('a'), text('b', { contentIndex: 1 }))).toBeUndefined();
    expect(mergeLiveEvents(text('a'), text('b', { messageId: 'other' }))).toBeUndefined();
    expect(mergeLiveEvents(text('a'), text('b', { runId: 'other' }))).toBeUndefined();
    expect(mergeLiveEvents(text('a'), text('b', { sourceGeneration: 'g2' }))).toBeUndefined();
    expect(mergeLiveEvents(text('a', { phase: 'commentary' }), text('b', { phase: 'final_answer' }))).toBeUndefined();
    expect(mergeLiveEvents(text('a'), { ...text('b'), type: 'thinking-delta' })).toBeUndefined();
  });

  it('should carry the later reasoning summary, which replaces the earlier one', () => {
    const first = { type: 'thinking-delta', ...base, delta: 'x', reasoningSummary: 'Plan' };
    const next = { type: 'thinking-delta', ...base, delta: 'y', reasoningSummary: 'Planning' };
    expect(mergeLiveEvents(first, next)).toEqual({ ...first, delta: 'xy', reasoningSummary: 'Planning' });
  });

  it('should merge tool-input deltas of one call and refuse another call', () => {
    const tool = (delta: string, toolCallId = 'call'): Event => ({
      type: 'tool-input-delta',
      ...base,
      toolCallId,
      toolName: 'read_file',
      delta,
    });
    expect(mergeLiveEvents(tool('{"a"'), tool(':1}'))).toEqual(tool('{"a":1}'));
    expect(mergeLiveEvents(tool('{'), tool('}', 'other'))).toBeUndefined();
  });

  it('should never merge a boundary', () => {
    const start = { type: 'text-start', ...base };
    const end = { type: 'text-end', ...base, content: 'a' };
    expect(mergeLiveEvents(start, text('a'))).toBeUndefined();
    expect(mergeLiveEvents(text('a'), end)).toBeUndefined();
  });
});

describe('createLiveConflater', () => {
  let clock = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    clock = 1000;
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const advance = async (milliseconds: number): Promise<void> => {
    clock += milliseconds;
    await vi.advanceTimersByTimeAsync(milliseconds);
  };

  it('should deliver the first delta at once and merge the rest of its window into one event', async () => {
    const delivered: Event[] = [];
    const conflater = createLiveConflater<Event>({ deliver: (event) => delivered.push(event), now: () => clock });
    conflater.push(text('a'));
    expect(delivered).toEqual([text('a')]);
    conflater.push(text('b'));
    await advance(4);
    conflater.push(text('c'));
    expect(delivered).toHaveLength(1);
    await advance(liveConflationMilliseconds);
    expect(delivered).toEqual([text('a'), text('bc')]);
    conflater.close();
  });

  it('should deliver a delta at once again after a quiet window', async () => {
    const delivered: Event[] = [];
    const conflater = createLiveConflater<Event>({ deliver: (event) => delivered.push(event), now: () => clock });
    conflater.push(text('a'));
    await advance(liveConflationMilliseconds + 1);
    conflater.push(text('b'));
    expect(delivered).toEqual([text('a'), text('b')]);
    conflater.close();
  });

  it('should deliver a start at once without opening a window, so the first delta is not held', () => {
    const delivered: Event[] = [];
    const conflater = createLiveConflater<Event>({ deliver: (event) => delivered.push(event), now: () => clock });
    const start = { type: 'text-start', ...base };
    conflater.push(start);
    conflater.push(text('a'));
    expect(delivered).toEqual([start, text('a')]);
    conflater.close();
  });

  it('should keep boundaries in order inside a window', async () => {
    const delivered: Event[] = [];
    const conflater = createLiveConflater<Event>({ deliver: (event) => delivered.push(event), now: () => clock });
    const end = { type: 'text-end', ...base, content: 'abcd' };
    const toolStart = { type: 'tool-input-start', ...base, toolCallId: 'call', toolName: 'read_file' };
    conflater.push(text('a'));
    conflater.push(text('b'));
    conflater.push(text('c'));
    conflater.push(end);
    conflater.push(toolStart);
    await advance(liveConflationMilliseconds);
    expect(delivered).toEqual([text('a'), text('bc'), end, toolStart]);
    conflater.close();
  });

  it('should merge while the sink has not caught up, and deliver when it reads', async () => {
    const delivered: Event[] = [];
    let open = false;
    const conflater = createLiveConflater<Event>({
      deliver: (event) => delivered.push(event),
      canDeliver: () => open,
      now: () => clock,
    });
    for (const piece of ['a', 'b', 'c']) {
      conflater.push(text(piece));
      // oxlint-disable-next-line no-await-in-loop -- each step is one window.
      await advance(liveConflationMilliseconds * 2);
    }
    expect(delivered).toEqual([]);
    expect(conflater.size).toBe(1);
    open = true;
    conflater.ready();
    expect(delivered).toEqual([text('abc')]);
    conflater.close();
  });

  it('should hand over everything on flush and nothing after close', () => {
    const delivered: Event[] = [];
    const conflater = createLiveConflater<Event>({
      deliver: (event) => delivered.push(event),
      canDeliver: () => false,
      now: () => clock,
    });
    conflater.push(text('a'));
    conflater.flush();
    expect(delivered).toEqual([text('a')]);
    conflater.close();
    conflater.push(text('b'));
    conflater.flush();
    expect(delivered).toEqual([text('a')]);
  });

  it('should preserve every block text a reader rebuilds, for any arrival timing', async () => {
    const delivered: Event[] = [];
    const raw: Event[] = [];
    const conflater = createLiveConflater<Event>({ deliver: (event) => delivered.push(event), now: () => clock });
    let seed = 7;
    const random = (): number => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed / 2_147_483_647;
    };
    const offsets: Record<number, number> = { 0: 0, 1: 0 };
    for (let index = 0; index < 400; index += 1) {
      const contentIndex = random() < 0.1 ? 1 : 0;
      const delta = 'x'.repeat(1 + Math.floor(random() * 4)) + String(index);
      const event =
        contentIndex === 0
          ? text(delta, { contentIndex })
          : text(delta, { contentIndex, offset: offsets[contentIndex] });
      offsets[contentIndex] = (offsets[contentIndex] ?? 0) + delta.length;
      raw.push(event);
      conflater.push(event);
      // oxlint-disable-next-line no-await-in-loop -- arrival gaps are the input.
      await advance(Math.floor(random() * 10));
    }
    conflater.flush();
    expect(rebuild(delivered)).toEqual(rebuild(raw));
    expect(delivered.length).toBeLessThan(raw.length / 2);
    conflater.close();
  });
});
