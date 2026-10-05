import { guardActors } from '@taucad/xstate-testing/inspect';
import { StepClock } from '@taucad/xstate-testing/clock';
import { observationIgnoredEvents } from '#machines/observation.machine.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObservationService } from '#observation-service.js';

const guards: Array<ReturnType<typeof guardActors>> = [];
const guardedOptions = (): { inspect: ReturnType<typeof guardActors>['inspect']; clock: StepClock } => {
  const guard = guardActors({ ignore: { observation: observationIgnoredEvents } });
  guards.push(guard);
  return { inspect: guard.inspect, clock: new StepClock() };
};
afterEach(() => {
  for (const guard of guards.splice(0)) {
    expect(guard.take()).toEqual([]);
  }
});

const flush = async (): Promise<void> => {
  // oxlint-disable-next-line no-await-in-loop -- Drain causally dependent actor microtasks.
  for (let index = 0; index < 12; index++) {
    // oxlint-disable-next-line no-await-in-loop -- Drain causally dependent actor deliveries.
    await Promise.resolve();
  }
};

describe('ObservationService', () => {
  it('should await registration, coalesce a burst, and catch up after a stale read rejects', async () => {
    const ready = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<void>();
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<string>();
    let invalidate = (): void => undefined;
    const read = vi
      .fn()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise);
    const publish = vi.fn();
    const service = new ObservationService<string>({
      actorOptions: guardedOptions(),
      resource: 'file',
      watch: (change) => {
        invalidate = change;
        return { ready: ready.promise, closed: closed.promise, dispose: vi.fn() };
      },
      read,
      publish,
    });
    const one = service.acquire();
    const two = service.acquire();
    expect(read).not.toHaveBeenCalled();
    ready.resolve();
    await flush();
    for (let index = 0; index < 100; index++) {
      invalidate();
    }
    expect(read).toHaveBeenCalledTimes(1);
    one.release();
    first.reject(new Error('old read failed'));
    await flush();
    expect(read).toHaveBeenCalledTimes(2);
    second.resolve('new');
    await flush();
    expect(publish).toHaveBeenCalledExactlyOnceWith('new');
    expect(two.getSnapshot()).toEqual({ status: 'ready', value: 'new' });
    expect(service.diagnostics).toMatchObject({ reads: 2, invalidations: 100, coalesced: 100, refused: 1, leases: 1 });
    two.release();
    expect(service.getSnapshot()).toEqual({ status: 'closed' });
  });

  it.each([false, true])(
    'should dispose microtask-invalidated staging while preserving the published reference (%s)',
    async (reuseCurrent) => {
      const current = { url: 'current' };
      const staged = reuseCurrent ? current : { url: 'undisplayed' };
      const next = { url: 'next' };
      const second = Promise.withResolvers<typeof current>();
      const third = Promise.withResolvers<typeof current>();
      const disposeValue = vi.fn();
      const publish = vi.fn();
      const service = new ObservationService({
        actorOptions: guardedOptions(),
        resource: 'thumbnail',
        watch: () => ({ ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: vi.fn() }),
        read: vi
          .fn()
          .mockResolvedValueOnce(current)
          // oxlint-disable-next-line typescript/promise-function-async -- Direct deferred promise preserves the reviewed staging/machine-completion microtask race.
          .mockImplementationOnce(() => second.promise)
          // oxlint-disable-next-line typescript/promise-function-async -- Keep the trailing read directly controlled by its deferred promise.
          .mockImplementationOnce(() => third.promise),
        disposeValue,
        publish,
      });
      const lease = service.acquire();
      await flush();
      lease.refresh();
      await flush();
      second.resolve(staged);
      queueMicrotask(() => {
        lease.refresh();
      });
      await flush();
      expect(lease.getSnapshot().value).toBe(current);
      expect(publish).toHaveBeenCalledExactlyOnceWith(current);
      expect(disposeValue.mock.calls).toEqual(reuseCurrent ? [] : [[staged]]);
      third.resolve(next);
      await flush();
      expect(lease.getSnapshot().value).toBe(next);
      expect(disposeValue.mock.calls).toEqual(reuseCurrent ? [[current]] : [[staged], [current]]);
      lease.release();
      expect(disposeValue.mock.calls).toEqual(reuseCurrent ? [[current], [next]] : [[staged], [current], [next]]);
    },
  );

  it('should preserve equal values without republishing and dispose discarded and final values', async () => {
    const first = { bytes: 'same' };
    const next = { bytes: 'same' };
    const publish = vi.fn();
    const disposeValue = vi.fn();
    const service = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'file',
      watch: () => ({ ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: vi.fn() }),
      read: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(next),
      equal: (a, b) => a.bytes === b.bytes,
      publish,
      disposeValue,
    });
    const lease = service.acquire();
    await flush();
    lease.refresh();
    await flush();
    expect(lease.getSnapshot().value).toBe(first);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(disposeValue).toHaveBeenCalledWith(next);
    lease.release();
    expect(disposeValue).toHaveBeenCalledWith(first);
    expect(lease.getSnapshot().value).toBeUndefined();
  });
});

