// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportUiError = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#lib/error-reporting.js', () => ({ reportUiError }));

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

const settle = async (): Promise<void> => {
  await vi.waitFor(() => {
    expect(globalThis.fetch).toHaveBeenCalled();
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
};

const rejectWithStaleModule = (): void => {
  const event = new Event('unhandledrejection') as PromiseRejectionEvent;
  Object.assign(event, { reason: new TypeError('Importing a module script failed.') });
  globalThis.dispatchEvent(event);
};

let uninstall: (() => void) | undefined;

beforeEach(() => {
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
});

describe('installStaleBuildRecovery', () => {
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

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should leave other errors a boundary caught alone', async () => {
    const { recoverFromCaughtError } = await load();
    const fetchMock = stubServer(deployedBuildId);

    recoverFromCaughtError(new Error('controlled render failure'));
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should leave other rejections alone', async () => {
    const { installStaleBuildRecovery } = await load();
    const fetchMock = stubServer(deployedBuildId);
    uninstall = installStaleBuildRecovery();

    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.assign(event, { reason: new Error('boom') });
    globalThis.dispatchEvent(event);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should clear the guard of a reload that reached this build', async () => {
    const { installStaleBuildRecovery } = await load();
    sessionStorage.setItem('tau-stale-build-reload', `${String(ownBuildId - 1)}>${String(ownBuildId)}`);

    uninstall = installStaleBuildRecovery();

    expect(sessionStorage.getItem('tau-stale-build-reload')).toBeNull();
  });

  it('should report a failure only onCaughtError saw, with no error page, once the rollback ends', async () => {
    const { recoverFromCaughtError, readStaleBuildOutcome, subscribeGenuineFailures, skew } = await load();
    stubServer(ownBuildId - 3_600_000);
    vi.spyOn(performance, 'now').mockReturnValue(60_000);
    const error = new TypeError('Importing a module script failed.');
    const heard: unknown[] = [];

    recoverFromCaughtError(error);
    await settle();
    expect(readStaleBuildOutcome(error)).toBe('superseded');
    expect(reportUiError).not.toHaveBeenCalled();

    // The rollback ends: once the server has named this build as often as the confirmation rule asks.
    stubServer(ownBuildId);
    for (let check = 0; check < skew.serverConfirmations; check += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Each check is its own question, one after the other.
      await skew.queryLiveBuild();
    }
    expect(readStaleBuildOutcome(error)).toBe('superseded');
    const unsubscribe = subscribeGenuineFailures((failure) => {
      heard.push(failure);
    });
    await skew.queryLiveBuild();
    unsubscribe();

    expect(reportUiError.mock.calls).toStrictEqual([[error]]);
    expect(heard).toStrictEqual([error]);
    expect(readStaleBuildOutcome(error)).toBe('current');
    expect(skew.isReloadOffered()).toBe(false);
  });

  it('should re-report nothing when one stale answer names this build during a rollout', async () => {
    const { recoverFromCaughtError, readStaleBuildOutcome, skew } = await load();
    stubServer(deployedBuildId);
    vi.spyOn(performance, 'now').mockReturnValue(60_000);
    const error = new TypeError('Importing a module script failed.');
    recoverFromCaughtError(error);
    await settle();
    expect(readStaleBuildOutcome(error)).toBe('superseded');

    // An edge still answering for the build it is leaving names this one, once.
    stubServer(ownBuildId);
    await skew.queryLiveBuild();
    stubServer(deployedBuildId);
    await skew.queryLiveBuild();

    expect(readStaleBuildOutcome(error)).toBe('superseded');
    expect(skew.readServerVerdict()).toBe('replaced');
    expect(skew.isReloadOffered()).toBe(true);
    expect(reportUiError).not.toHaveBeenCalled();
  });

  it.each([
    ['after the first input', 'input'],
    ['once the auto-reload window has passed', 'window'],
  ])('should stop listening for input %s', async (_label, trigger) => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
  });
});
