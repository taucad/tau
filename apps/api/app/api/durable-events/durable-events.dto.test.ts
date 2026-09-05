import { describe, expect, it } from 'vitest';
import { readDurableEventsSchema } from '#api/durable-events/durable-events.dto.js';

describe('readDurableEventsSchema', () => {
  it('defaults to an immediate read from the beginning of the stream', () => {
    expect(readDurableEventsSchema.parse({})).toEqual({
      afterSequence: 0,
      limit: 500,
      longPollDuration: 0,
    });
  });

  it('rejects negative cursors and unbounded long polls', () => {
    expect(readDurableEventsSchema.safeParse({ afterSequence: -1 }).success).toBe(false);
    expect(readDurableEventsSchema.safeParse({ longPollDuration: 25_001 }).success).toBe(false);
    expect(readDurableEventsSchema.safeParse({ limit: 1001 }).success).toBe(false);
  });
});