describe('captured observation incarnation', () => {
  it('should dispose a late value after final release and never publish it into reacquired observation', async () => {
    const old = Promise.withResolvers<string>();
    const publish = vi.fn();
    const disposeValue = vi.fn();
    const service = new ObservationService<string>({
      actorOptions: guardedOptions(),
      resource: 'same-path',
      watch: () => ({ ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: vi.fn() }),
      read: vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce('current'),
      publish,
      disposeValue,
    });
    const first = service.acquire();
    await flush();
    first.release();
    const next = service.acquire();
    await flush();
    old.resolve('old-capability');
    await flush();
    expect(next.getSnapshot().value).toBe('current');
    expect(publish).toHaveBeenCalledExactlyOnceWith('current');
    expect(disposeValue).toHaveBeenCalledWith('old-capability');
    next.release();
  });

  it('should retain the safe value as an error, reset explicitly, and close the captured connection', async () => {
    const closed = Promise.withResolvers<void>();
    const read = vi
      .fn()
      .mockResolvedValueOnce('safe')
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce('recovered');
    const invalidateDomain = vi.fn();
    let reset = (): void => undefined;
    const service = new ObservationService<string>({
      actorOptions: guardedOptions(),
      resource: 'file',
      watch: (_invalidate, resetSource) => {
        reset = resetSource;
        return { ready: Promise.resolve(), closed: closed.promise, dispose: vi.fn() };
      },
      read,
      invalidate: invalidateDomain,
    });
    const lease = service.acquire();
    await flush();
    lease.refresh();
    expect(invalidateDomain).toHaveBeenCalledOnce();
    await flush();
    expect(lease.getSnapshot()).toEqual({ status: 'error', value: 'safe', error: 'Error: unavailable' });
    reset();
    await flush();
    expect(lease.getSnapshot()).toEqual({ status: 'ready', value: 'recovered' });
    closed.resolve();
    await flush();
    expect(lease.getSnapshot().status).toBe('closed');
    lease.release();
  });
});

describe('explicit registration retry', () => {
  it('should replace a closed registration actor and await its new acknowledgement before reading', async () => {
    const ready = Promise.withResolvers<void>();
    const disposeWatch = vi.fn();
    const read = vi.fn().mockResolvedValue('recovered');
    const service = new ObservationService<string>({
      actorOptions: guardedOptions(),
      resource: 'file',
      watch: vi
        .fn()
        .mockReturnValueOnce({
          ready: Promise.reject(new Error('registration unavailable')),
          closed: Promise.withResolvers<void>().promise,
          dispose: disposeWatch,
        })
        .mockReturnValueOnce({
          ready: ready.promise,
          closed: Promise.withResolvers<void>().promise,
          dispose: disposeWatch,
        }),
      read,
    });
    const lease = service.acquire();
    await flush();
    expect(lease.getSnapshot().status).toBe('closed');
    expect(read).not.toHaveBeenCalled();
    lease.refresh();
    await flush();
    expect(disposeWatch).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    ready.resolve();
    await flush();
    expect(lease.getSnapshot().value).toBe('recovered');
    lease.release();
  });
});
