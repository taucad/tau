// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const ownBuildId = 1_792_726_000_000;
const deployedBuildId = 1_792_730_113_029;

vi.mock('#filesystem/build-skew.js', () => ({ buildId: ownBuildId, markBuildSuperseded: vi.fn() }));

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

let uninstall: (() => void) | undefined;

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  sessionStorage.clear();
  vi.unstubAllGlobals();
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

    expect(fetchMock).toHaveBeenCalledWith('/health/build', { cache: 'no-store', credentials: 'omit' });
    expect(reload).toHaveBeenCalledOnce();
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
