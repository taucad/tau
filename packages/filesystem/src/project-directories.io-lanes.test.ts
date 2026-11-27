// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDiscoveryProfile,
  discoveryProfileHomeId,
  operatorDiscoveryProfile,
} from '#testing/discovery-profile.js';
import type { DiscoveryProfile } from '#testing/discovery-profile.js';
import {
  backgroundIoAgingMilliseconds,
  backgroundIoConcurrency,
  backgroundIoStallMilliseconds,
  sweepIoConcurrency,
} from '#io-scheduler.js';
import { resolveStorageRootKey } from '#storage-root-key.js';
import { workerTimings } from '#worker-timings.js';

/**
 * The I/O lanes on the 386-directory profile (project-library fast path FW4, invariant S10).
 *
 * Every provider read the fixture's two roots make goes through `readFileRaw`, the method `readFile` answers with on
 * the File System Access family. The tests hold or delay it there, below the registry's count of interactive calls and
 * below the lane's admission, so an interactive call is counted while it is held and a background call holds its slot.
 */

/** A discovery read: a project directory's manifest or identity record. */
const isDiscoveryRead = (path: string): boolean => /(?:^|\/)(?:tau\.json|\.tau\/project\.json)$/u.test(path);

const interactivePath = 'home-000/notes.txt';
const homeProjectId = discoveryProfileHomeId(0);
const directories = operatorDiscoveryProfile.home + operatorDiscoveryProfile.workspace;

type Gate = Readonly<{ path: string; release: () => void }>;

type RawReader = { readFileRaw: (path: string) => Promise<Uint8Array<ArrayBuffer>> };

/**
 * Replace each root's `readFileRaw` for this test: `around` decides, per read, what happens before the read is made.
 *
 * @param profile - The fixture.
 * @param around - Called with each read's path; the read is made once it settles.
 */
const aroundReads = (profile: DiscoveryProfile, around: (path: string) => Promise<void>): void => {
  for (const provider of [profile.providers.home, profile.providers.workspace]) {
    const reader = provider as unknown as RawReader;
    const raw = reader.readFileRaw.bind(provider);
    vi.spyOn(reader, 'readFileRaw').mockImplementation(async (path) => {
      await around(path);
      return raw(path);
    });
  }
};

/** Let every continuation that needs no time run. */
const flush = async (): Promise<void> => {
  for (let round = 0; round < 40; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each round lets the continuations of the last one run.
    await vi.advanceTimersByTimeAsync(0);
  }
};

/** Advance the fake clock a step at a time until `done` holds or `limit` passes; how long it took. */
const advanceUntil = async (done: () => boolean, limit: number, step = 10): Promise<number> => {
  let elapsed = 0;
  while (!done() && elapsed < limit) {
    // oxlint-disable-next-line no-await-in-loop -- The clock moves one step at a time.
    await vi.advanceTimersByTimeAsync(step);
    elapsed += step;
  }
  return elapsed;
};

/** A promise's outcome, read without awaiting it; `done` tracks it and never rejects. */
type Tracked<Result> = Readonly<{ settled: () => boolean; value: () => Result | undefined; done: Promise<void> }>;

/**
 * Track a promise's outcome without awaiting it.
 *
 * @param promise - The promise.
 * @param onSettled - Called once it settles, before anything awaiting it later resumes.
 * @returns Its outcome so far.
 */
const track = <Result>(promise: Promise<Result>, onSettled?: () => void): Tracked<Result> => {
  let settled = false;
  let value: Result | undefined;
  const watch = async (): Promise<void> => {
    try {
      value = await promise;
    } catch {
      /* Settled without a value is all a test reads. */
    } finally {
      settled = true;
      onSettled?.();
    }
  };
  const done = watch();
  return { settled: () => settled, value: () => value, done };
};

