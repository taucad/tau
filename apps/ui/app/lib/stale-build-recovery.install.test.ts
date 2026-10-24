// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportUiError = vi.hoisted(() => vi.fn(async () => undefined));
const sendWaitingErrors = vi.hoisted(() => vi.fn());
const lookupConfirmDelay = 1000;
vi.mock('#lib/error-reporting.js', () => ({
  reportUiError,
  isErrorTrackerListening: () => true,
  setErrorDescriber: () => undefined,
  sendWaitingErrors,
  // No SDK load is under way in these tests: nothing is its failure.
  isSdkLoadFailure: () => false,
}));

/** The document turns hidden or visible (`visibilitychange`), as switching tabs or apps does. */
const setVisibility = (state: DocumentVisibilityState): void => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
};

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
  it("should release the tracker's held tag as undecided when the page is hidden into the back/forward cache, then carry on", async () => {
    const { installStaleBuildRecovery, classifyStaleBuildFailure, readStaleBuildOutcome, recoverFromStaleBuild } =
      await load();
    const fetchMock = stubServer(ownBuildId);
    vi.spyOn(performance, 'now').mockReturnValue(60_000);
    uninstall = installStaleBuildRecovery();
    const held = new TypeError('Importing a module script failed.');

    globalThis.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: held }));
    const tag = classifyStaleBuildFailure(held);
    // The decision's lookup is still running when the page is frozen.
    globalThis.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    await expect(tag).resolves.toBe('undecided');

    // Shown again: the decision lands, and a new failure is decided and tagged as usual.
    globalThis.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await settle();
    expect(readStaleBuildOutcome(held)).toBe('current');
    const later = new TypeError('Importing a module script failed.');
    const decided = recoverFromStaleBuild(later);
    const laterTag = classifyStaleBuildFailure(later);
    await vi.advanceTimersByTimeAsync(lookupConfirmDelay * 3);
    await expect(decided).resolves.toBe('current');
    await expect(laterTag).resolves.toBe('current');
    expect(fetchMock).toHaveBeenCalled();
  });

  it("should release the tracker's held tag as undecided, and send what waited, when the document is hidden, then carry on once visible", async () => {
    const { installStaleBuildRecovery, classifyStaleBuildFailure, readStaleBuildOutcome, recoverFromStaleBuild } =
      await load();
    stubServer(ownBuildId);
    vi.spyOn(performance, 'now').mockReturnValue(60_000);
    uninstall = installStaleBuildRecovery();
    const held = new TypeError('Importing a module script failed.');
    const preloaded = new TypeError('Failed to fetch dynamically imported module: /assets/a-1.js');

    globalThis.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: held }));
    globalThis.dispatchEvent(Object.assign(new Event('vite:preloadError'), { payload: preloaded }));
    const tag = classifyStaleBuildFailure(held);
    // Switched away (Android may then freeze or discard the tab without a `pagehide`) while the lookup runs.
    setVisibility('hidden');
    await expect(tag).resolves.toBe('undecided');
    expect(reportUiError).toHaveBeenCalledExactlyOnceWith(preloaded);
    expect(sendWaitingErrors).toHaveBeenCalledOnce();

    setVisibility('visible');
    await settle();
    expect(readStaleBuildOutcome(held)).toBe('current');
    const later = new TypeError('Importing a module script failed.');
    const decided = recoverFromStaleBuild(later);
    const laterTag = classifyStaleBuildFailure(later);
    await vi.advanceTimersByTimeAsync(lookupConfirmDelay * 3);
    await expect(decided).resolves.toBe('current');
    await expect(laterTag).resolves.toBe('current');
  });

  it('should treat a document that boots hidden as hidden from the start, so nothing waits for it to be shown', async () => {
    const { installStaleBuildRecovery, classifyStaleBuildFailure } = await load();
    stubServer(ownBuildId);
    vi.spyOn(performance, 'now').mockReturnValue(60_000);
    // Opened in a background tab: no `visibilitychange` comes until the user looks at it.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    uninstall = installStaleBuildRecovery();
    expect(sendWaitingErrors).toHaveBeenCalledExactlyOnceWith('hidden');
    const held = new TypeError('Importing a module script failed.');

    globalThis.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: held }));
    const tag = classifyStaleBuildFailure(held);
    await vi.advanceTimersByTimeAsync(0);

    // Settled already, with what is known: nothing waits on a page that may never be shown.
    await expect(Promise.race([tag, Promise.resolve('still waiting')])).resolves.toBe('undecided');
  });

  it('should keep a document that boots hidden hidden through its first pageshow, until the document itself is visible', async () => {
    const { installStaleBuildRecovery, classifyStaleBuildFailure } = await load();
    stubServer(ownBuildId);
    vi.spyOn(performance, 'now').mockReturnValue(60_000);
    // Opened in a background tab: the first `pageshow` (not persisted) fires while the document is still hidden.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    uninstall = installStaleBuildRecovery();
    globalThis.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    const held = new TypeError('Importing a module script failed.');

    globalThis.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: held }));
    const tag = classifyStaleBuildFailure(held);
    await vi.advanceTimersByTimeAsync(0);

    // Still hidden: nothing waits.
    await expect(Promise.race([tag, Promise.resolve('still waiting')])).resolves.toBe('undecided');

    // Shown: a new failure is decided and tagged as usual.
    setVisibility('visible');
    const later = new TypeError('Importing a module script failed.');
    globalThis.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: later }));
    const laterTag = classifyStaleBuildFailure(later);
    await settle();
    await expect(laterTag).resolves.toBe('current');
  });

  it("should hand a failure only Vite's preloader reported to the tracker at once while the page is hidden", async () => {
    const { installStaleBuildRecovery } = await load();
    stubServer(deployedBuildId);
    uninstall = installStaleBuildRecovery();
    setVisibility('hidden');
    const failure = new TypeError('Failed to fetch dynamically imported module: /assets/a-1.js');

    globalThis.dispatchEvent(Object.assign(new Event('vite:preloadError'), { payload: failure }));

    // No follow-up wait on a hidden page, which may never run again.
    expect(reportUiError).toHaveBeenCalledExactlyOnceWith(failure);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reportUiError).toHaveBeenCalledOnce();
  });

  it("should hand a failure only Vite's preloader reported to the tracker when the page is hidden into the back/forward cache", async () => {
    const { installStaleBuildRecovery } = await load();
    stubServer(deployedBuildId);
    uninstall = installStaleBuildRecovery();
    const failure = new TypeError('Failed to fetch dynamically imported module: /assets/a-1.js');

    globalThis.dispatchEvent(Object.assign(new Event('vite:preloadError'), { payload: failure }));
    globalThis.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));

    expect(reportUiError).toHaveBeenCalledExactlyOnceWith(failure);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reportUiError).toHaveBeenCalledOnce();
  });

  it("should hold the tracker's tag until a covered failure is decided again, even when every lookup is as slow as allowed", async () => {
    const { installStaleBuildRecovery, readStaleBuildOutcome, classifyStaleBuildFailure, staleBuildTagWait } =
      await load();
    const { liveBuildIdTimeout } = await import('#lib/build-identity.js');
    let served = deployedBuildId;
    // Each answer arrives just inside the request timeout.
    vi.stubGlobal('fetch', async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, liveBuildIdTimeout - 1);
      });
      return Response.json({ buildId: served });
    });
    stubReload();
    uninstall = installStaleBuildRecovery();
    const failure = new TypeError('Importing a module script failed.');

    globalThis.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: failure }));
    const tag = classifyStaleBuildFailure(failure);
    // The decision's own lookup (an answer and two confirmations) ends in a reload; then the server names this build.
    await vi.advanceTimersByTimeAsync(3 * liveBuildIdTimeout + 2 * lookupConfirmDelay);
    expect(readStaleBuildOutcome(failure)).toBe('reloading');
    served = ownBuildId;
    await vi.advanceTimersByTimeAsync(staleBuildTagWait);

    expect(readStaleBuildOutcome(failure)).toBe('current');
    await expect(tag).resolves.toBe('current');
  });

  it('should treat a page kept in the back/forward cache as not gone, and decide what its reload covered again', async () => {
    const { installStaleBuildRecovery, readStaleBuildOutcome, readReloadState, reloadTimeout } = await load();
    const fetchMock = stubServer(deployedBuildId);
    stubReload();
    uninstall = installStaleBuildRecovery();
    const failure = new TypeError('Importing a module script failed.');

    globalThis.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: failure }));
    await settle();
    globalThis.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    globalThis.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    fetchMock.mockImplementation(async () => Response.json({ buildId: ownBuildId }));
    await vi.advanceTimersByTimeAsync(reloadTimeout + lookupConfirmDelay * 3);

    expect(readReloadState()).toBe('idle');
    expect(readStaleBuildOutcome(failure)).toBe('current');
  });

  it("should end quietly when the error tracker's own chunk fails on the live build (a content blocker)", async () => {
    const { recoverFromSdkLoadFailure, readStaleBuildOutcome, subscribeGenuineFailures } = await load();
    stubServer(ownBuildId);
    const heard: unknown[] = [];
    const unsubscribe = subscribeGenuineFailures((failure) => {
      heard.push(failure);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = new TypeError('Importing a module script failed.');
    const again = new TypeError('Importing a module script failed.');

    recoverFromSdkLoadFailure(new Error('Failed to load the SDK', { cause: first }));
    await settle();
    recoverFromSdkLoadFailure(again);
    await settle();

    expect(readStaleBuildOutcome(first)).toBe('current');
    expect(reportUiError).not.toHaveBeenCalled();
    expect(heard).toStrictEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it.each([
    ['the live build (a content blocker)', 'own'],
    ['a deploy that stopped serving it', 'deployed'],
  ] as const)(
    "should never report the error tracker's own chunk failing on %s, though Vite's preloader reported it first",
    async (_case, served) => {
      const { installStaleBuildRecovery, recoverFromSdkLoadFailure, subscribeGenuineFailures } = await load();
      stubServer(served === 'own' ? ownBuildId : deployedBuildId);
      stubReload();
      uninstall = installStaleBuildRecovery();
      const heard: unknown[] = [];
      const unsubscribe = subscribeGenuineFailures((failure) => {
        heard.push(failure);
      });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const blocked = new TypeError('Failed to fetch dynamically imported module: /assets/sentry.lib-1.js');

      // Vite's preload helper wraps the SDK's import: it dispatches the failure, then rethrows it into the loader.
      globalThis.dispatchEvent(Object.assign(new Event('vite:preloadError'), { payload: blocked }));
      recoverFromSdkLoadFailure(blocked);
      await settle();
      await vi.advanceTimersByTimeAsync(2000);
      globalThis.dispatchEvent(new Event('pagehide'));

      expect(reportUiError).not.toHaveBeenCalled();
      expect(heard).toStrictEqual([]);
      expect(warn).toHaveBeenCalledTimes(served === 'own' ? 1 : 0);
      unsubscribe();
    },
  );

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
