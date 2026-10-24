import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foreignRunStaleMilliseconds } from '@taucad/agent-host';
import { initialChatProjection, reduceChatProjection } from '#machines/chat-projection.logic.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import { lifecycleRow } from '#machines/chat-projection.fixture.js';
import { subscribeRunElsewhere } from '#hooks/run-elsewhere-clock.js';

const at = Date.parse('2026-10-23T10:00:00.000Z');

const withForeignRun = (): ChatProjection =>
  reduceChatProjection(initialChatProjection, {
    type: 'remote',
    at,
    segments: [
      {
        deviceId: 'device-phone',
        bytes: new TextEncoder().encode(
          `${JSON.stringify({ ...lifecycleRow(0, 'admitted', 'run_phone'), recordedAt: new Date(at).toISOString() })}\n`,
        ),
      },
    ],
  }).state;

describe('the run-elsewhere clock (XD3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: at });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /* Streamed chunks change the projection many times a second; only another device's segments move the clock. */
  it('should arm one timer per change of the other devices’ segments, not per projection change', () => {
    let projection = withForeignRun();
    const listeners = new Set<() => void>();
    const source = {
      getProjection: () => projection,
      subscribeProjection: (_chatId: string, listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const setTimer = vi.spyOn(globalThis, 'setTimeout');
    const listener = vi.fn();
    const unsubscribe = subscribeRunElsewhere(source, 'chat-1', listener);
    const armed = setTimer.mock.calls.length;

    for (let chunk = 0; chunk < 20; chunk++) {
      projection = { ...projection, resetVersion: projection.resetVersion };
      for (const notify of listeners) {
        notify();
      }
    }

    expect(setTimer.mock.calls.length).toBe(armed);
    expect(listener).toHaveBeenCalledTimes(20);
    vi.advanceTimersByTime(foreignRunStaleMilliseconds + 1);
    expect(listener).toHaveBeenCalledTimes(21);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
