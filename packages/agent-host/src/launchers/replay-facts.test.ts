/** The root facts-only replay (HA-I1, HA-I3): prefix-guarded extension, torn tails and rollbacks. */
import { describe, expect, it } from 'vitest';
import { createReplayFacts, isBytePrefix } from '#index.js';

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const row = (sequence: number, state: string): string =>
  JSON.stringify({
    version: 1,
    leaderEpoch: 'term-a',
    sequence,
    recordedAt: '2026-11-26T00:00:00.000Z',
    runId: 'run-1',
    type: 'run.lifecycle',
    state,
  });
const page = (view: ReturnType<typeof createReplayFacts>) =>
  view.projectionBatch({ chatId: 'chat', cursor: 0, limit: 100, maxBytes: 1_000_000 });

describe('createReplayFacts', () => {
  it('should extend a view whose bytes stay a prefix and serve the same facts a rebuild does', () => {
    const first = encode(`${row(0, 'admitted')}\n`);
    const grown = encode(`${row(0, 'admitted')}\n${row(1, 'running')}\n`);
    const view = createReplayFacts(first, 'g');

    expect(isBytePrefix(view.bytes, grown)).toBe(true);
    expect(page(view.extend(grown)).facts).toEqual(page(createReplayFacts(grown, 'h')).facts);
  });

  it('should hold back a torn tail until it is whole', () => {
    const whole = `${row(0, 'admitted')}\n${row(1, 'running')}\n`;
    const torn = encode(whole.slice(0, -10));

    expect(page(createReplayFacts(torn, 'g')).endCursor).toBe(1);
    expect(page(createReplayFacts(torn, 'g').extend(encode(whole))).endCursor).toBe(2);
  });

  it('should see a rollback that puts a different row under the same key as not a prefix', () => {
    const before = encode(`${row(0, 'admitted')}\n${row(1, 'running')}\n`);
    const after = encode(`${row(0, 'admitted')}\n${row(1, 'failed')}\n`);

    expect(isBytePrefix(before, after)).toBe(false);
    expect(page(createReplayFacts(after, 'h')).facts.at(-1)).toMatchObject({ row: { sequence: 1 } });
  });
});
