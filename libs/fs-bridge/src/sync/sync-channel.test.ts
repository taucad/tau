import { describe, expect, it, vi } from 'vitest';

import { createSyncRequestClient } from '#sync/client.js';
import { syncChannelError, syncSlotIndex, syncSlotInt32Length, syncSlotState } from '#sync/protocol.js';
import { completeSyncResponse } from '#sync/server.js';

const createBuffers = (arenaBytes = 16) => ({
  slotSab: new SharedArrayBuffer(syncSlotInt32Length * Int32Array.BYTES_PER_ELEMENT),
  arenaSab: new SharedArrayBuffer(arenaBytes),
});

describe('generic synchronous request channel', () => {
  it('keeps clients isolated in independent bounded slots', () => {
    const first = createBuffers();
    const second = createBuffers();
    const firstSlot = new Int32Array(first.slotSab);
    const secondSlot = new Int32Array(second.slotSab);
    Atomics.store(firstSlot, syncSlotIndex.state, syncSlotState.pending);
    Atomics.store(firstSlot, syncSlotIndex.requestId, 1);
    expect(
      completeSyncResponse({
        slot: firstSlot,
        arena: new Uint8Array(first.arenaSab) as unknown as Uint8Array<ArrayBuffer>,
        requestId: 1,
        payload: new Uint8Array([1]),
      }),
    ).toBe(true);
    expect(Atomics.load(secondSlot, syncSlotIndex.state)).toBe(syncSlotState.idle);
  });

  it('rejects oversized, stale, and late responses without mutating a newer request', () => {
    const { slotSab, arenaSab } = createBuffers(2);
    const slot = new Int32Array(slotSab);
    const arena = new Uint8Array(arenaSab) as unknown as Uint8Array<ArrayBuffer>;
    Atomics.store(slot, syncSlotIndex.state, syncSlotState.pending);
    Atomics.store(slot, syncSlotIndex.requestId, 2);
    expect(completeSyncResponse({ slot, arena, requestId: 1, payload: new Uint8Array([9]) })).toBe(false);
    expect(Atomics.load(slot, syncSlotIndex.state)).toBe(syncSlotState.pending);
    expect([...arena]).toEqual([0, 0]);
    expect(completeSyncResponse({ slot, arena, requestId: 2, payload: new Uint8Array(3) })).toBe(true);
    expect(Atomics.load(slot, syncSlotIndex.errorCode)).toBe(syncChannelError.tooLarge);
  });

  it('lets a claimed server response win the timeout race and leaves the slot reusable', () => {
    const { slotSab } = createBuffers();
    const slot = new Int32Array(slotSab);
    const wait = vi.spyOn(Atomics, 'wait').mockImplementation((array, index, expected) => {
      const activeSlot = array as unknown as Int32Array;
      if (Number(expected) === syncSlotState.pending) {
        expect(Atomics.compareExchange(activeSlot, index, syncSlotState.pending, syncSlotState.claimed)).toBe(
          syncSlotState.pending,
        );
        return 'timed-out';
      }
      expect(Number(expected)).toBe(syncSlotState.claimed);
      Atomics.store(activeSlot, syncSlotIndex.errorCode, syncChannelError.ok);
      Atomics.store(activeSlot, syncSlotIndex.payloadLength, 1);
      Atomics.store(activeSlot, syncSlotIndex.state, syncSlotState.ready);
      return 'ok';
    });
    const client = createSyncRequestClient({ port: { postMessage: vi.fn() }, slotSab, requestTimeout: 1 });
    try {
      expect(client.perform((requestId) => ({ requestId }))).toMatchObject({ requestId: 1, payloadLength: 1 });
      expect(client.perform((requestId) => ({ requestId }))).toMatchObject({ requestId: 2, payloadLength: 1 });
      expect(Atomics.load(slot, syncSlotIndex.state)).toBe(syncSlotState.idle);
    } finally {
      wait.mockRestore();
    }
  });

  it('never lets a prior request satisfy the next request with stale bytes', () => {
    const { slotSab, arenaSab } = createBuffers();
    const slot = new Int32Array(slotSab);
    const arena = new Uint8Array(arenaSab) as unknown as Uint8Array<ArrayBuffer>;
    Atomics.store(slot, syncSlotIndex.requestId, 2);
    Atomics.store(slot, syncSlotIndex.state, syncSlotState.pending);

    expect(completeSyncResponse({ slot, arena, requestId: 1, payload: new Uint8Array([1]) })).toBe(false);
    expect(Atomics.load(slot, syncSlotIndex.state)).toBe(syncSlotState.pending);
    expect(arena[0]).toBe(0);

    expect(completeSyncResponse({ slot, arena, requestId: 2, payload: new Uint8Array([2]) })).toBe(true);
    expect(arena[0]).toBe(2);
  });

  it('times out, releases backpressure, and ignores the late server completion', () => {
    const { slotSab, arenaSab } = createBuffers();
    const postMessage = vi.fn();
    const client = createSyncRequestClient({ port: { postMessage }, slotSab, requestTimeout: 1 });
    expect(() => client.perform((requestId) => ({ requestId }))).toThrow('timed out');
    const slot = new Int32Array(slotSab);
    expect(Atomics.load(slot, syncSlotIndex.state)).toBe(syncSlotState.idle);
    expect(
      completeSyncResponse({
        slot,
        arena: new Uint8Array(arenaSab) as unknown as Uint8Array<ArrayBuffer>,
        requestId: 1,
        payload: new Uint8Array([1]),
      }),
    ).toBe(false);
  });

  it('fails a busy slot and disposal deterministically', () => {
    const { slotSab } = createBuffers();
    const slot = new Int32Array(slotSab);
    const client = createSyncRequestClient({ port: { postMessage: vi.fn() }, slotSab });
    Atomics.store(slot, syncSlotIndex.state, syncSlotState.pending);
    expect(() => client.perform(() => ({}))).toThrow('slot busy');
    Atomics.store(slot, syncSlotIndex.state, syncSlotState.idle);
    client.dispose();
    expect(() => client.perform(() => ({}))).toThrow('client disposed');
  });
});
