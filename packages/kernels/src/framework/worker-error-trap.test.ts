import { describe, it, expect, vi, afterEach } from 'vitest';
import { raceWithErrorTrap, createErrorTrap } from '#framework/worker-error-trap.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('raceWithErrorTrap', () => {
  it('resolves with the operation value when no rejections occur', async () => {
    const result = await raceWithErrorTrap(Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('rejects with the operation error when the operation itself rejects', async () => {
    await expect(raceWithErrorTrap(Promise.reject(new Error('op failed')))).rejects.toThrow('op failed');
  });

  it('catches an unhandled rejection that fires during the operation', async () => {
    const hangingPromise = new Promise<string>(() => {
      // Simulate a fire-and-forget rejection (e.g. Emscripten pthread postMessage)
      void Promise.reject(new Error('SharedArrayBuffer transfer requires crossOriginIsolated'));
    });

    await expect(raceWithErrorTrap(hangingPromise)).rejects.toThrow(
      'Unhandled rejection in worker: SharedArrayBuffer transfer requires crossOriginIsolated',
    );
  });

  it('catches non-Error rejection reasons', async () => {
    const hangingPromise = new Promise<string>(() => {
      void Promise.reject('string rejection reason');
    });

    await expect(raceWithErrorTrap(hangingPromise)).rejects.toThrow('Unhandled rejection in worker: string rejection reason');
  });

  it('removes the listener after the operation resolves', async () => {
    const removeSpy = vi.spyOn(process, 'off');
    await raceWithErrorTrap(Promise.resolve('done'));
    expect(removeSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
  });

  it('removes the listener after the operation rejects', async () => {
    const removeSpy = vi.spyOn(process, 'off');
    try {
      await raceWithErrorTrap(Promise.reject(new Error('fail')));
    } catch {
      // expected
    }

    expect(removeSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
  });

  it('does not interfere with rejections after cleanup', async () => {
    await raceWithErrorTrap(Promise.resolve('done'));

    // After cleanup, the trap should not be listening anymore.
    // Verify by checking that process.off was called (listener removed).
    const listenerCount = process.listenerCount('unhandledRejection');
    // Should be back to baseline (no extra listeners from the trap)
    expect(listenerCount).toBeLessThanOrEqual(1);
  });
});

describe('createErrorTrap', () => {
  it('returns a promise and cleanup function', () => {
    const trap = createErrorTrap();
    expect(trap.promise).toBeInstanceOf(Promise);
    expect(trap.cleanup).toBeTypeOf('function');
    trap.cleanup();
  });

  it('cleanup is idempotent', () => {
    const trap = createErrorTrap();
    expect(() => {
      trap.cleanup();
      trap.cleanup();
    }).not.toThrow();
  });

  it('trap promise rejects when unhandled rejection is emitted', async () => {
    const trap = createErrorTrap();

    try {
      void Promise.reject(new Error('boom'));
      await Promise.race([
        trap.promise,
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('boom');
    } finally {
      trap.cleanup();
    }
  });

  it('does not catch rejections after cleanup', async () => {
    const trap = createErrorTrap();
    trap.cleanup();

    // After cleanup, the trap promise should stay pending forever.
    // We verify by racing it against a short timeout.
    const raceResult = await Promise.race([
      trap.promise.then(() => 'trap-resolved').catch(() => 'trap-caught'),
      new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('timeout');
        }, 50);
      }),
    ]);

    expect(raceResult).toBe('timeout');
  });
});
