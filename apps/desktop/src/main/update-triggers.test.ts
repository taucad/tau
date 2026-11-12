import { describe, expect, it, vi } from 'vitest';
import type { DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';

import {
  startUpdateTriggers,
  updateOnlinePollInterval,
  updateTriggerMinimumGap,
  updateTriggerSettleDelay,
} from '#main/update-triggers.js';

/** A hand-driven clock: `advance` runs every one-shot timer that has come due, in order. */
const setup = (initial: { online?: boolean; phase?: DesktopUpdateSnapshot['phase'] } = {}) => {
  const state = { online: initial.online ?? true, phase: initial.phase ?? 'current', time: 0 };
  const listeners = new Map<string, () => void>();
  const timers: Array<{ due: number; callback: () => void }> = [];
  let pollConnectivity: (() => void) | undefined;
  const poll = vi.fn((callback: () => void, _milliseconds: number) => {
    pollConnectivity = callback;
  });
  const check = vi.fn();
  const log = vi.fn();
  startUpdateTriggers({
    powerMonitor: {
      on: (event, listener) => {
        listeners.set(event, listener);
      },
    },
    isOnline: () => state.online,
    check,
    phase: () => state.phase,
    log,
    now: () => state.time,
    scheduleOnce: (callback, milliseconds) => {
      timers.push({ due: state.time + milliseconds, callback });
    },
    poll,
  });
  const advance = (milliseconds: number): void => {
    state.time += milliseconds;
    for (const timer of timers.splice(0)) {
      if (timer.due <= state.time) {
        timer.callback();
      } else {
        timers.push(timer);
      }
    }
  };
  return {
    state,
    check,
    log,
    poll,
    timers,
    advance,
    emit: (event: 'resume' | 'unlock-screen') => listeners.get(event)?.(),
    pollNow: () => pollConnectivity?.(),
  };
};

describe('update checks on wake and network return', () => {
  it('should check once, after the settle delay, when the machine wakes', () => {
    const { emit, advance, check, log } = setup();
    emit('resume');
    expect(check).not.toHaveBeenCalled();
    advance(updateTriggerSettleDelay - 1);
    expect(check).not.toHaveBeenCalled();
    advance(1);
    expect(check).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('info', 'updater.triggered', { reason: 'resume' });
  });

  it('should make one check of a wake, an unlock and the network returning together', () => {
    const { emit, advance, check, state, pollNow, timers } = setup({ online: false });
    emit('resume');
    emit('unlock-screen');
    state.online = true;
    pollNow();
    expect(timers).toHaveLength(1);
    advance(updateTriggerSettleDelay);
    expect(check).toHaveBeenCalledOnce();
  });

  it('should check when the network returns, and only on the change from offline to online', () => {
    const { advance, check, state, pollNow, poll, log } = setup({ online: false });
    expect(poll).toHaveBeenCalledWith(expect.any(Function), updateOnlinePollInterval);
    pollNow();
    advance(updateTriggerSettleDelay);
    expect(check).not.toHaveBeenCalled();

    state.online = true;
    pollNow();
    pollNow();
    advance(updateTriggerSettleDelay);
    expect(check).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('info', 'updater.triggered', { reason: 'online' });

    pollNow();
    advance(updateTriggerMinimumGap);
    expect(check).toHaveBeenCalledOnce();
  });

  it('should skip a check that falls due while offline and check when the network returns', () => {
    const { emit, advance, check, state, pollNow } = setup();
    state.online = false;
    emit('resume');
    advance(updateTriggerSettleDelay);
    expect(check).not.toHaveBeenCalled();

    state.online = true;
    pollNow();
    advance(updateTriggerSettleDelay);
    expect(check).toHaveBeenCalledOnce();
  });

  it('should keep the minimum gap between two checks it starts', () => {
    const { emit, advance, check } = setup();
    emit('resume');
    advance(updateTriggerSettleDelay);
    expect(check).toHaveBeenCalledOnce();

    emit('unlock-screen');
    advance(updateTriggerSettleDelay);
    emit('resume');
    advance(updateTriggerMinimumGap - updateTriggerSettleDelay - 1);
    expect(check).toHaveBeenCalledOnce();
    advance(1);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it.each(['disabled', 'saving', 'restarting'] as const)('should not check while the updater is %s', (phase) => {
    const { emit, advance, check, state } = setup({ phase });
    emit('resume');
    advance(updateTriggerSettleDelay);
    expect(check).not.toHaveBeenCalled();

    /* A skipped check does not use up the gap: the next wake checks after the settle delay alone. */
    state.phase = 'ready';
    emit('resume');
    advance(updateTriggerSettleDelay);
    expect(check).toHaveBeenCalledOnce();
  });
});
