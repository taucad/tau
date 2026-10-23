// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createStaleBuildRecovery, isStaleModuleError, staleBuildReloadKey } from '#lib/stale-build-recovery.js';

/** In-memory `sessionStorage` stand-in. */
const createStorage = (): Pick<Storage, 'getItem' | 'setItem'> & { readonly entries: Map<string, string> } => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
};

const ownBuildId = 1_792_726_000_000;
const deployedBuildId = 1_792_730_113_029;

const setup = (overrides: Partial<Parameters<typeof createStaleBuildRecovery>[0]> = {}) => {
  const storage = createStorage();
  const reload = vi.fn();
  const onSuperseded = vi.fn();
  const fetchServerBuildId = vi.fn(async (): Promise<number | undefined> => deployedBuildId);
  const recovery = createStaleBuildRecovery({
    buildId: ownBuildId,
    fetchServerBuildId,
    storage,
    reload,
    onSuperseded,
    ...overrides,
  });
  return { storage, reload, onSuperseded, fetchServerBuildId, recovery };
};

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
  it('should reload once and record the attempt when the server runs a different build', async () => {
    const { recovery, reload, storage, onSuperseded } = setup();

    await expect(recovery.recover()).resolves.toBe('reloading');

    expect(reload).toHaveBeenCalledOnce();
    expect(storage.entries.get(staleBuildReloadKey)).toBe(String(ownBuildId));
    expect(onSuperseded).not.toHaveBeenCalled();
  });

  it('should hand over to the update control instead of reloading again for the same build', async () => {
    const { recovery, reload, storage, onSuperseded } = setup();
    storage.setItem(staleBuildReloadKey, String(ownBuildId));

    await expect(recovery.recover()).resolves.toBe('superseded');

    expect(reload).not.toHaveBeenCalled();
    expect(onSuperseded).toHaveBeenCalledWith(deployedBuildId);
  });

  it('should reload again after a later deploy supersedes the build it reloaded into', async () => {
    const { recovery, reload, storage } = setup();
    storage.setItem(staleBuildReloadKey, String(ownBuildId - 1));

    await expect(recovery.recover()).resolves.toBe('reloading');

    expect(reload).toHaveBeenCalledOnce();
  });

  it('should treat a rollback to an older build as a deploy too', async () => {
    const { recovery, reload } = setup({ fetchServerBuildId: async () => ownBuildId - 60_000 });

    await expect(recovery.recover()).resolves.toBe('reloading');

    expect(reload).toHaveBeenCalledOnce();
  });

  it.each([
    ['the server runs this build', async (): Promise<number | undefined> => ownBuildId],
    [
      'the server cannot be reached',
      async (): Promise<number | undefined> => {
        throw new TypeError('offline');
      },
    ],
    ['the server publishes no build id', async (): Promise<number | undefined> => undefined],
  ])('should report a genuine failure when %s', async (_label, fetchServerBuildId) => {
    const { recovery, reload, onSuperseded } = setup({ fetchServerBuildId });

    await expect(recovery.recover()).resolves.toBe('current');

    expect(reload).not.toHaveBeenCalled();
    expect(onSuperseded).not.toHaveBeenCalled();
  });

  it('should never reload a bundle without a build id', async () => {
    const { recovery, reload, fetchServerBuildId } = setup({ buildId: 0 });

    await expect(recovery.recover()).resolves.toBe('current');

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
      },
    });

    await expect(recovery.recover()).resolves.toBe('superseded');

    expect(reload).not.toHaveBeenCalled();
    expect(onSuperseded).toHaveBeenCalledWith(deployedBuildId);
  });

  it('should probe the server once for failures that arrive together', async () => {
    const { recovery, reload, fetchServerBuildId } = setup();

    const outcomes = await Promise.all([recovery.recover(), recovery.recover(), recovery.recover()]);

    expect(outcomes).toStrictEqual(['reloading', 'reloading', 'reloading']);
    expect(fetchServerBuildId).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should probe again for a later failure once the server reported this build', async () => {
    let served = ownBuildId;
    const fetchServerBuildId = vi.fn(async (): Promise<number | undefined> => served);
    const { recovery, reload } = setup({ fetchServerBuildId });

    await expect(recovery.recover()).resolves.toBe('current');
    served = deployedBuildId;
    await expect(recovery.recover()).resolves.toBe('reloading');

    expect(fetchServerBuildId).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledOnce();
  });
});
