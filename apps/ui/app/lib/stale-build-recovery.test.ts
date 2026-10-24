// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupConfirmDelay, serverConfirmations } from '#filesystem/build-skew.js';
import type { ServerVerdict } from '#filesystem/build-skew.js';
import {
  autoReloadBudget,
  autoReloadTimesKey,
  createStaleBuildRecovery,
  isStaleModuleError,
  preloadFollowUpDelay,
  staleBuildReloadKey,
} from '#lib/stale-build-recovery.js';
import type { LiveBuildSource } from '#lib/stale-build-recovery.js';

/** In-memory `sessionStorage` stand-in. */
const createStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
  readonly entries: Map<string, string>;
} => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
};

const ownBuildId = 1_792_726_000_000;
const deployedBuildId = 1_792_730_113_029;
const guardFor = (from: number, to: number): string => `${String(from)}>${String(to)}`;

type SetupOptions = Partial<Omit<Parameters<typeof createStaleBuildRecovery>[0], 'liveBuild' | 'storage'>> & {
  /** Per-tab storage shared across page loads, or one that throws; a fresh one by default. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** What the server answers each question (`/health/build`), as `build-skew` would ask it. */
  readonly fetchServerBuildId?: () => Promise<number | undefined>;
};

/**
 * `build-skew`'s verdict, reduced to what the recovery reads: each question applies the server's
 * answer (the confirmation rule is `build-skew`'s own, tested there). `confirmLive` is the server
 * naming this build after the confirmations.
 */
const createLiveBuild = (fetchServerBuildId: () => Promise<number | undefined>, own = ownBuildId) => {
  let verdict: ServerVerdict = 'unknown';
  let replacing = own;
  /** Bumped when the server names this build, so an answer asked before it is dropped, as `build-skew` does. */
  let version = 0;
  const apply = (answer: number | undefined): void => {
    if (answer === undefined) {
      return;
    }
    const next: ServerVerdict = answer === own ? 'live' : 'replaced';
    if (next === 'replaced') {
      replacing = answer;
    }
    verdict = next;
  };
  const source: LiveBuildSource = {
    query: async () => {
      const askedIn = version;
      const answer = await fetchServerBuildId();
      if (askedIn === version) {
        apply(answer);
      }
    },
    readVerdict: () => verdict,
    readReplacingBuild: () => replacing,
  };
  return {
    source,
    confirmLive: () => {
      version += 1;
      apply(own);
    },
  };
};

const setup = ({ fetchServerBuildId: answers, ...overrides }: SetupOptions = {}) => {
  // The returned storage is the fresh one; a test that passes its own keeps its own handle.
  const storage = createStorage();
  const reload = vi.fn();
  const onSuperseded = vi.fn();
  const onGenuineFailure = vi.fn();
  const reportToErrorTracker = vi.fn();
  const fetchServerBuildId = vi.fn(answers ?? (async (): Promise<number | undefined> => deployedBuildId));
  const liveBuild = createLiveBuild(fetchServerBuildId, overrides.buildId ?? ownBuildId);
  const recovery = createStaleBuildRecovery({
    buildId: ownBuildId,
    liveBuild: liveBuild.source,
    storage: overrides.storage ?? storage,
    reload,
    onSuperseded,
    onGenuineFailure,
    reportToErrorTracker,
    canReloadSafely: () => true,
    ...overrides,
  });
  return {
    storage,
    reload,
    onSuperseded,
    onGenuineFailure,
    reportToErrorTracker,
    fetchServerBuildId,
    recovery,
    confirmLive: liveBuild.confirmLive,
  };
};

/** A distinct failure object, as each failed `import()` produces. */
const failure = (): TypeError => new TypeError('Importing a module script failed.');

afterEach(() => {
  vi.useRealTimers();
});

