import { describe, expect, it } from 'vitest';

import { defaultArenaBytes, slotIndex, slotInt32Length, syncError, syncState } from '#sync/sync-fs-protocol.js';

describe('sync-fs-protocol', () => {
  it('keeps slot layout contiguous indices', () => {
    expect(slotIndex.state).toBe(0);
    expect(slotIndex.requestId).toBe(1);
    expect(slotIndex.errorCode).toBe(2);
    expect(slotIndex.payloadLength).toBe(3);
    expect(slotInt32Length).toBe(4);
  });

  it('uses distinct enum value ranges for state vs error', () => {
    expect(syncState.ready).not.toBe(syncError.ok);
  });

  it('defaults arena to 4MiB', () => {
    expect(defaultArenaBytes).toBe(4 * 1024 * 1024);
  });
});
