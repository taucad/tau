import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IoScheduler,
  backgroundIoAgingMilliseconds,
  backgroundIoConcurrency,
  sweepIoConcurrency,
} from '#io-scheduler.js';
import { ProviderRegistry } from '#provider-registry.js';
import { createWorkerTimings } from '#worker-timings.js';
import type { WorkerTimings } from '#worker-timings.js';

/** A call that settles only when the test says so. */
type HeldCall = Readonly<{ settle: () => void; promise: Promise<void> }>;

const held = (): HeldCall => {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { promise, settle: resolve };
};

/** Whether a promise has settled, read without awaiting it; `done` is the tracking promise, which never rejects. */
const settledFlag = <Result>(promise: Promise<Result>): { settled: boolean; done: Promise<void> } => {
  const state: { settled: boolean; done: Promise<void> } = { settled: false, done: Promise.resolve() };
  const watch = async (): Promise<void> => {
    try {
      await promise;
    } catch {
      /* Settled is all the flag reports. */
    } finally {
      state.settled = true;
    }
  };
  state.done = watch();
  return state;
};

/** Let every queued microtask and promise continuation run, without moving the fake clock. */
const drain = async (): Promise<void> => {
  for (let round = 0; round < 10; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each round lets one more continuation run.
    await Promise.resolve();
  }
};

