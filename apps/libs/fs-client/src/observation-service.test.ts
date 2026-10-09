import { guardActors } from '@taucad/xstate-testing/inspect';
import { StepClock } from '@taucad/xstate-testing/clock';
import { observationIgnoredEvents } from '#machines/observation.machine.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObservationService } from '#observation-service.js';
import type { FileContentResult } from '#file-content-service.js';

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
  it('keeps a disposed shell inert after selection and closes stale active leases', async () => {
    const held = Promise.withResolvers<string>();
    const read = vi.fn().mockReturnValueOnce(held.promise).mockResolvedValue('revived');
    const watch = vi.fn(() => ({
      ready: Promise.resolve(),
      closed: Promise.withResolvers<void>().promise,
      dispose: vi.fn(),
    }));
    const invalidate = vi.fn();
    const publish = vi.fn();
    const service = new ObservationService<string>({
      resource: 'terminal',
      actorOptions: guardedOptions(),
      read,
      watch,
      invalidate,
      publish,
    });
    const old = service.acquire();
    await flush();
    service.dispose();
    const invalidationsAtDispose = invalidate.mock.calls.length;
    const late = service.acquire();
    try {
      old.refresh();
      old.release();
      old.release();
      late.refresh();
      held.resolve('old');
      await flush();
      expect.soft(service.activeLeaseCount).toBe(0);
      expect.soft(late.getSnapshot()).toEqual({ status: 'closed' });
      expect.soft(watch).toHaveBeenCalledOnce();
      expect.soft(read).toHaveBeenCalledOnce();
      expect.soft(invalidate).toHaveBeenCalledTimes(invalidationsAtDispose);
      expect.soft(publish).not.toHaveBeenCalled();
    } finally {
      late.release();
      late.release();
      service.dispose();
    }
    expect(service.activeLeaseCount).toBe(0);
  });

  it('keeps a shell disposed before its first lease closed without I/O', async () => {
    const watch = vi.fn(() => ({
      ready: Promise.resolve(),
      closed: Promise.withResolvers<void>().promise,
      dispose: vi.fn(),
    }));
    const read = vi.fn().mockResolvedValue('unexpected');
    const service = new ObservationService<string>({
      resource: 'never-acquired',
      actorOptions: guardedOptions(),
      watch,
      read,
    });
    service.dispose();
    const late = service.acquire();
    try {
      late.refresh();
      await flush();
      expect.soft(late.getSnapshot()).toEqual({ status: 'closed' });
      expect.soft(service.activeLeaseCount).toBe(0);
      expect.soft(watch).not.toHaveBeenCalled();
      expect.soft(read).not.toHaveBeenCalled();
    } finally {
      late.release();
      service.dispose();
    }
  });

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
  it.each(['invalidate', 'reset'] as const)(
    'ignores a retired watch %s callback while a reacquired owner stages its result',
    async (operation) => {
      const callbacks: Array<{ invalidate(): void; reset(): void }> = [];
      const held = Promise.withResolvers<string>();
      const invalidateDomain = vi.fn();
      const disposeValue = vi.fn();
      const publish = vi.fn();
      const read = vi.fn().mockResolvedValueOnce('old').mockReturnValueOnce(held.promise).mockResolvedValue('fresh');
      const service = new ObservationService<string>({
        actorOptions: guardedOptions(),
        resource: 'same-path',
        watch: (invalidate, reset) => {
          callbacks.push({ invalidate, reset });
          return { ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: vi.fn() };
        },
        read,
        invalidate: invalidateDomain,
        disposeValue,
        publish,
      });
      const old = service.acquire();
      await flush();
      old.release();
      const current = service.acquire();
      try {
        await flush();
        const invalidationsBeforeOldCallback = invalidateDomain.mock.calls.length;
        const diagnosticsBeforeOldCallback = service.diagnostics.invalidations;
        held.resolve('current');
        queueMicrotask(() => {
          callbacks[0]![operation]();
        });
        await flush();
        expect.soft(current.getSnapshot()).toEqual({ status: 'ready', value: 'current' });
        expect.soft(publish.mock.calls).toEqual([['old'], ['current']]);
        expect.soft(disposeValue.mock.calls).toEqual([['old']]);
        expect.soft(invalidateDomain).toHaveBeenCalledTimes(invalidationsBeforeOldCallback);
        expect.soft(service.diagnostics.invalidations).toBe(diagnosticsBeforeOldCallback);
        expect.soft(read).toHaveBeenCalledTimes(2);
        callbacks[1]![operation]();
        await flush();
        expect(current.getSnapshot()).toEqual({ status: 'ready', value: 'fresh' });
        expect(read).toHaveBeenCalledTimes(3);
        expect(invalidateDomain).toHaveBeenCalledTimes(invalidationsBeforeOldCallback + 1);
      } finally {
        current.release();
        service.dispose();
      }
    },
  );

  it.each(['invalidate', 'reset'] as const)('ignores watch %s callbacks after terminal disposal', async (operation) => {
    const callbacks = { invalidate: (): void => undefined, reset: (): void => undefined };
    const invalidateDomain = vi.fn();
    const read = vi.fn().mockResolvedValue('old');
    const service = new ObservationService<string>({
      actorOptions: guardedOptions(),
      resource: 'terminal-watch',
      read,
      invalidate: invalidateDomain,
      watch: (invalidate, reset) => {
        Object.assign(callbacks, { invalidate, reset });
        return { ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: vi.fn() };
      },
    });
    const lease = service.acquire();
    await flush();
    service.dispose();
    const invalidationsAtDispose = invalidateDomain.mock.calls.length;
    const diagnosticsAtDispose = service.diagnostics.invalidations;
    callbacks[operation]();
    await flush();
    expect.soft(invalidateDomain).toHaveBeenCalledTimes(invalidationsAtDispose);
    expect.soft(service.diagnostics.invalidations).toBe(diagnosticsAtDispose);
    expect.soft(lease.getSnapshot()).toEqual({ status: 'closed' });
    expect.soft(read).toHaveBeenCalledOnce();
    lease.release();
  });

  it.each(['invalidate', 'reset'] as const)(
    'ignores synchronous %s delivery from watch disposal',
    async (operation) => {
      const invalidateDomain = vi.fn();
      const service = new ObservationService<string>({
        actorOptions: guardedOptions(),
        resource: 'closing-watch',
        read: vi.fn().mockResolvedValue('old'),
        invalidate: invalidateDomain,
        watch: (invalidate, reset) => ({
          ready: Promise.resolve(),
          closed: Promise.withResolvers<void>().promise,
          dispose: () => {
            ({ invalidate, reset })[operation]();
          },
        }),
      });
      const lease = service.acquire();
      await flush();
      lease.release();
      expect.soft(invalidateDomain).toHaveBeenCalledOnce();
      expect.soft(service.diagnostics.invalidations).toBe(0);
      expect.soft(service.getSnapshot()).toEqual({ status: 'closed' });
      service.dispose();
    },
  );

  it.each(['invalidate', 'reset'] as const)('accepts synchronous current watch registration %s', async (operation) => {
    const invalidateDomain = vi.fn();
    const read = vi.fn().mockResolvedValue('current');
    const service = new ObservationService<string>({
      actorOptions: guardedOptions(),
      resource: 'registering-watch',
      read,
      invalidate: invalidateDomain,
      watch: (invalidate, reset) => {
        ({ invalidate, reset })[operation]();
        return { ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: vi.fn() };
      },
    });
    const lease = service.acquire();
    try {
      await flush();
      expect(invalidateDomain).toHaveBeenCalledOnce();
      expect(service.diagnostics.invalidations).toBe(1);
      expect(lease.getSnapshot()).toEqual({ status: 'ready', value: 'current' });
      expect(read).toHaveBeenCalledOnce();
    } finally {
      lease.release();
    }
  });

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

