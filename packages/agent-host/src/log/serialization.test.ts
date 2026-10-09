import { describe, expect, it } from 'vitest';
import { parseEventLogBytes } from '#log/serialization.js';

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const event = {
  version: 1,
  leaderEpoch: 'e',
  sequence: 0,
  recordedAt: '2026-10-08T00:00:00.000Z',
  runId: 'r',
  type: 'future.row',
  text: '😀é\ninside JSON',
};

// Physical offsets are relative to the supplied view, including when the backing allocation has other data.
describe('byte log line boundaries', () => {
  it.each([0, 1, 4])('preserves CRLF, empty lines, quarantine and torn tails at offset %s', (offset) => {
    const first = JSON.stringify(event) + '\r\n';
    const complete = encode(first + '\ninvalid\n');
    const content = encode(first + '\ninvalid\n{"torn":');
    const backing = new Uint8Array(offset + content.length + 3).fill(10);
    backing.set(content, offset);
    const parsed = parseEventLogBytes(backing.subarray(offset, offset + content.length));
    expect(parsed.rows).toEqual([{ event, opaque: true }]);
    expect(parsed.events).toEqual([event]);
    expect(parsed.quarantined).toEqual([encode(first).length, encode(first).length + 1]);
    expect(parsed.validByteLength).toBe(complete.length);
    expect(parsed.discardedTail).toBe(true);
    expect(parsed.needsSeparator).toBe(false);
  });

  it.each(['', '\n', '\r\n'])('retains a complete final row with terminator %j', (terminator) => {
    const bytes = encode(JSON.stringify(event) + terminator);
    const parsed = parseEventLogBytes(bytes);
    expect(parsed.events).toEqual([event]);
    expect(parsed.validByteLength).toBe(bytes.length);
    expect(parsed.needsSeparator).toBe(terminator === '');
    expect(parsed.discardedTail).toBe(false);
    expect(parsed.quarantined).toEqual([]);
  });

  it('does not read a newline outside an empty view', () => {
    const parsed = parseEventLogBytes(new Uint8Array([10, 10]).subarray(1, 1));
    expect(parsed).toEqual({
      rows: [],
      events: [],
      quarantined: [],
      validByteLength: 0,
      needsSeparator: false,
      discardedTail: false,
    });
  });

  it('quarantines invalid UTF-8 before continuing with the next physical row', () => {
    const next = encode(JSON.stringify(event) + '\n');
    const bytes = new Uint8Array(3 + next.length);
    bytes.set([255, 13, 10]);
    bytes.set(next, 3);
    const parsed = parseEventLogBytes(bytes);
    expect(parsed.events).toEqual([event]);
    expect(parsed.quarantined).toEqual([0]);
    expect(parsed.validByteLength).toBe(bytes.length);
  });
});
