import type * as SerializationModule from '#log/serialization.js';
import type * as LedgerModule from '#log/chat-ledger.js';
import type * as CanonicalModule from '#log/canonical-json.js';
import { canonicalJson } from '#log/canonical-json.js';
import { describe, expect, it, vi } from 'vitest';
import { createReplayView, isBytePrefix } from '#launchers/replay-view.js';
import { parseReplayEventLogBytes } from '#log/serialization.js';
import { foldClassifiedChatLedger } from '#log/chat-ledger.js';
import { invalidHistoryFixtures } from '#log/invalid-history.fixture.js';
import { createEventLogAppender } from '#log/event-log-appender.js';

vi.mock('#log/serialization.js', async (original) => {
  const actual = await original<typeof SerializationModule>();
  return { ...actual, parseReplayEventLogBytes: vi.fn(actual.parseReplayEventLogBytes) };
});
vi.mock('#log/chat-ledger.js', async (original) => {
  const actual = await original<typeof LedgerModule>();
  return { ...actual, foldClassifiedChatLedger: vi.fn(actual.foldClassifiedChatLedger) };
});
vi.mock('#log/canonical-json.js', async (original) => {
  const actual = await original<typeof CanonicalModule>();
  return { ...actual, canonicalJson: vi.fn(actual.canonicalJson) };
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
  it('defers canonical identity work for unique replay rows until an actual key collision', () => {
    vi.mocked(canonicalJson).mockClear();
    const unique = row(0) + row(1) + row(2);
    const first = createReplayView(encode(unique), 'source');
    expect(canonicalJson).not.toHaveBeenCalled();
    const duplicate = first.extend(encode(unique + row(0)));
    expect(canonicalJson).toHaveBeenCalledTimes(2);
    vi.mocked(canonicalJson).mockClear();
    duplicate.extend(encode(unique + row(0) + row(0)));
    expect(canonicalJson).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'whitespace and key order',
      first: row(0),
      next: '  ' + row(0).replace('"version":1,', '').replace('}\n', ',"version":1}\n'),
    },
    { name: 'equivalent numeric spelling', first: row(0), next: row(0).replace('"sequence":0', '"sequence":0.0') },
    {
      name: 'duplicate JSON keys with equal final value',
      first: row(0),
      next: row(0).replace('"sequence":0', '"sequence":99,"sequence":0'),
    },
    {
      name: 'opaque payload reordered',
      first: row(0).replace('"type":"future.row"', '"type":"future.row","payload":{"a":1,"b":2}'),
      next: row(0).replace('"type":"future.row"', '"type":"future.row","payload":{"b":2,"a":1}'),
    },
    {
      name: 'opaque payload conflict',
      first: row(0),
      next: row(0).replace('"type":"future.row"', '"type":"future.row","payload":"different"'),
    },
    {
      name: 'opaque nonfinite numeric spelling',
      first: row(0).replace('"type":"future.row"', '"type":"future.row","payload":1e400'),
      next: row(0).replace('"type":"future.row"', '"type":"future.row","payload":2e400'),
    },
  ])('preserves eager replay over $name across physical append boundaries', async ({ first, next }) => {
    const bytes = encode(first + next + row(1));
    const initial = createReplayView(encode(first), 'source');
    const view = initial.extend(bytes);
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
    try {
      expect(await view.log.read()).toEqual(await canonical.read());
      expect(await view.log.messages()).toEqual(await canonical.messages());
      expect(view.sourceHealth.historyIntact).toBe(await canonical.historyIntact());
      expect(view.ledger.position.cursor).toBe(3);
      expect(view.projectionBatch({ chatId: 'chat', cursor: 0, limit: 16, maxBytes: 100_000 }).facts).toHaveLength(3);
      const singleRows = [0, 1, 2].flatMap(
        (cursor) => view.projectionBatch({ chatId: 'chat', cursor, limit: 1, maxBytes: 100_000 }).facts,
      );
      expect(singleRows).toEqual(
        view.projectionBatch({ chatId: 'chat', cursor: 0, limit: 16, maxBytes: 100_000 }).facts,
      );
    } finally {
      await canonical.close();
    }
  });

  it.each([
    { exposure: 'raw', conflict: false },
    { exposure: 'raw', conflict: true },
    { exposure: 'fact', conflict: false },
    { exposure: 'fact', conflict: true },
  ] as const)(
    'keeps original identity after $exposure exposure mutation (conflict=$conflict)',
    async ({ exposure, conflict }) => {
      const original = {
        version: 1,
        leaderEpoch: 'e',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'message.appended',
        message: { id: 'm', role: 'user', content: 'original' },
      };
      const firstLine = JSON.stringify(original) + '\n';
      vi.mocked(canonicalJson).mockClear();
      const first = createReplayView(encode(firstLine), 'source');
      if (exposure === 'raw') {
        const exposed = await first.log.read();
        const event = exposed[0];
        if (event?.type !== 'message.appended') {
          throw new Error('Expected an appended provider message');
        }
        // Deliberately exercise runtime mutation available through a readonly public reference.
        Reflect.set(event.message, 'content', 'exposed mutation');
      } else {
        const fact = first.projectionBatch({ chatId: 'chat', cursor: 0, limit: 16, maxBytes: 100_000 }).facts[0];
        if (fact?.classification !== 'known' || fact.effect.type !== 'message.appended') {
          throw new Error('Expected an appended message fact');
        }
        Reflect.set(fact.effect.message, 'content', 'exposed mutation');
      }
      const next = conflict ? { ...original, message: { ...original.message, content: 'exposed mutation' } } : original;
      const appended = first.extend(encode(firstLine + JSON.stringify(next) + '\n'));
      const fingerprints = vi
        .mocked(canonicalJson)
        .mock.results.filter((result) => result.type === 'return')
        .map((result) => result.value);
      expect(fingerprints.some((value) => value.includes('"content":"original"'))).toBe(true);
      if (!conflict) {
        expect(fingerprints.every((value) => !value.includes('exposed mutation'))).toBe(true);
      }
      expect(await appended.log.read()).toHaveLength(2);
      expect(await appended.log.messages()).toHaveLength(1);
      expect(appended.ledger.position.cursor).toBe(2);
    },
  );

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
    vi.mocked(parseReplayEventLogBytes).mockClear();
    vi.mocked(foldClassifiedChatLedger).mockClear();
    const second = first.extend(appended);
    expect(second.generation).toBe('source');
    expect(await second.log.read()).toHaveLength(2);
    const secondRows = await second.log.read();
    expect(secondRows[0]).toBe(firstRows[0]);
    expect(first.ledger).toBe(priorLedger);
    expect(first.ledger.position.cursor).toBe(1);
    expect(await first.log.read()).toHaveLength(1);
    expect(parseReplayEventLogBytes).toHaveBeenCalledOnce();
    expect(vi.mocked(parseReplayEventLogBytes).mock.calls[0]?.[0]).toEqual(encode(next));
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
