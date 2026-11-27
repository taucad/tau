import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IoScheduler,
  backgroundIoAgingMilliseconds,
  backgroundIoConcurrency,
  ioMaxProbeMilliseconds,
  ioMaxStallMilliseconds,
  ioStallMilliseconds,
  sweepIoConcurrency,
} from '#io-scheduler.js';
import { ProviderRegistry } from '#provider-registry.js';
import { createWorkerTimings } from '#worker-timings.js';
import type { FileSystemProvider } from '#types.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
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

  /** Issue one background call on `root` that holds its slot until settled; `started` counts the admitted ones. */
  const issueBackgroundOn = async (root: string, calls: HeldCall[], started: { count: number }): Promise<void> =>
    scheduler.runBackground(root, async () => {
      started.count += 1;
      const call = held();
      calls.push(call);
      await call.promise;
    });

  /** Issue one background call that holds its slot until settled; `started` counts the admitted ones. */
  const issueBackground = async (calls: HeldCall[], started: { count: number }): Promise<void> =>
    scheduler.runBackground('root-b', async () => {
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
            await scheduler.runBackground('root-b', async () => {
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

  describe('stall deadline', () => {
    /** Issue one background call on `root` that never settles until the test settles it. */
    const hang = (root: string, calls: HeldCall[], started: { count: number }): void => {
      void scheduler.runBackground(root, async () => {
        started.count += 1;
        const call = held();
        calls.push(call);
        await call.promise;
      });
    };
    const stalledCount = (): number => timings.summarize(0).counters['io.background.stalled']?.total ?? 0;

    it(`should release the slots of calls hung past ${ioStallMilliseconds} ms, so another root's call is admitted`, async () => {
      const hung: HeldCall[] = [];
      const startedA = { count: 0 };
      for (let index = 0; index < backgroundIoConcurrency; index += 1) {
        hang('root-a', hung, startedA);
      }
      const home: HeldCall[] = [];
      const startedHome = { count: 0 };
      hang('home', home, startedHome);
      await drain();
      expect(startedA.count).toBe(backgroundIoConcurrency);
      expect(startedHome.count).toBe(0);

      await vi.advanceTimersByTimeAsync(ioStallMilliseconds - 1);
      expect(startedHome.count).toBe(0);
      expect(stalledCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(startedHome.count).toBe(1);
      expect(stalledCount()).toBe(backgroundIoConcurrency);
      expect(scheduler.backgroundStalled('root-a')).toBe(backgroundIoConcurrency);
      expect(scheduler.backgroundInFlight()).toBe(1);
      home[0]!.settle();
      await drain();
      expect(scheduler.backgroundInFlight()).toBe(0);
    });

    it('should let a root with stalled calls in flight claim one new slot at a time, while other roots use the rest', async () => {
      const hung: HeldCall[] = [];
      const startedA = { count: 0 };
      for (let index = 0; index < 2; index += 1) {
        hang('root-a', hung, startedA);
      }
      await drain();
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      expect(scheduler.backgroundStalled('root-a')).toBe(2);

      /* Root A asks again for many slots; another root asks for some too. */
      const moreA: HeldCall[] = [];
      const startedMoreA = { count: 0 };
      for (let index = 0; index < 6; index += 1) {
        hang('root-a', moreA, startedMoreA);
      }
      const other: HeldCall[] = [];
      const startedOther = { count: 0 };
      for (let index = 0; index < 5; index += 1) {
        hang('root-c', other, startedOther);
      }
      await drain();
      expect(startedMoreA.count).toBe(1);
      expect(startedOther.count).toBe(backgroundIoConcurrency - 1);
      expect(scheduler.backgroundInFlight()).toBe(backgroundIoConcurrency);

      /* A's new call settling admits A's next one, still one at a time while its stalled calls are in flight. */
      moreA[0]!.settle();
      await drain();
      expect(startedMoreA.count).toBe(2);
      other[0]!.settle();
      await drain();
      expect(startedMoreA.count).toBe(2);
      expect(startedOther.count).toBe(backgroundIoConcurrency);

      /* A's first new call settled in time, so its deadline is back to 5 s: the capped call stalls then, releases its
       * slot, and A claims only one more. */
      expect(scheduler.backgroundDeadline('root-a')).toBe(ioStallMilliseconds);
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      expect(scheduler.backgroundStalled('root-a')).toBe(3);
      expect(startedMoreA.count).toBe(3);
      expect(startedOther.count).toBe(5);

      /* That stall doubled A's deadline. At four stalled calls A claims none, whatever is free. */
      expect(scheduler.backgroundDeadline('root-a')).toBe(2 * ioStallMilliseconds);
      await vi.advanceTimersByTimeAsync(2 * ioStallMilliseconds);
      expect(scheduler.backgroundStalled('root-a')).toBe(backgroundIoConcurrency);
      for (const call of other) {
        call.settle();
      }
      await drain();
      expect(startedMoreA.count).toBe(3);
      expect(scheduler.backgroundInFlight()).toBe(0);
      expect(scheduler.backgroundQueued()).toBe(3);

      /* One stalled call settling lets A claim one again. */
      hung[0]!.settle();
      await drain();
      expect(startedMoreA.count).toBe(4);
    });

    it('should keep the accounting whole when stalled calls settle at last, and lift the cap once none is in flight', async () => {
      const hung: HeldCall[] = [];
      const startedA = { count: 0 };
      for (let index = 0; index < backgroundIoConcurrency; index += 1) {
        hang('root-a', hung, startedA);
      }
      await drain();
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      expect(scheduler.backgroundInFlight()).toBe(0);

      for (const call of hung) {
        call.settle();
      }
      await drain();
      expect(scheduler.backgroundInFlight()).toBe(0);
      expect(scheduler.backgroundStalled('root-a')).toBe(0);
      expect(scheduler.backgroundStalled()).toBe(0);

      /* A settled late is not released twice: the lane admits exactly four again, A's included. */
      const next: HeldCall[] = [];
      const startedNext = { count: 0 };
      for (let index = 0; index < backgroundIoConcurrency + 2; index += 1) {
        hang('root-a', next, startedNext);
      }
      await drain();
      expect(startedNext.count).toBe(backgroundIoConcurrency);
      expect(scheduler.backgroundInFlight()).toBe(backgroundIoConcurrency);
      for (const call of next.splice(0)) {
        call.settle();
      }
      await drain();
      for (const call of next) {
        call.settle();
      }
      await drain();
      expect(scheduler.backgroundInFlight()).toBe(0);
      expect(scheduler.backgroundQueued()).toBe(0);
    });

    it('should not hold an interactive call’s wait open behind a stalled call', async () => {
      const hung: HeldCall[] = [];
      hang('root-a', hung, { count: 0 });
      await drain();
      const settleInteractive = scheduler.beginInteractive('home');
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);

      expect(timings.summarize(0).spans['io.wait.interactive']).toMatchObject({
        count: 1,
        maxMilliseconds: ioStallMilliseconds,
      });
      settleInteractive();
      hung[0]!.settle();
    });
  });

  describe('review fixes (FW4 adversarial review)', () => {
    const never = async (): Promise<void> =>
      new Promise<void>(() => {
        /* Never settles. */
      });

    /* Major 1 (probe P1): a hung sweep releases its window slot and its interactive count at the deadline. */
    it('should release a hung sweep call’s window slot and interactive count at the deadline, and settle it late exactly once', async () => {
      const hung: HeldCall[] = [];
      for (let index = 0; index < sweepIoConcurrency; index += 1) {
        void scheduler.runSweep('folder', async () => {
          const call = held();
          hung.push(call);
          await call.promise;
        });
      }
      const ran = { sweep: false, background: false };
      void scheduler.runSweep('home', async () => {
        ran.sweep = true;
      });
      void scheduler.runBackground('home', async () => {
        ran.background = true;
      });
      await drain();
      expect(scheduler.sweepInFlight()).toBe(sweepIoConcurrency);
      expect(scheduler.interactiveInFlight()).toBe(sweepIoConcurrency);
      expect(ran).toEqual({ sweep: false, background: false });

      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      expect(ran.sweep).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(ran.background).toBe(true);
      expect(scheduler.sweepInFlight()).toBe(0);
      expect(scheduler.interactiveInFlight()).toBe(0);

      for (const call of hung) {
        call.settle();
      }
      await drain();
      expect(scheduler.sweepInFlight()).toBe(0);
      expect(scheduler.interactiveInFlight()).toBe(0);
      expect(scheduler.interactiveInFlight('folder')).toBe(0);
    });

    it('should reserve a sweep slot and count it as interactive in the same step', () => {
      void scheduler.runSweep('home', async () => undefined);

      expect(scheduler.sweepInFlight()).toBe(1);
      expect(scheduler.interactiveInFlight('home')).toBe(1);
    });

    /* Major 2 (probe P2): a hung root holds four stalled calls at most; with the re-review's abandonment, it is then
     * probed one call per longest deadline, never flooded. */
    it('should admit nothing new to a root with four stalled calls until they are abandoned, then one at a time', async () => {
      const started = { count: 0 };
      const hangs = async (): Promise<void> => {
        started.count += 1;
        await never();
      };
      for (let index = 0; index < 64; index += 1) {
        void scheduler.runBackground('hung', hangs);
      }
      await drain();
      /* Stalled at 5 s; nothing new until they are abandoned at 65 s. */
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds + ioMaxStallMilliseconds - 1);
      expect(started.count).toBe(backgroundIoConcurrency);
      expect(scheduler.backgroundStalled('hung')).toBe(backgroundIoConcurrency);
      expect(scheduler.backgroundInFlight()).toBe(0);

      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(started.count).toBeLessThanOrEqual(backgroundIoConcurrency + 5);
      expect(scheduler.backgroundStalled('hung')).toBeLessThanOrEqual(backgroundIoConcurrency);
      expect(scheduler.backgroundInFlight()).toBeLessThanOrEqual(1);
    });

    /* Major 2 (probe P2b): a slow live root stays within four counted and four stalled calls. */
    it('should keep a slow live root within four counted and four stalled calls, and the lane within four counted', async () => {
      const seen = { inFlight: 0, peak: 0, peakCounted: 0 };
      const slowly = async (): Promise<void> => {
        seen.inFlight += 1;
        seen.peak = Math.max(seen.peak, seen.inFlight);
        seen.peakCounted = Math.max(seen.peakCounted, scheduler.backgroundInFlight());
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 6000 * Math.max(1, seen.inFlight));
        });
        seen.inFlight -= 1;
      };
      for (let index = 0; index < 64; index += 1) {
        void scheduler.runBackground('slow', slowly);
      }
      for (let step = 0; step < 600; step += 1) {
        // oxlint-disable-next-line no-await-in-loop -- The clock moves a second at a time.
        await vi.advanceTimersByTimeAsync(1000);
        seen.peakCounted = Math.max(seen.peakCounted, scheduler.backgroundInFlight());
        expect(scheduler.backgroundStalled('slow')).toBeLessThanOrEqual(backgroundIoConcurrency);
      }

      expect(seen.peak).toBeLessThanOrEqual(2 * backgroundIoConcurrency);
      expect(seen.peakCounted).toBeLessThanOrEqual(backgroundIoConcurrency);
    });

    it('should double a root’s deadline while it keeps stalling, cap it, and reset it when a call settles in time', async () => {
      const calls: HeldCall[] = [];
      const issue = (): void => {
        void scheduler.runBackground('flaky', async () => {
          const call = held();
          calls.push(call);
          await call.promise;
        });
      };
      issue();
      await drain();
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      expect(scheduler.backgroundStalled('flaky')).toBe(1);

      /* The next call on the root has twice as long. */
      issue();
      await drain();
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      expect(scheduler.backgroundStalled('flaky')).toBe(1);
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      expect(scheduler.backgroundStalled('flaky')).toBe(2);

      /* It doubles up to the cap and no further. */
      let deadline = 4 * ioStallMilliseconds;
      for (let stalls = 2; stalls < backgroundIoConcurrency; stalls += 1) {
        issue();
        // oxlint-disable-next-line no-await-in-loop -- One stall after another.
        await drain();
        // oxlint-disable-next-line no-await-in-loop -- One stall after another.
        await vi.advanceTimersByTimeAsync(Math.min(deadline, ioMaxStallMilliseconds));
        /* Counted by the stall counter: the first stall is abandoned 60 s after it stalled, meanwhile (re-review B). */
        expect(timings.summarize(0).counters['io.background.stalled']?.total).toBe(stalls + 1);
        deadline *= 2;
      }
      expect(scheduler.backgroundDeadline('flaky')).toBe(Math.min(deadline, ioMaxStallMilliseconds));

      /* The stalled calls settle late, then one settles in time: the deadline is back to the start. */
      for (const call of calls.splice(0)) {
        call.settle();
      }
      await drain();
      issue();
      await drain();
      calls[0]!.settle();
      await drain();
      expect(scheduler.backgroundDeadline('flaky')).toBe(ioStallMilliseconds);
      expect(scheduler.backgroundStalled()).toBe(0);
      expect(scheduler.backgroundInFlight()).toBe(0);
    });

    /* Major 3: an operation that has waited past aging stays admitted. */
    it('should age an operation once, so its later calls are admitted behind interactive calls without waiting again', async () => {
      const settleInteractive = scheduler.beginInteractive('home');
      const operation = scheduler.operation();
      const admittedAt: number[] = [];
      const startedAt = Date.now();
      const step = async (): Promise<void> =>
        scheduler.runBackground(
          'folder',
          async () => {
            admittedAt.push(Date.now() - startedAt);
          },
          operation,
        );
      const walk = (async () => {
        for (let index = 0; index < 5; index += 1) {
          // oxlint-disable-next-line no-await-in-loop -- A walk's calls are serial.
          await step();
        }
      })();
      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds);
      await walk;
      expect(admittedAt).toEqual([250, 250, 250, 250, 250]);

      /* Another operation still yields first. */
      let other = -1;
      void scheduler.runBackground(
        'folder',
        async () => {
          other = Date.now() - startedAt;
        },
        scheduler.operation(),
      );
      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds);
      expect(other).toBe(2 * backgroundIoAgingMilliseconds);
      settleInteractive();
    });

    it('should admit a promoted operation without aging, within the limit', async () => {
      const settleInteractive = scheduler.beginInteractive('home');
      let ran = false;
      void scheduler.runBackground(
        'folder',
        async () => {
          ran = true;
        },
        scheduler.operation({ promoted: true }),
      );
      await drain();
      expect(ran).toBe(true);
      settleInteractive();
    });

    /* Major 3: a never-settling interactive call stops counting at the deadline. */
    it('should stop counting an interactive call at the deadline, and settle it late exactly once', async () => {
      const settleHung = scheduler.beginInteractive('home');
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      expect(scheduler.interactiveInFlight()).toBe(0);

      let admitted = -1;
      const startedAt = Date.now();
      void scheduler.runBackground('folder', async () => {
        admitted = Date.now() - startedAt;
      });
      await drain();
      expect(admitted).toBe(0);

      settleHung();
      settleHung();
      expect(scheduler.interactiveInFlight()).toBe(0);
      expect(scheduler.interactiveInFlight('home')).toBe(0);
      const settleNext = scheduler.beginInteractive('home');
      expect(scheduler.interactiveInFlight('home')).toBe(1);
      settleNext();
      expect(scheduler.interactiveInFlight()).toBe(0);
    });

    /* Minor 10: a closed connection's queued calls are cancelled. */
    it('should reject the queued calls of an operation whose signal aborts, and admit none of them', async () => {
      const settleInteractive = scheduler.beginInteractive('home');
      const closed = new AbortController();
      const operation = scheduler.operation({ signal: closed.signal });
      let ran = 0;
      const queued = [1, 2, 3].map(async () =>
        scheduler.runBackground(
          'folder',
          async () => {
            ran += 1;
          },
          operation,
        ),
      );
      await drain();
      expect(scheduler.backgroundQueued()).toBe(3);

      closed.abort();
      for (const call of queued) {
        // oxlint-disable-next-line no-await-in-loop -- Each rejection in turn.
        await expect(call).rejects.toMatchObject({ name: 'AbortError' });
      }
      expect(scheduler.backgroundQueued()).toBe(0);
      await expect(scheduler.runBackground('folder', async () => undefined, operation)).rejects.toMatchObject({
        name: 'AbortError',
      });
      settleInteractive();
      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds);
      expect(ran).toBe(0);
    });

    /* Minor 10: dispose stops every timer. */
    it('should clear its stall timers and arm no aging timer once disposed', async () => {
      void scheduler.runBackground('folder', never);
      void scheduler.runSweep('folder', never);
      const settleInteractive = scheduler.beginInteractive('home');
      void scheduler.runBackground('home', async () => undefined);
      await drain();
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      scheduler.dispose();
      expect(vi.getTimerCount()).toBe(0);
      settleInteractive();
      await drain();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('re-review fixes (FW4 re-review)', () => {
    const neverSettles = async (): Promise<void> =>
      new Promise<void>(() => {
        /* Never settles. */
      });

    /* A (probe N1): waiting on a full lane is not waiting behind interactive calls, and ages nothing. */
    it('should not age an operation that only waited on a full lane, so it yields to an interactive call that comes later', async () => {
      const operation = scheduler.operation();
      const calls: HeldCall[] = [];
      const started = { count: 0 };
      const step = async (): Promise<void> => {
        started.count += 1;
        const call = held();
        calls.push(call);
        await call.promise;
      };
      for (let index = 0; index < 64; index += 1) {
        void scheduler.runBackground('home', step, operation);
      }
      await drain();
      await vi.advanceTimersByTimeAsync(300);
      expect(operation.blockedSince).toBeUndefined();

      const settleInteractive = scheduler.beginInteractive('home');
      for (const call of calls.splice(0)) {
        call.settle();
      }
      await drain();
      expect(started.count).toBe(backgroundIoConcurrency);
      expect(scheduler.backgroundInFlight()).toBe(0);

      /* Held behind the interactive call now: it ages from here. */
      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds - 1);
      expect(started.count).toBe(backgroundIoConcurrency);
      await vi.advanceTimersByTimeAsync(1);
      expect(started.count).toBe(2 * backgroundIoConcurrency);
      settleInteractive();
    });

    /* A (probe N1b): an operation's aging ends once it runs with no interactive call counted. */
    it('should yield again after an operation that aged once was admitted with no interactive call in flight', async () => {
      const operation = scheduler.operation();
      const admitted: number[] = [];
      const startedAt = Date.now();
      const record = async (): Promise<void> => {
        admitted.push(Date.now() - startedAt);
      };
      const first = scheduler.beginInteractive('home');
      const aged = scheduler.runBackground('home', record, operation);
      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds);
      await aged;
      first();
      /* A quiet period: the operation runs with nothing interactive in flight, which ends its aging. */
      await scheduler.runBackground('home', record, operation);
      expect(operation.blockedSince).toBeUndefined();
      await vi.advanceTimersByTimeAsync(3000);

      const second = scheduler.beginInteractive('home');
      void scheduler.runBackground('home', record, operation);
      await drain();
      expect(admitted).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds);
      expect(admitted).toHaveLength(3);
      second();
    });

    it('should age a call of no operation only from when an interactive call holds it back', async () => {
      const calls: HeldCall[] = [];
      const started = { count: 0 };
      for (let index = 0; index < backgroundIoConcurrency + 1; index += 1) {
        void issueBackground(calls, started);
      }
      await drain();
      await vi.advanceTimersByTimeAsync(300);
      const settleInteractive = scheduler.beginInteractive('home');
      calls[0]!.settle();
      await drain();
      expect(started.count).toBe(backgroundIoConcurrency);
      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds);
      expect(started.count).toBe(backgroundIoConcurrency + 1);
      settleInteractive();
    });

    /* B (probe N2): a forgotten root starts afresh; its queued calls are cancelled and its old calls settle late. */
    it('should forget a root: cancel its queued calls, drop its stalled accounting, and keep late settles exact', async () => {
      const hung: HeldCall[] = [];
      for (let index = 0; index < backgroundIoConcurrency; index += 1) {
        void scheduler.runBackground('folder', async () => {
          const call = held();
          hung.push(call);
          await call.promise;
        });
      }
      await drain();
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      const queued = scheduler.runBackground('folder', async () => 'old');
      await drain();
      expect(scheduler.backgroundStalled('folder')).toBe(backgroundIoConcurrency);

      scheduler.forgetRoot('folder');
      await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
      expect(scheduler.backgroundStalled('folder')).toBe(0);
      expect(scheduler.backgroundDeadline('folder')).toBe(ioStallMilliseconds);

      /* The folder reconnected under the same key: its calls run at once. */
      const ran = { count: 0 };
      const answers = async (): Promise<void> => {
        ran.count += 1;
      };
      for (let index = 0; index < 8; index += 1) {
        void scheduler.runBackground('folder', answers);
      }
      await drain();
      expect(ran.count).toBe(8);
      for (const call of hung) {
        call.settle();
      }
      await drain();
      expect(scheduler.backgroundStalled()).toBe(0);
      expect(scheduler.backgroundInFlight()).toBe(0);
      expect(scheduler.backgroundDeadline('folder')).toBe(ioStallMilliseconds);
    });

    /* B: a root still configured whose calls never settle is probed about once a minute, and recovers. */
    it('should give a root whose calls hang forever about one call per cap interval, and recover when they settle', async () => {
      const mode = { hang: true };
      const started = { count: 0, settled: 0 };
      const probe = async (): Promise<void> => {
        started.count += 1;
        if (mode.hang) {
          await neverSettles();
        }
        started.settled += 1;
      };
      for (let index = 0; index < 100; index += 1) {
        void scheduler.runBackground('folder', probe);
      }
      await drain();
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      /* Four at once, then probes once their stalls are abandoned, backing off from 60 s (at 65, 125, 245 and 485 s):
       * never zero, never a flood. */
      expect(started.count).toBeGreaterThanOrEqual(backgroundIoConcurrency + 3);
      expect(started.count).toBeLessThanOrEqual(backgroundIoConcurrency + 5);
      expect(scheduler.backgroundStalled('folder')).toBeLessThanOrEqual(backgroundIoConcurrency);

      const hung = started.count;
      mode.hang = false;
      await vi.advanceTimersByTimeAsync(ioMaxProbeMilliseconds + ioMaxStallMilliseconds);
      /* Every call left runs and settles; only the hung ones never do. */
      expect(started.count).toBe(100);
      expect(started.settled).toBe(100 - hung);
      expect(scheduler.backgroundQueued()).toBe(0);
      expect(scheduler.backgroundDeadline('folder')).toBe(ioStallMilliseconds);
    });

    it('should never let a root with calls hung forever starve the lane for another root', async () => {
      for (let index = 0; index < 64; index += 1) {
        void scheduler.runBackground('hung', neverSettles);
      }
      await drain();
      await vi.advanceTimersByTimeAsync(60 * 60_000);
      let other = false;
      void scheduler.runBackground('home', async () => {
        other = true;
      });
      await drain();
      expect(other).toBe(true);
      expect(scheduler.backgroundInFlight()).toBeLessThanOrEqual(1);
    });
  });

  describe('re-verification fixes (FW4 E, G, mutants, probe back-off)', () => {
    const neverSettles = async (): Promise<void> =>
      new Promise<void>(() => {
        /* Never settles. */
      });

    /* E (probe N6): a call admitted in the same tick as its root is forgotten releases into the lane that admitted it. */
    it('should release a call admitted just before its root was forgotten into that lane, not into the next one', async () => {
      const admittedThenForgotten = scheduler.runBackground('folder', async () => undefined);
      scheduler.forgetRoot('folder');
      await admittedThenForgotten;

      /* One hung call stalls; the root, counted at zero, is then admitted its next call. */
      void scheduler.runBackground('folder', neverSettles);
      await drain();
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      expect(scheduler.backgroundStalled('folder')).toBe(1);
      let ran = false;
      void scheduler.runBackground('folder', async () => {
        ran = true;
      });
      await drain();
      expect(ran).toBe(true);
    });

    /* Mutant at the abandoned generation check: a late abandoned settle never drives `abandoned` below zero. */
    it('should not let an abandoned call that settles after a timely one leave its root capped', async () => {
      const hung: HeldCall[] = [];
      const hang = async (): Promise<void> => {
        const call = held();
        hung.push(call);
        await call.promise;
      };
      /* A stalls at 5 s and is abandoned at 65 s; B, admitted then, stalls 10 s later and keeps the lane alive. */
      void scheduler.runBackground('folder', hang);
      await drain();
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds + ioMaxStallMilliseconds);
      void scheduler.runBackground('folder', hang);
      await drain();
      await vi.advanceTimersByTimeAsync(2 * ioStallMilliseconds);
      expect(scheduler.backgroundStalled('folder')).toBe(1);
      /* A timely call clears what was abandoned; it is the root's next probe, 60 s after B's (65 s). */
      const timely = scheduler.runBackground('folder', async () => undefined);
      await vi.advanceTimersByTimeAsync(ioMaxStallMilliseconds - 2 * ioStallMilliseconds);
      await timely;
      expect(scheduler.backgroundStalled('folder')).toBe(1);
      /* A, then B, settle late. */
      hung[0]!.settle();
      await drain();
      hung[1]!.settle();
      await drain();

      const started = { count: 0 };
      for (let index = 0; index < backgroundIoConcurrency; index += 1) {
        void issueBackgroundOn('folder', [], started);
      }
      await drain();
      expect(started.count).toBe(backgroundIoConcurrency);
    });

    /* Mutant at the lane identity in `_dropRoot`: a dropped lane's settle never removes its replacement. */
    it('should keep a forgotten root’s new lane when a call of its old lane settles', async () => {
      const old: HeldCall[] = [];
      void scheduler.runBackground('folder', async () => {
        const call = held();
        old.push(call);
        await call.promise;
      });
      await drain();
      scheduler.forgetRoot('folder');
      for (let index = 0; index < backgroundIoConcurrency - 1; index += 1) {
        void scheduler.runBackground('folder', neverSettles);
      }
      await drain();

      /* The old lane's call settles in time, before anything stalls: only the old lane is done with. */
      await vi.advanceTimersByTimeAsync(1000);
      old[0]!.settle();
      await drain();
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds - 1000);
      expect(scheduler.backgroundStalled('folder')).toBe(backgroundIoConcurrency - 1);
      expect(scheduler.backgroundDeadline('folder')).toBe(2 ** (backgroundIoConcurrency - 1) * ioStallMilliseconds);
    });

    /* G (probe N1b): an operation's aging from before a quiet period does not carry over it. */
    it('should restart an operation’s aging after a quiet period in which it made no call', async () => {
      const operation = scheduler.operation();
      const admitted: number[] = [];
      const startedAt = Date.now();
      const record = async (): Promise<void> => {
        admitted.push(Date.now() - startedAt);
      };
      /* Held back, then admitted by aging while the interactive call is still in flight: its aging stands. */
      const first = scheduler.beginInteractive('home');
      const waiting = scheduler.runBackground('home', record, operation);
      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds);
      await waiting;
      first();
      expect(operation.blockedSince).toBeDefined();
      /* A quiet period with no call of the operation. */
      await vi.advanceTimersByTimeAsync(3000);

      const second = scheduler.beginInteractive('home');
      void scheduler.runBackground('home', record, operation);
      await drain();
      expect(admitted).toEqual([backgroundIoAgingMilliseconds]);
      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds - 1);
      expect(admitted).toEqual([backgroundIoAgingMilliseconds]);
      await vi.advanceTimersByTimeAsync(1);
      expect(admitted).toEqual([backgroundIoAgingMilliseconds, 3000 + 2 * backgroundIoAgingMilliseconds]);
      second();
    });

    /* G, same millisecond: a quiet moment just before a new hold does not make that hold stale. */
    it('should age a call held right after a quiet moment in the same millisecond in one aging wait', async () => {
      scheduler.beginInteractive('home')();
      const settleInteractive = scheduler.beginInteractive('home');
      let admittedAt = -1;
      const startedAt = Date.now();
      void scheduler.runBackground('home', async () => {
        admittedAt = Date.now() - startedAt;
      });
      await vi.advanceTimersByTimeAsync(2 * backgroundIoAgingMilliseconds);
      expect(admittedAt).toBe(backgroundIoAgingMilliseconds);
      settleInteractive();
    });

    /* Nit: a root whose calls hang forever is probed less and less often, at most every 10 minutes. */
    it('should back off the probes of a root whose calls hang forever, and reset when one settles in time', async () => {
      const mode = { hang: true };
      const startedAt: number[] = [];
      const origin = Date.now();
      const probe = async (): Promise<void> => {
        startedAt.push(Date.now() - origin);
        if (mode.hang) {
          await neverSettles();
        }
      };
      for (let index = 0; index < 100; index += 1) {
        void scheduler.runBackground('folder', probe);
      }
      await drain();
      await vi.advanceTimersByTimeAsync(60 * 60_000);
      const probes = startedAt.slice(backgroundIoConcurrency);
      const gaps = probes.slice(1).map((at, index) => at - probes[index]!);
      expect(gaps.length).toBeGreaterThanOrEqual(3);
      for (const [index, gap] of gaps.entries()) {
        expect(gap).toBeGreaterThanOrEqual(
          index === 0 ? ioMaxStallMilliseconds : Math.min(gaps[index - 1]!, ioMaxProbeMilliseconds),
        );
        expect(gap).toBeLessThanOrEqual(ioMaxProbeMilliseconds + ioMaxStallMilliseconds);
      }
      expect(gaps.at(-1)).toBeGreaterThanOrEqual(ioMaxProbeMilliseconds);

      mode.hang = false;
      await vi.advanceTimersByTimeAsync(ioMaxProbeMilliseconds + ioMaxStallMilliseconds);
      expect(startedAt).toHaveLength(100);
      expect(scheduler.backgroundDeadline('folder')).toBe(ioStallMilliseconds);
    });
  });

  it('should free the slot of a call that throws before it returns a promise', async () => {
    await expect(
      scheduler.runBackground('root-b', () => {
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
    const stat = Reflect.get(
      Object.getPrototypeOf(provider) as Record<string, unknown>,
      'stat',
    ) as FileSystemProvider['stat'];
    /* `exists` answers through `this.stat`, the provider's own nested call. */
    const spy = vi.spyOn(provider, 'stat').mockImplementation(async function (this: FileSystemProvider, path) {
      /* Had the nested call been counted, the count would be 1 here. */
      interactiveSeen = registry.ioScheduler.interactiveInFlight();
      return stat.call(this, path);
    });

    await expect(background.exists('b/two.txt')).resolves.toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(interactiveSeen).toBe(0);
    registry.disposeAll();
  });

  /* Minor 5 (probe P3): a provider's own calls on itself are never counted, after an await as much as before. */
  it('should not count a gated call’s nested async calls on its own provider as interactive', async () => {
    const registry = new ProviderRegistry();
    const provider = await registry.getProvider(scope);
    await provider.writeFile('d/four.txt', 'four');
    const seen: number[] = [];
    /* A read that answers through `this` after an await, as the node client's `readdirWithStats` stats each row. */
    vi.spyOn(provider, 'readdir').mockImplementation(async function (this: FileSystemProvider, path: string) {
      await Promise.resolve();
      const head = await this.stat(`${path}/four.txt`);
      seen.push(registry.ioScheduler.interactiveInFlight());
      return head.type === 'file' ? ['four.txt'] : [];
    });

    await expect(registry.inLane(provider, 'background').readdir('d')).resolves.toEqual(['four.txt']);
    expect(seen).toEqual([0]);
    /* The same call made interactively counts once, itself. */
    await provider.readdir('d');
    expect(seen).toEqual([0, 1]);
    expect(provider.readdir).toHaveBeenCalledTimes(2);
    registry.disposeAll();
  });

  /* Minor 4 (probe P5): a write through a background view is never deferred; it counts as interactive. */
  it('should make a write through a background view at once, counted as interactive, while reads wait', async () => {
    vi.useFakeTimers();
    try {
      const registry = new ProviderRegistry();
      const provider = await registry.getProvider(scope);
      const tapped: number[] = [];
      const startedAt = Date.now();
      registry.setWriteTap(() => {
        tapped.push(Date.now() - startedAt);
        return () => undefined;
      });
      const background = registry.inLane(provider, 'background');
      const settle = registry.ioScheduler.beginInteractive('x');

      const write = background.writeFile('e/five.txt', 'five');
      expect(registry.ioScheduler.interactiveInFlight(scope.storageRootKey)).toBe(1);
      await write;
      expect(tapped).toEqual([0]);
      let read: string | undefined;
      const reading = (async () => {
        read = await background.readFile('e/five.txt', 'utf8');
      })();
      await vi.advanceTimersByTimeAsync(backgroundIoAgingMilliseconds - 1);
      expect(read).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await reading;
      expect(read).toBe('five');
      settle();
      registry.disposeAll();
    } finally {
      vi.useRealTimers();
    }
  });

  /* Review nit: a background view's stream opens once the lane admits it; its chunks are then pulled unranked. */
  it('should open a stream through a background view only once the lane admits it', async () => {
    const registry = new ProviderRegistry();
    /* A picked folder's provider streams its reads; the memory provider does not. */
    const provider = await registry.getProvider({
      backend: 'webaccess',
      directoryHandle: createMockRootHandle() as unknown as FileSystemDirectoryHandle,
      workspaceId: '',
    });
    await provider.writeFile('f/six.txt', 'six');
    const background = registry.inLane(provider, 'background');
    const settle = registry.ioScheduler.beginInteractive('x');
    const stream = background.readFileStream!('f/six.txt');
    const reading = new Response(stream).text();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(registry.ioScheduler.backgroundQueued()).toBe(1);

    settle();
    await expect(reading).resolves.toBe('six');
    expect(registry.ioScheduler.backgroundQueued()).toBe(0);
    registry.disposeAll();
  });

  /* Re-review D: a stream cancelled while its open waits for the lane leaves no reader open. */
  it('should cancel the stream a background view opens after its reader cancelled it while queued', async () => {
    const registry = new ProviderRegistry();
    const provider = await registry.getProvider({
      backend: 'webaccess',
      directoryHandle: createMockRootHandle() as unknown as FileSystemDirectoryHandle,
      workspaceId: '',
    });
    await provider.writeFile('g/seven.txt', 'seven');
    const opened = { count: 0, cancelled: 0 };
    const readFileStream = Reflect.get(
      Object.getPrototypeOf(provider) as Record<string, unknown>,
      'readFileStream',
    ) as NonNullable<FileSystemProvider['readFileStream']>;
    Object.defineProperty(provider, 'readFileStream', {
      configurable: true,
      writable: true,
      value(this: FileSystemProvider, path: string): ReadableStream<Uint8Array<ArrayBuffer>> {
        opened.count += 1;
        const reader = readFileStream.call(this, path).getReader();
        return new ReadableStream<Uint8Array<ArrayBuffer>>({
          async pull(controller) {
            const chunk = await reader.read();
            if (chunk.done) {
              controller.close();
            } else {
              controller.enqueue(chunk.value);
            }
          },
          async cancel(reason) {
            opened.cancelled += 1;
            await reader.cancel(reason);
          },
        });
      },
    });
    const background = registry.inLane(provider, 'background');
    const settle = registry.ioScheduler.beginInteractive('x');
    const stream = background.readFileStream!('g/seven.txt');
    const reader = stream.getReader();
    const pending = reader.read();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(registry.ioScheduler.backgroundQueued()).toBe(1);

    await reader.cancel('gone');
    settle();
    await expect(pending).resolves.toMatchObject({ done: true });
    await vi.waitFor(() => {
      expect(opened).toEqual({ count: 1, cancelled: 1 });
    });
    registry.disposeAll();
  });

  /* Re-review B (probe N2): a root disposed and reconnected under the same key starts its lane afresh. */
  it('should list a reconnected root whose old calls hung, once its provider was disposed', async () => {
    vi.useFakeTimers();
    try {
      const registry = new ProviderRegistry();
      const folder = { backend: 'memory', storageRootKey: 'memory:reconnected' } as const;
      const lost = await registry.getProvider(folder);
      Object.defineProperty(lost, 'readdir', {
        configurable: true,
        writable: true,
        value: async (): Promise<string[]> =>
          new Promise<string[]>(() => {
            /* The folder went away mid-call: this never answers. */
          }),
      });
      const background = registry.inLane(lost, 'background');
      for (let index = 0; index < backgroundIoConcurrency; index += 1) {
        void background.readdir('');
      }
      const queued = background.readdir('');
      await vi.advanceTimersByTimeAsync(ioStallMilliseconds);
      expect(registry.ioScheduler.backgroundStalled(folder.storageRootKey)).toBe(backgroundIoConcurrency);

      registry.disposeRoot(folder.storageRootKey);
      await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
      const reconnected = await registry.getProvider(folder);
      await reconnected.mkdir('listed');
      await expect(registry.inLane(reconnected, 'background').readdir('')).resolves.toEqual(['listed']);
      registry.disposeAll();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should forward a property set on a lane view to the provider', async () => {
    const registry = new ProviderRegistry();
    const provider = await registry.getProvider(scope);
    const background = registry.inLane(provider, 'background') as FileSystemProvider & { marker?: string };

    background.marker = 'set';

    expect((provider as FileSystemProvider & { marker?: string }).marker).toBe('set');
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
