import type * as SerializationModule from '#log/serialization.js';
import type * as LedgerModule from '#log/chat-ledger.js';
import { describe, expect, it, vi } from 'vitest';
import { createReplayView, isBytePrefix } from '#launchers/replay-view.js';
import { parseEventLogBytes } from '#log/serialization.js';
import { foldClassifiedChatLedger } from '#log/chat-ledger.js';
import { invalidHistoryFixtures } from '#log/invalid-history.fixture.js';
import { createEventLogAppender } from '#log/event-log-appender.js';

vi.mock('#log/serialization.js', async (original) => {
  const actual = await original<typeof SerializationModule>();
  return { ...actual, parseEventLogBytes: vi.fn(actual.parseEventLogBytes) };
});
vi.mock('#log/chat-ledger.js', async (original) => {
  const actual = await original<typeof LedgerModule>();
  return { ...actual, foldClassifiedChatLedger: vi.fn(actual.foldClassifiedChatLedger) };
});
const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const row = (sequence: number): string =>
  JSON.stringify({
    version: 1,
    leaderEpoch: 'e',
    sequence,
    recordedAt: '2026-10-08T00:00:00.000Z',
    runId: 'r',
    type: 'future.row',
  }) + '\n';

describe('byte-validated replay view', () => {
  it('does not scan an exact retained byte object against itself', () => {
    const bytes = encode('retained exact bytes');
    const scan = vi.spyOn(bytes, 'every');
    try {
      expect(isBytePrefix(bytes, bytes)).toBe(true);
      expect(scan).not.toHaveBeenCalled();
    } finally {
      scan.mockRestore();
    }
  });

  it('compares distinct equal bytes without per-byte callback dispatch', () => {
    const prefix = encode('distinct authoritative bytes');
    const bytes = new Uint8Array(prefix);
    const scan = vi.spyOn(prefix, 'every');
    try {
      expect(isBytePrefix(prefix, bytes)).toBe(true);
      expect(scan).not.toHaveBeenCalled();
    } finally {
      scan.mockRestore();
    }
  });

  it.each([
    { name: 'empty prefix', prefix: '', bytes: 'next', expected: true },
    { name: 'exact separate contents', prefix: 'abc', bytes: 'abc', expected: true },
    { name: 'appended bytes', prefix: 'abc', bytes: 'abcdef', expected: true },
    { name: 'truncated source', prefix: 'abc', bytes: 'ab', expected: false },
    { name: 'first mismatch', prefix: 'abc', bytes: 'xbc', expected: false },
    { name: 'middle mismatch', prefix: 'abc', bytes: 'axc', expected: false },
    { name: 'last mismatch', prefix: 'abc', bytes: 'abx', expected: false },
    { name: 'multibyte append', prefix: '😀é', bytes: '😀é次', expected: true },
    { name: 'multibyte mismatch', prefix: '😀é', bytes: '😀è', expected: false },
  ])('compares exact bytes for $name', ({ prefix, bytes, expected }) => {
    expect(isBytePrefix(encode(prefix), encode(bytes))).toBe(expected);
  });

  it('compares view offsets instead of treating one backing buffer as identity', () => {
    const bytes = new Uint8Array([1, 2, 1, 2, 3]);
    expect(isBytePrefix(bytes.subarray(0, 2), bytes.subarray(2))).toBe(true);
    expect(isBytePrefix(bytes.subarray(0, 3), bytes.subarray(2))).toBe(false);
  });

  it('checks every byte across aligned and unaligned views, word boundaries and tails', () => {
    for (const prefixOffset of [0, 1, 4]) {
      for (const sourceOffset of [0, 2, 8]) {
        for (const length of [0, 1, 3, 4, 5, 7, 8, 9, 31, 32, 33]) {
          const prefixBacking = new Uint8Array(prefixOffset + length + 3).fill(255);
          const sourceBacking = new Uint8Array(sourceOffset + length + 5).fill(254);
          const prefix = prefixBacking.subarray(prefixOffset, prefixOffset + length);
          const source = sourceBacking.subarray(sourceOffset, sourceOffset + length + 2);
          for (let index = 0; index < length; index++) {
            prefix[index] = index * 7;
            source[index] = prefix[index]!;
          }
          expect(isBytePrefix(prefix, source)).toBe(true);
          for (let index = 0; index < length; index++) {
            source[index] = (prefix[index]! + 1) % 256;
            expect(isBytePrefix(prefix, source)).toBe(false);
            source[index] = prefix[index]!;
          }
          if (length > 0) {
            expect(isBytePrefix(prefix, source.subarray(0, length - 1))).toBe(false);
          }
        }
      }
    }
  });

  it.each(invalidHistoryFixtures)(
    'matches the canonical tolerant history for $name across append boundaries',
    async ({ events }) => {
      const line = (event: unknown): string => JSON.stringify(event) + '\n';
      const first = createReplayView(encode(line(events[0])), 'source');
      const bytes = encode(events.map((event) => line(event)).join(''));
      const extended = first.extend(bytes);
      const refuse = async (): Promise<never> => {
        throw new Error('Read-only');
      };
      const canonical = await createEventLogAppender({
        read: async () => bytes,
        append: refuse,
        truncate: refuse,
        close: async () => undefined,
        size: async () => bytes.byteLength,
        exclusive: async (section) => section(),
      });
      expect(await extended.log.read()).toEqual(await canonical.read());
      expect(await extended.log.messages()).toEqual(await canonical.messages());
      expect(extended.ledger.historyIntact).toBe(await canonical.historyIntact());
      await canonical.close();
    },
  );

  it('keeps published rows and ledger snapshots immutable while completing a retained torn tail', async () => {
    const firstLine = row(0);
    const next = row(1);
    const bytes = encode(firstLine + next.slice(0, 45));
    const first = createReplayView(bytes, 'source');
    const firstRows = await first.log.read();
    const priorLedger = first.ledger;
    const appended = encode(firstLine + next);
    expect(isBytePrefix(bytes, appended)).toBe(true);
    vi.mocked(parseEventLogBytes).mockClear();
    vi.mocked(foldClassifiedChatLedger).mockClear();
    const second = first.extend(appended);
    expect(second.generation).toBe('source');
    expect(await second.log.read()).toHaveLength(2);
    const secondRows = await second.log.read();
    expect(secondRows[0]).toBe(firstRows[0]);
    expect(first.ledger).toBe(priorLedger);
    expect(first.ledger.position.cursor).toBe(1);
    expect(await first.log.read()).toHaveLength(1);
    expect(parseEventLogBytes).toHaveBeenCalledOnce();
    expect(vi.mocked(parseEventLogBytes).mock.calls[0]?.[0]).toEqual(encode(next));
    expect(vi.mocked(foldClassifiedChatLedger).mock.calls[0]?.[1]).toHaveLength(1);
    const refuse = async (): Promise<never> => {
      throw new Error('Read-only');
    };
    const canonical = await createEventLogAppender({
      read: async () => appended,
      append: refuse,
      truncate: refuse,
      close: async () => undefined,
      size: async () => appended.byteLength,
      exclusive: async (section) => section(),
    });
    expect(await second.log.read()).toEqual(await canonical.read());
    expect(await second.log.messages()).toEqual(await canonical.messages());
    await canonical.close();
  });

  it('resets a published complete unterminated row before extension', async () => {
    const bytes = encode(row(0).trimEnd());
    const first = createReplayView(bytes, 'source');
    const second = first.extend(encode(row(0) + row(1)));
    expect(second.generation).not.toBe(first.generation);
    expect(await second.log.read()).toHaveLength(2);
  });
});
