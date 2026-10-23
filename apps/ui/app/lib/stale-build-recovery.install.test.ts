// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportUiError = vi.hoisted(() => vi.fn(async () => undefined));
const lookupConfirmDelay = 1000;
vi.mock('#lib/error-reporting.js', () => ({
  reportUiError,
  isErrorTrackerListening: () => true,
  setQueuedErrorTagger: () => undefined,
  retagQueuedErrors: () => undefined,
}));

/** This bundle's build id and the deploy that replaced it, set by {@link load} from the real module. */
let ownBuildId = 0;
let deployedBuildId = 0;
const loaded: Array<{ readonly closeBuildSkewChannel: () => void }> = [];

/**
 * Fresh module state per test: the page recovery, its interaction flag and `build-skew`, the one
 * owner of server answers, all live at module scope. The real `build-skew` is wired in.
 */
const load = async () => {
  vi.resetModules();
  const skew = await import('#filesystem/build-skew.js');
  loaded.push(skew);
  ownBuildId = skew.buildId;
  deployedBuildId = ownBuildId + 4_113_029;
  return { ...(await import('#lib/stale-build-recovery.js')), skew };
};

const stubServer = (serverBuildId: number): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async () => Response.json({ buildId: serverBuildId }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const stubReload = (): ReturnType<typeof vi.fn> => {
  const reload = vi.fn();
  vi.stubGlobal('location', { ...globalThis.location, reload });
  return reload;
};

/** Let `build-skew`'s lookup and its confirmations (`lookupConfirmDelay` apart) run, then the decision. */
const settle = async (): Promise<void> => {
  await vi.waitFor(() => {
    expect(globalThis.fetch).toHaveBeenCalled();
  });
  await vi.advanceTimersByTimeAsync(lookupConfirmDelay * 3);
};

/** Ask `build-skew` once more, as any later lookup would, letting its confirmations run. */
const askAgain = async (queryLiveBuild: () => Promise<void>): Promise<void> => {
  const asked = queryLiveBuild();
  await vi.advanceTimersByTimeAsync(lookupConfirmDelay * 3);
  await asked;
};

const rejectWithStaleModule = (): void => {
  const event = new Event('unhandledrejection') as PromiseRejectionEvent;
  Object.assign(event, { reason: new TypeError('Importing a module script failed.') });
  globalThis.dispatchEvent(event);
};

let uninstall: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // A page a second after load; tests that need it older say so.
  vi.spyOn(performance, 'now').mockReturnValue(1000);
});