describe('isStaleModuleError', () => {
  it.each([
    ['WebKit (TAU-UI-6)', new TypeError('Importing a module script failed.')],
    [
      'Chromium',
      new TypeError('Failed to fetch dynamically imported module: https://taucad.dev/assets/viewer-Dk2s9aQ1.js'),
    ],
    ['Firefox', new TypeError('error loading dynamically imported module: https://taucad.dev/assets/a-1.js')],
    ['a Vite stylesheet preload', new Error('Unable to preload CSS for /assets/editor-Bq7x.css')],
  ])('should recognise the %s module load failure', (_label, error) => {
    expect(isStaleModuleError(error)).toBe(true);
  });

  it.each([
    ['an unrelated TypeError', new TypeError("Cannot read properties of undefined (reading 'x')")],
    ['a string that quotes the message', 'Importing a module script failed.'],
    ['undefined', undefined],
  ])('should not match %s', (_label, error) => {
    expect(isStaleModuleError(error)).toBe(false);
  });
});

describe('createStaleBuildRecovery', () => {
  it('should reload once and record the build pair when the server runs a different build', async () => {
    const { recovery, reload, storage, onSuperseded } = setup();

    await expect(recovery.recover(failure())).resolves.toBe('reloading');

    expect(reload).toHaveBeenCalledOnce();
    expect(storage.entries.get(staleBuildReloadKey)).toBe(guardFor(ownBuildId, deployedBuildId));
    expect(onSuperseded).not.toHaveBeenCalled();
  });

  it('should ask build-skew, the one owner of server answers, before it reloads', async () => {
    const { recovery, reload, fetchServerBuildId } = setup();

    await recovery.recover(failure());

    expect(fetchServerBuildId.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0] ?? 0);
  });

  it('should offer the reload instead of reloading once the user has interacted with the page', async () => {
    const { recovery, reload, storage, onSuperseded } = setup({ canReloadSafely: () => false });

    await expect(recovery.recover(failure())).resolves.toBe('superseded');

    expect(reload).not.toHaveBeenCalled();
    expect(storage.entries.has(staleBuildReloadKey)).toBe(false);
    expect(onSuperseded).toHaveBeenCalledWith(deployedBuildId);
  });

  it('should hand over to the update control when the same build pair already reloaded', async () => {
    const { recovery, reload, storage, onSuperseded } = setup();
    storage.setItem(staleBuildReloadKey, guardFor(ownBuildId, deployedBuildId));

    await expect(recovery.recover(failure())).resolves.toBe('superseded');

    expect(reload).not.toHaveBeenCalled();
    expect(onSuperseded).toHaveBeenCalledWith(deployedBuildId);
  });

  it('should reload for a later deploy even though an earlier pair from this build is recorded', async () => {
    const { recovery, reload, storage } = setup();
    storage.setItem(staleBuildReloadKey, guardFor(ownBuildId, deployedBuildId - 1));

    await expect(recovery.recover(failure())).resolves.toBe('reloading');

    expect(reload).toHaveBeenCalledOnce();
    expect(storage.entries.get(staleBuildReloadKey)).toBe(guardFor(ownBuildId, deployedBuildId));
  });

  it('should treat a rollback to an older build as a deploy too', async () => {
    const rolledBack = ownBuildId - 60_000;
    const { recovery, reload } = setup({ fetchServerBuildId: async () => rolledBack });

    await expect(recovery.recover(failure())).resolves.toBe('reloading');

    expect(reload).toHaveBeenCalledOnce();
  });

  it.each([
    ['the server runs this build', async (): Promise<number | undefined> => ownBuildId],
    ['the server cannot be reached or names no build', async (): Promise<number | undefined> => undefined],
  ])('should report a genuine failure when %s', async (_label, fetchServerBuildId) => {
    const { recovery, reload, onSuperseded } = setup({ fetchServerBuildId });

    await expect(recovery.recover(failure())).resolves.toBe('current');

    expect(reload).not.toHaveBeenCalled();
    expect(onSuperseded).not.toHaveBeenCalled();
  });

  it('should never reload a bundle without a build id', async () => {
    const { recovery, reload, fetchServerBuildId } = setup({ buildId: 0 });

    await expect(recovery.recover(failure())).resolves.toBe('current');

    expect(fetchServerBuildId).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('should not reload when the guard cannot be written, since nothing would stop a loop', async () => {
    const { recovery, reload, onSuperseded } = setup({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('Storage is disabled', 'SecurityError');
        },
        removeItem: () => undefined,
      },
    });

    await expect(recovery.recover(failure())).resolves.toBe('superseded');

    expect(reload).not.toHaveBeenCalled();
    expect(onSuperseded).toHaveBeenCalledWith(deployedBuildId);
  });

  it('should answer every report of one failure from one check, even after a current outcome', async () => {
    const fetchServerBuildId = vi.fn(async (): Promise<number | undefined> => ownBuildId);
    const { recovery } = setup({ fetchServerBuildId });
    const error = failure();

    await expect(recovery.recover(error)).resolves.toBe('current');
    await expect(recovery.recover(error)).resolves.toBe('current');

    expect(fetchServerBuildId).toHaveBeenCalledOnce();
  });

  it('should reload once for failures that arrive together', async () => {
    // One request serves them: `askLiveBuild` coalesces callers (`build-identity.test.ts`).
    const { recovery, reload } = setup();

    const outcomes = await Promise.all([recovery.recover(failure()), recovery.recover(failure())]);

    expect(outcomes).toStrictEqual(['reloading', 'reloading']);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should check again for a later failure once the server reported this build', async () => {
    let served = ownBuildId;
    const fetchServerBuildId = vi.fn(async (): Promise<number | undefined> => served);
    const { recovery, reload } = setup({ fetchServerBuildId });

    await expect(recovery.recover(failure())).resolves.toBe('current');
    served = deployedBuildId;
    await expect(recovery.recover(failure())).resolves.toBe('reloading');

    expect(fetchServerBuildId).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should report the reload as pending, then stalled once it has not left the page in time', async () => {
    vi.useFakeTimers();
    const { recovery, onSuperseded } = setup({ reloadTimeout: 15_000 });
    const states: string[] = [];
    recovery.subscribeReloadState(() => {
      states.push(recovery.readReloadState());
    });

    await expect(recovery.recover(failure())).resolves.toBe('reloading');
    expect(recovery.readReloadState()).toBe('pending');
    await vi.advanceTimersByTimeAsync(14_999);
    expect(onSuperseded).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(recovery.readReloadState()).toBe('stalled');
    expect(states).toStrictEqual(['pending', 'stalled']);
    expect(onSuperseded).toHaveBeenCalledWith(deployedBuildId);
  });

  it('should keep the guard of a stalled reload, since it may only be slow', async () => {
    vi.useFakeTimers();
    const { recovery, storage } = setup({ reloadTimeout: 15_000 });

    await recovery.recover(failure());
    await vi.advanceTimersByTimeAsync(15_000);

    expect(storage.entries.get(staleBuildReloadKey)).toBe(guardFor(ownBuildId, deployedBuildId));
  });

  it('should offer, not retry, a stalled reload on a later failure', async () => {
    vi.useFakeTimers();
    const { recovery, reload } = setup({ reloadTimeout: 15_000 });

    await recovery.recover(failure());
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(recovery.recover(failure())).resolves.toBe('superseded');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should not offer a stalled reload once the server names this build again', async () => {
    vi.useFakeTimers();
    let served = deployedBuildId;
    const { recovery, onSuperseded } = setup({ reloadTimeout: 15_000, fetchServerBuildId: async () => served });

    await recovery.recover(failure());
    served = ownBuildId;
    await vi.advanceTimersByTimeAsync(15_000);

    expect(onSuperseded).not.toHaveBeenCalled();
    expect(recovery.readReloadState()).toBe('idle');
  });

  it("should leave a stalled reload's failures explained while the server still names another build", async () => {
    vi.useFakeTimers();
    const { recovery, onGenuineFailure } = setup({ reloadTimeout: 15_000 });
    const error = failure();
    await recovery.recover(error);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(onGenuineFailure).not.toHaveBeenCalled();
    expect(recovery.classify(error)).toBe('superseded');
  });

  describe('reporting', () => {
    it('should hand a boundary failure to the error tracker once, whatever its outcome', async () => {
      const { recovery, reportToErrorTracker, onGenuineFailure } = setup({ canReloadSafely: () => false });
      const error = failure();

      await expect(recovery.recover(error, 'boundary')).resolves.toBe('superseded');
      await recovery.recover(error, 'boundary');

      expect(reportToErrorTracker.mock.calls).toStrictEqual([[error]]);
      expect(onGenuineFailure).not.toHaveBeenCalled();
      expect(recovery.classify(error)).toBe('superseded');
    });

    it("should leave a failure Sentry's global handler captured to Sentry, never capturing it again", async () => {
      vi.useFakeTimers();
      const { recovery, reportToErrorTracker } = setup({ canReloadSafely: () => false });
      const error = failure();

      await recovery.recover(error, 'global');
      await vi.advanceTimersByTimeAsync(preloadFollowUpDelay * 3);

      expect(reportToErrorTracker).not.toHaveBeenCalled();
    });

    it("should hand a failure only Vite's preloader saw to the error tracker itself, once, after the follow-up wait", async () => {
      vi.useFakeTimers();
      const { recovery, reportToErrorTracker } = setup();
      const error = failure();
      await recovery.recover(error, 'preload');
      expect(reportToErrorTracker).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(preloadFollowUpDelay * 3);

      expect(reportToErrorTracker.mock.calls).toStrictEqual([[error]]);
    });

    it('should leave Sentry a preload failure that then reached its unhandled-rejection handler', async () => {
      vi.useFakeTimers();
      const { recovery, reportToErrorTracker } = setup();
      const error = failure();
      await recovery.recover(error, 'preload');
      await recovery.recover(error, 'global');

      await vi.advanceTimersByTimeAsync(preloadFollowUpDelay * 3);

      expect(reportToErrorTracker).not.toHaveBeenCalled();
    });

    it('should hand a preload failure a boundary then caught to the error tracker at once, and only once', async () => {
      vi.useFakeTimers();
      const { recovery, reportToErrorTracker } = setup();
      const error = failure();
      await recovery.recover(error, 'preload');
      await recovery.recover(error, 'boundary');
      expect(reportToErrorTracker.mock.calls).toStrictEqual([[error]]);

      await vi.advanceTimersByTimeAsync(preloadFollowUpDelay * 3);

      expect(reportToErrorTracker.mock.calls).toStrictEqual([[error]]);
    });

    it.each([
      ['a bundle without a build id', 0],
      ['a build the server still runs', ownBuildId],
    ])(
      "should never report the SDK's own load failure, though a fast verdict lands before the loader hands it over (%s)",
      async (_case, buildId) => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        let settleLoad: (failure: unknown) => void = () => undefined;
        const loadFailure = new Promise<unknown>((resolve) => {
          settleLoad = resolve;
        });
        const { recovery, onGenuineFailure, reportToErrorTracker } = setup({
          buildId,
          fetchServerBuildId: async () => ownBuildId,
          isSdkLoadFailure: async (value) => value === (await loadFailure),
        });
        const error = failure();

        // Vite's preload helper dispatches the SDK's own import failure first ...
        void recovery.recover(error, 'preload');
        await vi.advanceTimersByTimeAsync(0);
        // ... then rethrows it into the loader, which hears it fail, and hands it over later still.
        settleLoad(error);
        await vi.advanceTimersByTimeAsync(0);
        void recovery.recover(error, 'sdk');
        await vi.advanceTimersByTimeAsync(preloadFollowUpDelay * 3);

        expect(recovery.readOutcome(error)).toBe('current');
        expect(onGenuineFailure).not.toHaveBeenCalled();
        expect(reportToErrorTracker).not.toHaveBeenCalled();
      },
    );

    it('should report a preload failure that is not the SDK load, once the load turned out fine', async () => {
      vi.useFakeTimers();
      let settleLoad: (failure: unknown) => void = () => undefined;
      const loadFailure = new Promise<unknown>((resolve) => {
        settleLoad = resolve;
      });
      const { recovery, onGenuineFailure, reportToErrorTracker } = setup({
        buildId: 0,
        isSdkLoadFailure: async (value) => value === (await loadFailure),
      });
      const error = failure();

      void recovery.recover(error, 'preload');
      await vi.advanceTimersByTimeAsync(0);
      expect(onGenuineFailure).not.toHaveBeenCalled();
      // The SDK loaded: whatever the preloader saw was something else.
      settleLoad(undefined);
      await vi.advanceTimersByTimeAsync(preloadFollowUpDelay * 3);

      expect(onGenuineFailure.mock.calls).toStrictEqual([[error]]);
      expect(reportToErrorTracker.mock.calls).toStrictEqual([[error]]);
    });

    it('should hand the error tracker a global failure that came before its handlers were listening', async () => {
      const { recovery, reportToErrorTracker } = setup({ isErrorTrackerListening: () => false });
      const error = failure();

      await recovery.recover(error, 'global');
      await recovery.recover(error, 'global');

      expect(reportToErrorTracker.mock.calls).toStrictEqual([[error]]);
    });

    it('should tag a failure reported before its decision with the decision, once it settles', async () => {
      let answer: (buildId: number) => void = () => undefined;
      const { recovery, reportToErrorTracker } = setup({
        canReloadSafely: () => false,
        fetchServerBuildId: async () =>
          new Promise<number>((resolve) => {
            answer = resolve;
          }),
      });
      const error = failure();
      const decision = recovery.recover(error, 'boundary');
      expect(reportToErrorTracker.mock.calls).toStrictEqual([[error]]);
      expect(recovery.classify(error)).toBe('unknown');

      const tag = recovery.classifySettled(error);
      answer(deployedBuildId);
      await decision;

      await expect(tag).resolves.toBe('superseded');
    });

    it('should wait out the slowest lookup, its confirmations included, before tagging', async () => {
      vi.useFakeTimers();
      // Each answer takes 3.5 s, inside the 4 s request timeout; a lookup is one answer and its confirmations.
      const slowAnswer = async (): Promise<number> =>
        new Promise<number>((resolve) => {
          setTimeout(() => {
            resolve(deployedBuildId);
          }, 3500);
        });
      const answers = 1 + serverConfirmations;
      const { recovery } = setup({
        canReloadSafely: () => false,
        fetchServerBuildId: async () => {
          let answer = deployedBuildId;
          for (let check = 0; check < answers; check += 1) {
            if (check > 0) {
              // oxlint-disable-next-line no-await-in-loop -- The confirmations are sequential.
              await new Promise((resolve) => {
                setTimeout(resolve, lookupConfirmDelay);
              });
            }
            // oxlint-disable-next-line no-await-in-loop -- The confirmations are sequential.
            answer = await slowAnswer();
          }
          return answer;
        },
      });
      const error = failure();
      void recovery.recover(error, 'boundary');

      const tag = recovery.classifySettled(error);
      await vi.advanceTimersByTimeAsync(answers * 3500 + serverConfirmations * lookupConfirmDelay);

      await expect(tag).resolves.toBe('superseded');
    });

    it('should tag with what is known once the wait for a decision runs out', async () => {
      vi.useFakeTimers();
      const { recovery } = setup({
        fetchServerBuildId: async () =>
          new Promise<number>(() => {
            // Never answers.
          }),
      });
      const error = failure();
      void recovery.recover(error, 'boundary');

      const tag = recovery.classifySettled(error, 1000);
      await vi.advanceTimersByTimeAsync(1000);

      await expect(tag).resolves.toBe('unknown');
    });

    it.each(['boundary', 'global', 'preload'] as const)(
      'should tell analytics once of a %s failure decided genuine, when it is decided',
      async (source) => {
        const { recovery, onGenuineFailure } = setup({ fetchServerBuildId: async () => ownBuildId });
        const error = failure();

        await recovery.recover(error, source);
        await recovery.recover(error, source);
        await Promise.resolve();

        expect(onGenuineFailure.mock.calls).toStrictEqual([[error]]);
      },
    );

    it('should keep a failure a deploy explained explained, and unreported, when the rollback ends', async () => {
      const { recovery, onGenuineFailure, confirmLive } = setup({ canReloadSafely: () => false });
      const error = failure();
      await recovery.recover(error, 'boundary');
      await Promise.resolve();

      confirmLive();
      await recovery.recover(error, 'boundary');

      expect(recovery.readOutcome(error)).toBe('superseded');
      expect(onGenuineFailure).not.toHaveBeenCalled();
      expect(recovery.classify(error)).toBe('superseded');
    });

    it.each([
      ['a deploy explains it', async (): Promise<number | undefined> => deployedBuildId, 'superseded'],
      ['the live build still has it', async (): Promise<number | undefined> => ownBuildId, 'current'],
      ['the server did not say', async (): Promise<number | undefined> => undefined, 'unknown'],
    ] as const)('should tag a failure for the error tracker when %s', async (_label, fetchServerBuildId, tag) => {
      const { recovery } = setup({ fetchServerBuildId, canReloadSafely: () => false });
      const decided = failure();
      await recovery.recover(decided);
      await Promise.resolve();

      expect(recovery.classify(decided)).toBe(tag);
      expect(recovery.classify(failure())).toBe(tag);
    });

    it('should keep a stalled reload explained, and decide what it covered as offered, when the stall check gets no answer', async () => {
      vi.useFakeTimers();
      let served: number | undefined = deployedBuildId;
      const { recovery, onSuperseded, onGenuineFailure } = setup({
        reloadTimeout: 15_000,
        fetchServerBuildId: async () => served,
      });
      const error = failure();
      await recovery.recover(error);
      served = undefined;

      await vi.advanceTimersByTimeAsync(15_000);

      expect(recovery.readReloadState()).toBe('stalled');
      expect(onSuperseded).toHaveBeenCalledWith(deployedBuildId);
      // The page never left: the reload's provisional outcome is decided again, as offered.
      expect(recovery.readOutcome(error)).toBe('superseded');
      expect(recovery.classify(error)).toBe('superseded');
      expect(onGenuineFailure).not.toHaveBeenCalled();
    });

    it('should explain a failure that arrives during its own reload by that reload, even when its check gets no answer', async () => {
      let served: number | undefined = deployedBuildId;
      const { recovery, onGenuineFailure } = setup({ fetchServerBuildId: async () => served });
      await recovery.recover(failure());
      served = undefined;

      await expect(recovery.recover(failure(), 'boundary')).resolves.toBe('reloading');
      await Promise.resolve();
      expect(onGenuineFailure).not.toHaveBeenCalled();
    });
  });

  it('should stop reloading on its own when a rolling deploy keeps moving the tab between two builds', async () => {
    const storage = createStorage();
    const reloads: number[] = [];
    const outcomes: string[] = [];
    let builds: readonly [number, number] = [ownBuildId, deployedBuildId];
    for (let page = 0; page < 6; page += 1) {
      const [own, served] = builds;
      // oxlint-disable-next-line no-await-in-loop -- Each page load follows the previous one's reload.
      const { recovery, reload } = setup({
        buildId: own,
        storage,
        fetchServerBuildId: async () => served,
        now: () => 1_000_000 + page * 1000,
      });
      recovery.confirmArrival();
      // oxlint-disable-next-line no-await-in-loop -- Each page load follows the previous one's reload.
      outcomes.push(await recovery.recover(failure()));
      reloads.push(reload.mock.calls.length);
      builds = [served, own];
    }

    expect(reloads.reduce((total, count) => total + count, 0)).toBe(autoReloadBudget);
    expect(outcomes.slice(autoReloadBudget)).toStrictEqual(
      Array.from({ length: 6 - autoReloadBudget }, () => 'superseded'),
    );
  });

  it('should charge the reload budget only once the guard is written', async () => {
    const storage = createStorage();
    const failing = {
      ...storage,
      setItem: (key: string, value: string) => {
        if (key === staleBuildReloadKey) {
          throw new Error('QuotaExceededError');
        }
        storage.setItem(key, value);
      },
    };
    const { recovery, reload } = setup({ storage: failing });

    await expect(recovery.recover(failure())).resolves.toBe('superseded');

    expect(reload).not.toHaveBeenCalled();
    expect(storage.entries.has(autoReloadTimesKey)).toBe(false);
  });

  it('should take the guard back, and not reload, when the budget cannot be recorded', async () => {
    const storage = createStorage();
    const budgetFails = {
      ...storage,
      setItem: (key: string, value: string) => {
        if (key === autoReloadTimesKey) {
          throw new Error('QuotaExceededError');
        }
        storage.setItem(key, value);
      },
    };
    const { recovery, reload } = setup({ storage: budgetFails });

    await expect(recovery.recover(failure())).resolves.toBe('superseded');

    expect(reload).not.toHaveBeenCalled();
    expect(storage.entries.has(staleBuildReloadKey)).toBe(false);
  });

  it('should not retry a reload another page of this tab started, which may have looped', async () => {
    const { recovery, reload, storage } = setup();
    storage.setItem(staleBuildReloadKey, guardFor(ownBuildId, deployedBuildId));

    await expect(recovery.recover(failure())).resolves.toBe('superseded');

    expect(reload).not.toHaveBeenCalled();
  });

  describe('classify', () => {
    it('should tag what is known now without asking the server, reloading or superseding anything', () => {
      const { recovery, reload, onSuperseded, fetchServerBuildId } = setup();

      expect(recovery.classify(failure())).toBe('unknown');

      expect(fetchServerBuildId).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(onSuperseded).not.toHaveBeenCalled();
    });

    it('should repeat a decision already made for the same failure', async () => {
      const { recovery, fetchServerBuildId } = setup();
      const error = failure();

      await recovery.recover(error);
      await Promise.resolve();

      expect(recovery.classify(error)).toBe('superseded');
      expect(fetchServerBuildId).toHaveBeenCalledOnce();
    });

    it('should tag an undecided failure from the live verdict', async () => {
      const { recovery } = setup({ fetchServerBuildId: async () => ownBuildId });
      await recovery.recover(failure());

      expect(recovery.classify(failure())).toBe('current');
    });
  });

  describe('confirmArrival', () => {
    it('should clear the guard once the page runs the build it reloaded into', () => {
      const { recovery, storage } = setup({ buildId: deployedBuildId });
      storage.setItem(staleBuildReloadKey, guardFor(ownBuildId, deployedBuildId));

      recovery.confirmArrival();

      expect(storage.entries.has(staleBuildReloadKey)).toBe(false);
    });

    it('should keep the guard when the reload landed on another build, so it cannot loop', () => {
      const { recovery, storage } = setup();
      storage.setItem(staleBuildReloadKey, guardFor(ownBuildId, deployedBuildId));

      recovery.confirmArrival();

      expect(storage.entries.get(staleBuildReloadKey)).toBe(guardFor(ownBuildId, deployedBuildId));
    });
  });
});