describe('I/O lanes on the 386-directory profile', () => {
  let profile: DiscoveryProfile;

  /* A fresh profile per test: its lanes, index and handle caches are its own (shuffled burn-in). */
  beforeEach(async () => {
    profile = await createDiscoveryProfile();
    await profile.writeBehind('home', interactivePath, new TextEncoder().encode('notes'));
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    profile.dispose();
  });

  it('should keep at most four background calls outstanding when an interactive read is issued during a full read, and admit none until it settles', async () => {
    const held: Gate[] = [];
    let holdDiscovery = true;
    let interactiveGate: Gate | undefined;
    aroundReads(profile, async (path) => {
      if (path === interactivePath || (holdDiscovery && isDiscoveryRead(path))) {
        const { promise, resolve } = Promise.withResolvers<void>();
        const gate = { path, release: resolve };
        if (path === interactivePath) {
          interactiveGate = gate;
        } else {
          held.push(gate);
        }
        await promise;
      }
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

    /* The first pass of a fresh profile reads both roots in full: background work. */
    const pass = track(profile.service.listProjectManifests());
    await flush();
    expect(held).toHaveLength(backgroundIoConcurrency);
    expect(profile.ioScheduler.backgroundInFlight()).toBe(backgroundIoConcurrency);
    expect(profile.ioScheduler.backgroundQueued()).toBeGreaterThan(0);

    /* The interactive read is issued at once, counted, and held in flight. */
    const read = track(profile.service.readFile(`/projects/${homeProjectId}/notes.txt`, 'utf8'));
    await flush();
    expect(interactiveGate?.path).toBe(interactivePath);
    expect(profile.ioScheduler.interactiveInFlight()).toBe(1);
    expect(profile.ioScheduler.backgroundInFlight()).toBeLessThanOrEqual(backgroundIoConcurrency);

    /* The background calls already issued finish; no other is admitted while the interactive read is in flight. */
    for (const gate of held.splice(0)) {
      gate.release();
    }
    await flush();
    expect(held).toHaveLength(0);
    expect(profile.ioScheduler.backgroundInFlight()).toBe(0);
    expect(profile.ioScheduler.backgroundQueued()).toBeGreaterThan(0);

    interactiveGate!.release();
    await flush();
    expect(read.value()).toBe('notes');
    expect(held).toHaveLength(backgroundIoConcurrency);

    holdDiscovery = false;
    for (const gate of held.splice(0)) {
      gate.release();
    }
    await advanceUntil(pass.settled, 1000);
    expect(pass.value()?.entries).toHaveLength(directories);
    expect(pass.value()?.roots.map((root) => root.status)).toEqual(['complete', 'complete']);
  });

  it('should bound an interactive read issued during a full read by the few background calls ahead of it on a serial disk', async () => {
    /* One disk serves both roots a call at a time, 4 ms each, as the browser's file backend serves the worker. */
    const perCall = 4;
    let disk = Promise.resolve();
    aroundReads(profile, async () => {
      const ahead = disk;
      const turn = (async () => {
        await ahead;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, perCall);
        });
      })();
      disk = turn;
      await turn;
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

    const pass = track(profile.service.listProjectManifests());
    await advanceUntil(() => profile.ioScheduler.backgroundInFlight() === backgroundIoConcurrency, 100, 1);
    await vi.advanceTimersByTimeAsync(37);
    expect(pass.settled()).toBe(false);

    const issuedAt = Date.now();
    const read = track(profile.service.readFile(`/projects/${homeProjectId}/notes.txt`, 'utf8'));
    const took = await advanceUntil(read.settled, 1000, 1);
    expect(read.value()).toBe('notes');
    expect(Date.now() - issuedAt).toBe(took);
    /* Behind at most the four admitted calls, then its own: unranked, it would queue behind 128 read chains. */
    expect(took).toBeLessThanOrEqual((backgroundIoConcurrency + 1) * perCall);

    await advanceUntil(pass.settled, 60_000);
    expect(pass.value()?.entries).toHaveLength(directories);
  });

  it('should complete a background pass under steady interactive load', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    /* Interactive reads overlap so that one is always in flight: each held 100 ms, the next issued every 50 ms. */
    aroundReads(profile, async (path) => {
      if (path === interactivePath) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });
      }
    });
    const loading = { on: true };
    const reads: Array<Promise<unknown>> = [];
    const load = async (): Promise<void> => {
      while (loading.on) {
        reads.push(profile.service.readFile(`/projects/${homeProjectId}/notes.txt`, 'utf8'));
        // oxlint-disable-next-line no-await-in-loop -- The load is a sequence of overlapping reads.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });
      }
    };
    void load();
    await flush();
    expect(profile.ioScheduler.interactiveInFlight()).toBeGreaterThan(0);

    const pass = track(profile.service.listProjectManifests());
    let loadedThroughout = true;
    const took = await advanceUntil(() => {
      loadedThroughout &&= pass.settled() || profile.ioScheduler.interactiveInFlight() > 0;
      return pass.settled();
    }, 60_000);

    expect(pass.value()?.entries).toHaveLength(directories);
    expect(loadedThroughout).toBe(true);
    /* Each wave of queued reads ages once and then runs four at a time: never starved, though never ahead. */
    expect(took).toBeGreaterThanOrEqual(backgroundIoAgingMilliseconds);
    loading.on = false;
    await advanceUntil(() => profile.ioScheduler.interactiveInFlight() === 0, 1000);
    await Promise.all(reads);
  });

  describe('a root whose background calls hang (stall deadline)', () => {
    it('should admit Home’s background reads after the deadline while the folder’s full read hangs, and keep the lane’s accounting whole', async () => {
      await profile.service.listProjectManifests();
      /* The folder goes cold; Home stays warm, so the next pass reads only the folder, in the background lane. */
      profile.index.cold(resolveStorageRootKey(profile.workspaceScope, 'unused'), 'reset');
      let hanging = true;
      const hung: Gate[] = [];
      /* Only the folder's reads hang: Home answers as usual. */
      const reader = profile.providers.workspace as unknown as RawReader;
      const raw = reader.readFileRaw.bind(profile.providers.workspace);
      vi.spyOn(reader, 'readFileRaw').mockImplementation(async (path) => {
        if (hanging && isDiscoveryRead(path)) {
          const { promise, resolve } = Promise.withResolvers<void>();
          hung.push({ path, release: resolve });
          await promise;
        }
        return raw(path);
      });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      const stalledBefore = workerTimings.summarize(0).counters['io.background.stalled']?.total ?? 0;
      let peak = 0;
      let lowest = 0;
      const sample = (): void => {
        peak = Math.max(peak, profile.ioScheduler.backgroundInFlight());
        lowest = Math.min(lowest, profile.ioScheduler.backgroundInFlight());
      };

      const pass = track(profile.service.listProjectManifests());
      await flush();
      expect(hung).toHaveLength(backgroundIoConcurrency);

      /* Home's records, read by a connection that declared the background lane. */
      const homeRecords = profile.service.createRootedFileSystem(`/projects/${homeProjectId}`, { lane: 'background' });
      const homeRead = track(homeRecords.readFile('notes.txt', 'utf8'));
      await flush();
      expect(homeRead.settled()).toBe(false);

      const took = await advanceUntil(() => {
        sample();
        return homeRead.settled();
      }, 2 * backgroundIoStallMilliseconds);
      expect(homeRead.value()).toBe('notes');
      expect(took).toBe(backgroundIoStallMilliseconds);
      /* The folder claims one new call at a time while its stalled ones are in flight. */
      expect(hung).toHaveLength(backgroundIoConcurrency + 1);
      expect((workerTimings.summarize(0).counters['io.background.stalled']?.total ?? 0) - stalledBefore).toBe(
        backgroundIoConcurrency,
      );

      /* The hung calls settle at last: the pass completes and nothing is counted twice. */
      hanging = false;
      for (const gate of hung.splice(0)) {
        gate.release();
      }
      await advanceUntil(() => {
        sample();
        return pass.settled();
      }, 60_000);
      expect(pass.value()?.entries).toHaveLength(directories);
      expect(peak).toBeLessThanOrEqual(backgroundIoConcurrency);
      expect(lowest).toBe(0);
      expect(profile.ioScheduler.backgroundInFlight()).toBe(0);
      expect(profile.ioScheduler.backgroundStalled()).toBe(0);
      expect(profile.ioScheduler.backgroundQueued()).toBe(0);
    });
  });

  describe('lock-holding background work', () => {
    it('should not deadlock an interactive operation behind a background sweep that holds the project lock while an interactive call stays in flight', async () => {
      await profile.service.listProjectManifests();
      let interactiveGate: Gate | undefined;
      aroundReads(profile, async (path) => {
        if (path === interactivePath) {
          const { promise, resolve } = Promise.withResolvers<void>();
          interactiveGate = { path, release: resolve };
          await promise;
        }
      });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

      /* An interactive call stays in flight throughout: the sweep's calls are admitted only by aging. */
      const read = track(profile.service.readFile(`/projects/${homeProjectId}/notes.txt`, 'utf8'));
      await flush();
      expect(profile.ioScheduler.interactiveInFlight()).toBe(1);

      /* The orphan sweep takes `project:<id>` and reads every directory in the background lane. */
      const order: string[] = [];
      const sweep = track(profile.service.verifyAbsent(homeProjectId, { lane: 'background' }), () => {
        order.push('sweep');
      });
      await flush();
      expect(profile.ioScheduler.backgroundQueued()).toBeGreaterThan(0);
      expect(sweep.settled()).toBe(false);

      /* An interactive operation on the same id waits for the lock the sweep holds. */
      const probed = track(profile.service.probeProjectDirectories({ projectId: homeProjectId, known: true }), () => {
        order.push('probe');
      });
      await advanceUntil(sweep.settled, 30_000);
      await advanceUntil(probed.settled, 1000);

      expect(sweep.value()).toEqual({
        status: 'present',
        locators: [
          expect.objectContaining({ relativeDirectory: 'home-000' }),
          expect.objectContaining({ relativeDirectory: 'copy-000' }),
        ],
      });
      expect(probed.value()?.locations.map((location) => location.status)).toEqual(['held', 'held']);
      expect(order).toEqual(['sweep', 'probe']);
      expect(read.settled()).toBe(false);

      interactiveGate!.release();
      await flush();
      expect(read.value()).toBe('notes');
    });

    it('should let an interactive operation that holds the project lock finish while a background sweep waits for it', async () => {
      await profile.service.listProjectManifests();
      let probeGate: Gate | undefined;
      aroundReads(profile, async (path) => {
        if (probeGate === undefined && path === 'home-000/tau.json') {
          const { promise, resolve } = Promise.withResolvers<void>();
          probeGate = { path, release: resolve };
          await promise;
        }
      });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

      /* The probe holds `project:<id>` with one of its interactive reads in flight. */
      const probe = track(profile.service.probeProjectDirectories({ projectId: homeProjectId, known: true }));
      await flush();
      expect(probeGate?.path).toBe('home-000/tau.json');
      expect(profile.ioScheduler.interactiveInFlight()).toBeGreaterThan(0);

      /* The background sweep waits for the lock, not for the lane: it has issued nothing. */
      const sweep = track(profile.service.verifyAbsent(homeProjectId, { lane: 'background' }));
      await flush();
      expect(profile.ioScheduler.backgroundInFlight()).toBe(0);
      expect(profile.ioScheduler.backgroundQueued()).toBe(0);

      probeGate!.release();
      await advanceUntil(probe.settled, 1000);
      expect(probe.value()?.locations.map((location) => location.status)).toEqual(['held', 'held']);

      await advanceUntil(sweep.settled, 30_000);
      expect(sweep.value()).toMatchObject({ status: 'present' });
    });

    it('should run a sole copy’s permanent-delete sweep in its own bounded window, not as unranked chains', async () => {
      await profile.service.listProjectManifests();
      let inFlight = 0;
      let peak = 0;
      aroundReads(profile, async (path) => {
        if (isDiscoveryRead(path)) {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 1);
          });
          inFlight -= 1;
        }
      });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

      const sweep = track(profile.service.verifyAbsent(discoveryProfileHomeId(50)));
      await advanceUntil(sweep.settled, 30_000, 1);

      expect(sweep.value()).toMatchObject({ status: 'present' });
      expect(peak).toBeGreaterThan(backgroundIoConcurrency);
      expect(peak).toBeLessThanOrEqual(sweepIoConcurrency);
    });
  });
});
