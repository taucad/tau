// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ownBuildId = 1_792_726_000_000;
const deployedBuildId = 1_792_730_113_029;

vi.mock('#filesystem/build-skew.js', () => ({
  buildId: ownBuildId,
  markBuildSuperseded: vi.fn(),
  recordLiveBuild: vi.fn(),
}));

/** Fresh module state per test: the page recovery and its interaction flag live at module scope. */
const load = async () => {
  vi.resetModules();
  return import('#lib/stale-build-recovery.js');
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
    setTimeout(resolve, 0);
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
      const { installStaleBuildRecovery } = await load();
      const { markBuildSuperseded } = await import('#filesystem/build-skew.js');
      stubServer(deployedBuildId);
      const reload = stubReload();
      uninstall = installStaleBuildRecovery();

      globalThis.dispatchEvent(new Event(type));
      rejectWithStaleModule();
      await settle();

      expect(reload).not.toHaveBeenCalled();
      expect(markBuildSuperseded).toHaveBeenCalledWith(deployedBuildId, 'server');
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
    sessionStorage.setItem('tau-stale-build-reload', `${String(ownBuildId - 1)}>${String(ownBuildId)}`);
    const { installStaleBuildRecovery } = await load();

    uninstall = installStaleBuildRecovery();

    expect(sessionStorage.getItem('tau-stale-build-reload')).toBeNull();
  });
});
