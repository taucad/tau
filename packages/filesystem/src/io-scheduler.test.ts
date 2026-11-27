import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IoScheduler,
  backgroundIoAgingMilliseconds,
  backgroundIoConcurrency,
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

    /* Major 2 (probe P2): a hung root never has more than four real calls outstanding. */
    it('should admit nothing new to a root with four stalled calls in flight, however long it hangs', async () => {
      const started = { count: 0 };
      const hangs = async (): Promise<void> => {
        started.count += 1;
        await never();
      };
      for (let index = 0; index < 64; index += 1) {
        void scheduler.runBackground('hung', hangs);
      }
      await drain();
      await vi.advanceTimersByTimeAsync(5 * 60_000);

      expect(started.count).toBe(backgroundIoConcurrency);
      expect(scheduler.backgroundStalled('hung')).toBe(backgroundIoConcurrency);
      expect(scheduler.backgroundInFlight()).toBe(0);
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
        expect(scheduler.backgroundStalled('flaky')).toBe(stalls + 1);
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