describe('IoScheduler', () => {
  let timings: WorkerTimings;
  let scheduler: IoScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    timings = createWorkerTimings({ now: () => Date.now(), measure: false });
    scheduler = new IoScheduler({ timings });
  });

  afterEach(() => {
    scheduler.dispose();
    vi.useRealTimers();
  });

  /** Issue one background call that holds its slot until settled; `started` counts the admitted ones. */
  const issueBackground = async (calls: HeldCall[], started: { count: number }): Promise<void> =>
    scheduler.runBackground(async () => {
      started.count += 1;
      const call = held();
      calls.push(call);
      await call.promise;
    });

  describe('S10: an interactive call never waits for more than the background calls already issued', () => {
    it('should run an interactive call at once with four background calls that never settle in flight, and admit none more', async () => {
      const calls: HeldCall[] = [];
      const started = { count: 0 };
      for (let index = 0; index < 10; index += 1) {
        void issueBackground(calls, started);
      }
      await drain();
      expect(started.count).toBe(backgroundIoConcurrency);
      expect(scheduler.backgroundQueued()).toBe(10 - backgroundIoConcurrency);

      /* The interactive call is never queued: it is counted at once, whatever the background lane holds. */
      const settleInteractive = scheduler.beginInteractive('root-a');
      expect(scheduler.interactiveInFlight()).toBe(1);
      expect(scheduler.backgroundInFlight()).toBe(backgroundIoConcurrency);

      /* Two background calls settle while it is in flight: their slots stay empty until it settles. */
      calls[0]!.settle();
      calls[1]!.settle();
      await drain();
      expect(scheduler.backgroundInFlight()).toBe(backgroundIoConcurrency - 2);
      expect(started.count).toBe(backgroundIoConcurrency);

      settleInteractive();
      await drain();
      expect(started.count).toBe(backgroundIoConcurrency + 2);
      expect(scheduler.backgroundInFlight()).toBe(backgroundIoConcurrency);
    });

    it('should admit no background call while an interactive call is in flight, until it settles', async () => {
      const settleInteractive = scheduler.beginInteractive('root-a');
      const calls: HeldCall[] = [];
      const started = { count: 0 };
      for (let index = 0; index < 3; index += 1) {
        void issueBackground(calls, started);
      }
      await drain();
      expect(started.count).toBe(0);

      settleInteractive();
      await drain();
      expect(started.count).toBe(3);
    });

    it('should count interactive calls per root and admit only when every root has none in flight', async () => {
      const settleA = scheduler.beginInteractive('root-a');
      const settleB = scheduler.beginInteractive('root-b');
      const started = { count: 0 };
      void issueBackground([], started);
      expect(scheduler.interactiveInFlight('root-a')).toBe(1);
      expect(scheduler.interactiveInFlight('root-b')).toBe(1);

      settleA();
      await drain();
      expect(started.count).toBe(0);

      settleB();
      await drain();
      expect(started.count).toBe(1);
      expect(scheduler.interactiveInFlight()).toBe(0);
    });

    it('should end an interactive call’s wait when the background calls in flight at its issue settle, and record it', async () => {
      const calls: HeldCall[] = [];
      const started = { count: 0 };
      void issueBackground(calls, started);
      void issueBackground(calls, started);
      await drain();

      const settleInteractive = scheduler.beginInteractive('root-a');
      vi.advanceTimersByTime(30);
      calls[0]!.settle();
      await drain();
      vi.advanceTimersByTime(10);
      calls[1]!.settle();
      await drain();
      vi.advanceTimersByTime(500);
      settleInteractive();

      /* It could have waited behind the two only: 40 ms, not the 540 ms it was in flight. */
      expect(timings.summarize(0).spans['io.wait.interactive']).toEqual({
        count: 1,
        totalMilliseconds: 40,
        maxMilliseconds: 40,
      });
    });

    it('should record no interactive wait for a call issued with nothing ranked in flight', () => {
      scheduler.beginInteractive('root-a')();

      expect(timings.summarize(0).spans['io.wait.interactive']).toBeUndefined();
    });
  });

  describe('aging', () => {
    it(`should admit a background call that has waited ${backgroundIoAgingMilliseconds} ms behind interactive calls`, async () => {
      const settleInteractive = scheduler.beginInteractive('root-a');
      const started = { count: 0 };
      void issueBackground([], started);

      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds - 1);
      expect(started.count).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(started.count).toBe(1);
      expect(timings.summarize(0).spans['io.wait.background']).toEqual({
        count: 1,
        totalMilliseconds: backgroundIoAgingMilliseconds,
        maxMilliseconds: backgroundIoAgingMilliseconds,
      });
      settleInteractive();
    });

    it('should admit aged calls within the same limit of four, and the rest as slots free', async () => {
      const settleInteractive = scheduler.beginInteractive('root-a');
      const calls: HeldCall[] = [];
      const started = { count: 0 };
      for (let index = 0; index < 6; index += 1) {
        void issueBackground(calls, started);
      }

      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds);
      expect(started.count).toBe(backgroundIoConcurrency);

      calls[0]!.settle();
      await drain();
      /* The next queued call has aged too: a freed slot admits it although the interactive call is still in flight. */
      expect(started.count).toBe(backgroundIoConcurrency + 1);
      expect(scheduler.backgroundInFlight()).toBe(backgroundIoConcurrency);
      settleInteractive();
    });

    it('should age each call from its own issue, not from the head’s', async () => {
      const settleInteractive = scheduler.beginInteractive('root-a');
      const started = { count: 0 };
      void issueBackground([], started);
      await vi.advanceTimersByTimeAsync(200);
      void issueBackground([], started);

      await vi.advanceTimersByTimeAsync(50);
      expect(started.count).toBe(1);

      await vi.advanceTimersByTimeAsync(199);
      expect(started.count).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(started.count).toBe(2);
      settleInteractive();
    });
  });

  describe('no starvation', () => {
    it('should complete a background pass under steady interactive load, each call admitted within its aging bound', async () => {
      /* Interactive calls overlap so that one is always in flight: each lasts 100 ms and the next starts at 50 ms. */
      const loading = { on: true };
      const settles: Array<() => void> = [];
      const issueInteractive = (): void => {
        const settle = scheduler.beginInteractive('root-a');
        settles.push(settle);
        setTimeout(settle, 100);
      };
      const load = async (): Promise<void> => {
        while (loading.on) {
          issueInteractive();
          // oxlint-disable-next-line no-await-in-loop -- The load is a sequence of overlapping calls.
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 50);
          });
        }
      };
      void load();
      await drain();

      const waits: number[] = [];
      const pass = settledFlag(
        Promise.all(
          Array.from({ length: 40 }, async () => {
            const issuedAt = Date.now();
            await scheduler.runBackground(async () => {
              waits.push(Date.now() - issuedAt);
              await new Promise<void>((resolve) => {
                setTimeout(resolve, 10);
              });
            });
          }),
        ),
      );
      await drain();
      expect(pass.settled).toBe(false);

      await vi.advanceTimersByTimeAsync(400);
      expect(scheduler.interactiveInFlight()).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(400);
      expect(pass.settled).toBe(true);
      expect(waits).toHaveLength(40);
      /* Ten rounds of four, each 10 ms, after one aging wait of 250 ms: the last admitted by 340 ms. */
      expect(Math.max(...waits)).toBeLessThanOrEqual(backgroundIoAgingMilliseconds + 10 * 10);
      loading.on = false;
      await vi.advanceTimersByTimeAsync(200);
      for (const settle of settles) {
        settle();
      }
    });
  });

  describe('sweep window', () => {
    it('should keep at most its own window of sweep calls in flight, whatever the interactive load', async () => {
      const settleInteractive = scheduler.beginInteractive('root-a');
      const calls: HeldCall[] = [];
      const started = { count: 0 };
      const sweepCall = async (): Promise<void> => {
        started.count += 1;
        const call = held();
        calls.push(call);
        await call.promise;
      };
      for (let index = 0; index < sweepIoConcurrency + 5; index += 1) {
        void scheduler.runSweep('root-a', sweepCall);
      }
      await drain();
      expect(started.count).toBe(sweepIoConcurrency);
      expect(scheduler.sweepInFlight()).toBe(sweepIoConcurrency);

      calls[0]!.settle();
      await drain();
      expect(started.count).toBe(sweepIoConcurrency + 1);
      settleInteractive();
    });

    it('should count sweep calls as interactive, so background work yields to a sweep a person waits on', async () => {
      const sweepCall = held();
      void scheduler.runSweep('root-a', async () => sweepCall.promise);
      await drain();
      const started = { count: 0 };
      void issueBackground([], started);
      await drain();
      expect(started.count).toBe(0);

      sweepCall.settle();
      await drain();
      expect(started.count).toBe(1);
      expect(scheduler.interactiveInFlight()).toBe(0);
    });
  });

  it('should free the slot of a call that throws before it returns a promise', async () => {
    await expect(
      scheduler.runBackground(() => {
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');
    expect(scheduler.backgroundInFlight()).toBe(0);
    const started = { count: 0 };
    void issueBackground([], started);
    await drain();
    expect(started.count).toBe(1);
  });
});

describe('ProviderRegistry lanes', () => {
  const scope = { backend: 'memory', storageRootKey: 'memory:io-lanes' } as const;

  it('should count each interactive call on a provider it made, and hand background callers a gated view', async () => {
    const registry = new ProviderRegistry();
    const provider = await registry.getProvider(scope);
    await provider.writeFile('a/one.txt', 'one');
    const background = await registry.getLaneProvider(scope, 'background');
    expect(background).not.toBe(provider);
    expect(registry.inLane(provider, 'background')).toBe(background);
    expect(registry.inLane(provider, 'interactive')).toBe(provider);

    const counts: number[] = [];
    const settle = registry.ioScheduler.beginInteractive('elsewhere');
    const backgroundRead = background.readFile('a/one.txt', 'utf8');
    const interactiveRead = (async () => {
      const text = await provider.readFile('a/one.txt', 'utf8');
      counts.push(registry.ioScheduler.backgroundInFlight());
      return text;
    })();
    expect(registry.ioScheduler.interactiveInFlight(scope.storageRootKey)).toBe(1);
    expect(registry.ioScheduler.backgroundQueued()).toBe(1);

    await expect(interactiveRead).resolves.toBe('one');
    expect(counts).toEqual([0]);
    settle();
    await expect(backgroundRead).resolves.toBe('one');
    expect(registry.ioScheduler.interactiveInFlight()).toBe(0);
    registry.disposeAll();
  });

  it('should neither count nor gate the calls a gated call makes on its own provider', async () => {
    const registry = new ProviderRegistry();
    const provider = await registry.getProvider(scope);
    await provider.writeFile('b/two.txt', 'two');
    const background = registry.inLane(provider, 'background');
    let interactiveSeen = -1;
    const stat = provider.stat.bind(provider);
    /* `exists` answers through `this.stat`, the provider's own nested call. */
    const spy = vi.spyOn(provider, 'stat').mockImplementation(async (path) => {
      /* The registry's counting wrapper runs under the spy: had it counted this nested call, the count would be 1. */
      const answer = stat(path);
      interactiveSeen = registry.ioScheduler.interactiveInFlight();
      return answer;
    });

    await expect(background.exists('b/two.txt')).resolves.toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(interactiveSeen).toBe(0);
    registry.disposeAll();
  });

  it('should hear a gated write through the write tap, when the lane admits it', async () => {
    const registry = new ProviderRegistry();
    const tapped: string[][] = [];
    registry.setWriteTap((_root, paths) => {
      tapped.push([...paths]);
      return () => undefined;
    });
    await registry.getProvider(scope);
    const background = await registry.getLaneProvider(scope, 'background');

    await background.writeFile('c/three.txt', 'three');

    expect(tapped).toEqual([['c/three.txt']]);
    registry.disposeAll();
  });
});