describe('observed dependencies', () => {
  it('refuses a watchless successful read that observes no dependency', async () => {
    const publish = vi.fn();
    const service = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'unowned',
      read: async () => 'unowned',
      publish,
    });
    const lease = service.acquire();
    await flush();
    expect(lease.getSnapshot().status).toBe('error');
    expect(lease.getSnapshot().error).toContain('requires a watch or an observed dependency');
    expect(publish).not.toHaveBeenCalled();
    lease.release();
  });

  it.each(['dependency', 'configuration'] as const)(
    'disposes a returned fallback exactly once when %s refuses publication',
    async (failure) => {
      const fallback = { capability: 'owned-fallback' };
      const disposeValue = vi.fn();
      const source = new ObservationService({
        actorOptions: guardedOptions(),
        resource: 'failed-source',
        watch: () => ({
          ready: Promise.reject(new Error('registration refused')),
          closed: Promise.withResolvers<void>().promise,
          dispose: vi.fn(),
        }),
        read: async () => 'unreachable',
      });
      const service = new ObservationService({
        actorOptions: guardedOptions(),
        resource: 'fallback-domain',
        disposeValue,
        read: async (fence) => {
          if (failure === 'dependency') {
            try {
              await fence.observe(source);
            } catch {
              /* Domain catches dependency rejection and returns an owned fallback. */
            }
          }
          return fallback;
        },
      });
      const lease = service.acquire();
      await flush();
      await flush();
      expect(lease.getSnapshot().status).toBe('error');
      expect(lease.getSnapshot().value).toBeUndefined();
      expect(disposeValue).toHaveBeenCalledExactlyOnceWith(fallback);
      lease.release();
      expect(disposeValue).toHaveBeenCalledOnce();
      expect(source.activeLeaseCount).toBe(0);
    },
  );

  it('registers before reading and shares repeated dependencies until the last consumer releases', async () => {
    const ready = Promise.withResolvers<void>();
    const dispose = vi.fn();
    const read = vi.fn(async () => 'authoritative');
    const source = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'source',
      watch: () => ({ ready: ready.promise, closed: Promise.withResolvers<void>().promise, dispose }),
      read,
    });
    const makeDependent = () =>
      new ObservationService({
        actorOptions: guardedOptions(),
        resource: 'dependent',
        read: async (fence) => Promise.all([fence.observe(source), fence.observe(source)]),
      });
    const one = makeDependent().acquire();
    const two = makeDependent().acquire();
    await flush();
    expect(source.activeLeaseCount).toBe(2);
    expect(read).not.toHaveBeenCalled();
    ready.resolve();
    await flush();
    await flush();
    expect(one.getSnapshot()).toMatchObject({ status: 'ready', value: ['authoritative', 'authoritative'] });
    expect(two.getSnapshot().status).toBe('ready');
    expect(read).toHaveBeenCalledOnce();
    one.release();
    expect(source.activeLeaseCount).toBe(1);
    expect(dispose).not.toHaveBeenCalled();
    two.release();
    one.release();
    two.release();
    expect(source.activeLeaseCount).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('propagates the first closure of an already-ready shared dependency even when the domain catches failure', async () => {
    const closed = Promise.withResolvers<void>();
    const read = vi.fn(async () => 'safe');
    const source = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'shared',
      watch: () => ({ ready: Promise.resolve(), closed: closed.promise, dispose: vi.fn() }),
      read,
    });
    const held = source.acquire();
    await flush();
    const service = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'catching-domain',
      read: async (fence) => {
        try {
          return [await fence.observe(source)];
        } catch {
          return [];
        }
      },
    });
    const lease = service.acquire();
    await flush();
    expect(lease.getSnapshot()).toMatchObject({ status: 'ready', value: ['safe'] });
    expect(read).toHaveBeenCalledOnce();
    closed.resolve();
    await flush();
    await flush();
    expect(lease.getSnapshot().status).not.toBe('ready');
    expect(lease.getSnapshot().value).toEqual(['safe']);
    lease.release();
    held.release();
  });

  it('recovers by pruning a removed unseen unhealthy dependency only after a current successful read', async () => {
    const closed = Promise.withResolvers<void>();
    const disposeAlpha = vi.fn();
    const alpha = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'alpha',
      watch: () => ({ ready: Promise.resolve(), closed: closed.promise, dispose: disposeAlpha }),
      read: async () => 'alpha',
    });
    const beta = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'beta',
      watch: () => ({ ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: vi.fn() }),
      read: async () => 'beta',
    });
    let changed = (): void => undefined;
    let includeAlpha = true;
    const service = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'directory-catalog',
      watch: (invalidate) => {
        changed = invalidate;
        return { ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: vi.fn() };
      },
      read: async (fence) => {
        const result = [await fence.observe(beta)];
        if (includeAlpha) {
          try {
            result.push(await fence.observe(alpha));
          } catch {
            /* Real resolver treats an unreadable file as absent. */
          }
        }
        return result;
      },
    });
    const lease = service.acquire();
    await flush();
    await flush();
    expect(lease.getSnapshot()).toMatchObject({ status: 'ready', value: ['beta', 'alpha'] });
    closed.resolve();
    await flush();
    await flush();
    expect(lease.getSnapshot().status).not.toBe('ready');
    includeAlpha = false;
    changed();
    await flush();
    await flush();
    expect(lease.getSnapshot()).toMatchObject({ status: 'ready', value: ['beta'] });
    expect(alpha.activeLeaseCount).toBe(0);
    expect(beta.activeLeaseCount).toBe(1);
    expect(disposeAlpha).toHaveBeenCalledOnce();
    lease.release();
    expect(beta.activeLeaseCount).toBe(0);
  });

  it('refuses late acquisition and pruning from an aborted owner after replacement has published', async () => {
    const domainGate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const source = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'source',
      watch: () => ({ ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: vi.fn() }),
      read: async () => 'current',
    });
    const retiredWatch = vi.fn(() => ({
      ready: Promise.resolve(),
      closed: Promise.withResolvers<void>().promise,
      dispose: vi.fn(),
    }));
    const retiredOnly = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'retired-only',
      watch: retiredWatch,
      read: async () => 'retired',
    });
    let first = true;
    const publish = vi.fn();
    const service = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'domain',
      publish,
      read: async (fence) => {
        const value = await fence.observe(source);
        if (first) {
          first = false;
          entered.resolve();
          await domainGate.promise;
          await fence.observe(retiredOnly);
        }
        return value;
      },
    });
    const old = service.acquire();
    await entered.promise;
    old.release();
    const current = service.acquire();
    await flush();
    await flush();
    expect(current.getSnapshot()).toMatchObject({ status: 'ready', value: 'current' });
    expect(source.activeLeaseCount).toBe(1);
    domainGate.resolve();
    await flush();
    expect(retiredWatch).not.toHaveBeenCalled();
    expect(retiredOnly.activeLeaseCount).toBe(0);
    expect(source.activeLeaseCount).toBe(1);
    expect(publish).toHaveBeenCalledExactlyOnceWith('current');
    current.release();
  });

  it('retries the current failed dependency through held acknowledgement without restarting a retired lease', async () => {
    const ready = Promise.withResolvers<void>();
    const disposeFirst = vi.fn();
    const watch = vi
      .fn()
      .mockReturnValueOnce({
        ready: Promise.reject(new Error('registration refused')),
        closed: Promise.withResolvers<void>().promise,
        dispose: disposeFirst,
      })
      .mockReturnValue({ ready: ready.promise, closed: Promise.withResolvers<void>().promise, dispose: vi.fn() });
    const read = vi.fn<() => Promise<FileContentResult>>(async () => ({ kind: 'orphaned' }));
    const source = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'missing-manifest',
      watch,
      read,
    });
    const service = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'plugins',
      read: async (fence) => {
        const result = await fence.observe(source);
        return result.kind === 'orphaned' ? {} : undefined;
      },
    });
    const lease = service.acquire();
    await flush();
    await flush();
    expect(lease.getSnapshot().status).not.toBe('ready');
    expect(read).not.toHaveBeenCalled();
    lease.refresh();
    await flush();
    expect(watch).toHaveBeenCalledTimes(2);
    expect(disposeFirst).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    ready.resolve();
    await flush();
    await flush();
    expect(lease.getSnapshot()).toMatchObject({ status: 'ready', value: {} });
    expect(read).toHaveBeenCalledOnce();
    expect(source.activeLeaseCount).toBe(1);
    lease.release();
    expect(source.activeLeaseCount).toBe(0);
  });

  it('keeps one active source read and one trailing convergence without a refresh feedback loop', async () => {
    const old = Promise.withResolvers<string>();
    let changed = (): void => undefined;
    let reset = (): void => undefined;
    const read = vi
      .fn()
      .mockImplementationOnce(async () => old.promise)
      .mockResolvedValue('fresh');
    const source = new ObservationService<string>({
      actorOptions: guardedOptions(),
      resource: 'source',
      watch: (invalidate, resetSource) => {
        changed = invalidate;
        reset = resetSource;
        return { ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, dispose: vi.fn() };
      },
      read,
    });
    const publish = vi.fn();
    const service = new ObservationService({
      actorOptions: guardedOptions(),
      resource: 'domain',
      publish,
      read: async (fence) => fence.observe(source),
    });
    const lease = service.acquire();
    await flush();
    expect(read).toHaveBeenCalledOnce();
    reset();
    for (let index = 0; index < 100; index++) {
      changed();
    }
    await flush();
    expect(read).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    old.resolve('obsolete');
    await flush();
    await flush();
    expect(read).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledExactlyOnceWith('fresh');
    expect(lease.getSnapshot()).toMatchObject({ status: 'ready', value: 'fresh' });
    lease.release();
  });
});