afterEach(() => {
  for (const skew of loaded.splice(0)) {
    skew.closeBuildSkewChannel();
  }
  uninstall?.();
  uninstall = undefined;
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('installStaleBuildRecovery', () => {
  it('should decide a failure the reload covered again when the reload stalls and the server names this build', async () => {
    const {
      installStaleBuildRecovery,
      readStaleBuildOutcome,
      classifyStaleBuildFailure,
      subscribeGenuineFailures,
      reloadTimeout,
    } = await load();
    const fetchMock = stubServer(deployedBuildId);
    const reload = stubReload();
    uninstall = installStaleBuildRecovery();
    const heard: unknown[] = [];
    const unsubscribe = subscribeGenuineFailures((failure) => {
      heard.push(failure);
    });
    const first = new TypeError('Importing a module script failed.');
    const second = new TypeError('Importing a module script failed.');

    globalThis.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: first }));
    await settle();
    expect(reload).toHaveBeenCalledOnce();
    // A failure while the reload is pending shares its explanation, for now.
    globalThis.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: second }));
    await vi.advanceTimersByTimeAsync(0);
    expect(readStaleBuildOutcome(first)).toBe('reloading');
    expect(readStaleBuildOutcome(second)).toBe('reloading');
    const tag = classifyStaleBuildFailure(second);

    // The page never leaves, and by the stall check the server names this build again.
    fetchMock.mockImplementation(async () => Response.json({ buildId: ownBuildId }));
    await vi.advanceTimersByTimeAsync(reloadTimeout + lookupConfirmDelay * 3);

    expect(readStaleBuildOutcome(first)).toBe('current');
    expect(readStaleBuildOutcome(second)).toBe('current');
    await expect(tag).resolves.toBe('current');
    expect(heard).toStrictEqual([first, second]);
    unsubscribe();
  });

  it('should settle a failure the reload covered as reloading once the page leaves, and decide it no further', async () => {
    const {
      installStaleBuildRecovery,
      readStaleBuildOutcome,
      classifyStaleBuildFailure,
      subscribeGenuineFailures,
      reloadTimeout,
    } = await load();
    const fetchMock = stubServer(deployedBuildId);
    stubReload();
    uninstall = installStaleBuildRecovery();
    const heard: unknown[] = [];
    const unsubscribe = subscribeGenuineFailures((failure) => {
      heard.push(failure);
    });
    const failure = new TypeError('Importing a module script failed.');

    globalThis.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: failure }));
    await settle();
    const tag = classifyStaleBuildFailure(failure);
    globalThis.dispatchEvent(new Event('pagehide'));

    // The tracker's held event is released at once, as a deploy explained it.
    await expect(tag).resolves.toBe('superseded');
    fetchMock.mockImplementation(async () => Response.json({ buildId: ownBuildId }));
    await vi.advanceTimersByTimeAsync(reloadTimeout + lookupConfirmDelay * 3);
    expect(readStaleBuildOutcome(failure)).toBe('reloading');
    expect(heard).toStrictEqual([]);
    unsubscribe();
  });

  it("should hand a failure only Vite's preloader reported to the error tracker when the page leaves first", async () => {
    const { installStaleBuildRecovery } = await load();
    stubServer(deployedBuildId);
    stubReload();
    uninstall = installStaleBuildRecovery();
    const failure = new TypeError('Failed to fetch dynamically imported module: /assets/a-1.js');

    globalThis.dispatchEvent(Object.assign(new Event('vite:preloadError'), { payload: failure }));
    globalThis.dispatchEvent(new Event('pagehide'));

    expect(reportUiError).toHaveBeenCalledExactlyOnceWith(failure);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reportUiError).toHaveBeenCalledOnce();
  });

  it('should recover from a module load failure nothing handled, without any error reporter', async () => {
    const { installStaleBuildRecovery } = await load();
    const fetchMock = stubServer(deployedBuildId);
    const reload = stubReload();
    uninstall = installStaleBuildRecovery();

    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.assign(event, { reason: new TypeError('Importing a module script failed.') });
    globalThis.dispatchEvent(event);
    await settle();

    expect(fetchMock).toHaveBeenCalledWith('/health/build', expect.objectContaining({ cache: 'no-store' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it.each(['pointerdown', 'keydown', 'input', 'paste', 'drop', 'dragenter', 'wheel', 'touchstart'])(
    'should offer the reload instead of forcing it after a %s',
    async (type) => {
      const { installStaleBuildRecovery, skew } = await load();
      stubServer(deployedBuildId);
      const reload = stubReload();
      uninstall = installStaleBuildRecovery();

      globalThis.dispatchEvent(new Event(type));
      rejectWithStaleModule();
      await settle();

      expect(reload).not.toHaveBeenCalled();
      expect(skew.isReloadOffered()).toBe(true);
      expect(skew.readSupersedingBuildId()).toBe(deployedBuildId);
    },
  );

  it('should offer the reload instead of forcing it once the page has been open a while', async () => {
    const { installStaleBuildRecovery, autoReloadWindow } = await load();
    stubServer(deployedBuildId);
    const reload = stubReload();
    vi.spyOn(performance, 'now').mockReturnValue(autoReloadWindow + 1);
    uninstall = installStaleBuildRecovery();

    rejectWithStaleModule();
    await settle();

    expect(reload).not.toHaveBeenCalled();
  });

  it("should recover from a failure Vite's preloader reports", async () => {
    const { installStaleBuildRecovery } = await load();
    stubServer(deployedBuildId);
    const reload = stubReload();
    uninstall = installStaleBuildRecovery();

    const event = new Event('vite:preloadError');
    Object.assign(event, { payload: new TypeError('Failed to fetch dynamically imported module: /assets/a-1.js') });
    globalThis.dispatchEvent(event);
    await settle();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('should recover from a module load failure any error boundary caught', async () => {
    const { recoverFromCaughtError } = await load();
    const fetchMock = stubServer(deployedBuildId);
    const reload = stubReload();

    recoverFromCaughtError(new TypeError('Importing a module script failed.'));
    await settle();

    // One answer and the confirmations `build-skew` asks for before calling the build replaced.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should leave other errors a boundary caught alone', async () => {
    const { recoverFromCaughtError } = await load();
    const fetchMock = stubServer(deployedBuildId);

    recoverFromCaughtError(new Error('controlled render failure'));
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should leave other rejections alone', async () => {
    const { installStaleBuildRecovery } = await load();
    const fetchMock = stubServer(deployedBuildId);
    uninstall = installStaleBuildRecovery();

    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.assign(event, { reason: new Error('boom') });
    globalThis.dispatchEvent(event);
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should clear the guard of a reload that reached this build', async () => {
    const { installStaleBuildRecovery } = await load();
    sessionStorage.setItem('tau-stale-build-reload', `${String(ownBuildId - 1)}>${String(ownBuildId)}`);

    uninstall = installStaleBuildRecovery();

    expect(sessionStorage.getItem('tau-stale-build-reload')).toBeNull();
  });

  it('should hand a failure only onCaughtError saw to the error tracker once, and keep it explained when the rollback ends', async () => {
    const { recoverFromCaughtError, readStaleBuildOutcome, subscribeGenuineFailures, skew } = await load();
    stubServer(ownBuildId - 3_600_000);
    vi.spyOn(performance, 'now').mockReturnValue(60_000);
    const error = new TypeError('Importing a module script failed.');
    const heard: unknown[] = [];
    const unsubscribe = subscribeGenuineFailures((failure) => {
      heard.push(failure);
    });

    recoverFromCaughtError(error);
    await settle();
    expect(readStaleBuildOutcome(error)).toBe('superseded');

    // The rollback ends: the server names this build as often as the confirmation rule asks.
    stubServer(ownBuildId);
    await askAgain(skew.queryLiveBuild);
    unsubscribe();

    expect(reportUiError.mock.calls).toStrictEqual([[error]]);
    expect(heard).toStrictEqual([]);
    expect(readStaleBuildOutcome(error)).toBe('superseded');
    expect(skew.isReloadOffered()).toBe(false);
  });

  it('should neither offer nor reload on one answer naming another build, until it is confirmed', async () => {
    const { recoverFromCaughtError, readStaleBuildOutcome, skew } = await load();
    const reload = stubReload();
    let answers = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        answers += 1;
        // An edge still answering for a build it is leaving names another build once.
        return Response.json({ buildId: answers === 1 ? deployedBuildId : ownBuildId });
      }),
    );
    const error = new TypeError('Importing a module script failed.');

    recoverFromCaughtError(error);
    await settle();

    expect(readStaleBuildOutcome(error)).toBe('current');
    expect(reload).not.toHaveBeenCalled();
    expect(skew.isReloadOffered()).toBe(false);
  });

  it('should re-report nothing when one stale answer names this build during a rollout', async () => {
    const { recoverFromCaughtError, readStaleBuildOutcome, subscribeGenuineFailures, skew } = await load();
    stubServer(deployedBuildId);
    vi.spyOn(performance, 'now').mockReturnValue(60_000);
    const error = new TypeError('Importing a module script failed.');
    const heard: unknown[] = [];
    const unsubscribe = subscribeGenuineFailures((failure) => {
      heard.push(failure);
    });
    recoverFromCaughtError(error);
    await settle();
    expect(readStaleBuildOutcome(error)).toBe('superseded');

    // An edge still answering for the build it is leaving names this one, once.
    let answers = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        answers += 1;
        return Response.json({ buildId: answers === 1 ? ownBuildId : deployedBuildId });
      }),
    );
    await askAgain(skew.queryLiveBuild);
    unsubscribe();

    expect(readStaleBuildOutcome(error)).toBe('superseded');
    expect(skew.readServerVerdict()).toBe('replaced');
    expect(skew.isReloadOffered()).toBe(true);
    expect(reportUiError.mock.calls).toStrictEqual([[error]]);
    expect(heard).toStrictEqual([]);
  });

  it.each([
    ['after the first input', 'input'],
    ['once the auto-reload window has passed', 'window'],
  ])('should stop listening for input %s', async (_label, trigger) => {
    const { installStaleBuildRecovery, autoReloadWindow } = await load();
    const removed = vi.spyOn(globalThis, 'removeEventListener');
    uninstall = installStaleBuildRecovery();

    if (trigger === 'input') {
      globalThis.dispatchEvent(new Event('keydown'));
    } else {
      vi.advanceTimersByTime(autoReloadWindow);
    }

    const inputTypes = ['pointerdown', 'keydown', 'input', 'paste', 'drop', 'dragenter', 'wheel', 'touchstart'];
    expect(removed.mock.calls.map(([type]) => type).toSorted()).toStrictEqual(inputTypes.toSorted());
  });

  it("should recover from the error tracker's own chunk a deploy stopped serving, wrapped or not", async () => {
    const { recoverFromSdkLoadFailure } = await load();
    stubServer(deployedBuildId);
    const reload = stubReload();
    const loadFailure = new Error('Loading the error tracker failed', {
      cause: new TypeError('Importing a module script failed.'),
    });

    recoverFromSdkLoadFailure(loadFailure);
    await settle();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('should leave any other SDK load failure alone', async () => {
    const { recoverFromSdkLoadFailure } = await load();
    const fetchMock = stubServer(deployedBuildId);

    recoverFromSdkLoadFailure(new Error('blocked by the browser'));
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
