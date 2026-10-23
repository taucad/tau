// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStaleBuildRecovery, isStaleModuleError, staleBuildReloadKey } from '#lib/stale-build-recovery.js';

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

const setup = (overrides: Partial<Parameters<typeof createStaleBuildRecovery>[0]> = {}) => {
  const storage = createStorage();
  const reload = vi.fn();
  const onSuperseded = vi.fn();
  const onLiveBuild = vi.fn();
  const fetchServerBuildId = vi.fn(async (): Promise<number | undefined> => deployedBuildId);
  const recovery = createStaleBuildRecovery({
    buildId: ownBuildId,
    fetchServerBuildId,
    storage,
    reload,
    onSuperseded,
    onLiveBuild,
    canReloadSafely: () => true,
    ...overrides,
  });
  return { storage, reload, onSuperseded, onLiveBuild, fetchServerBuildId, recovery };
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

  it('should record the live build before it reloads, so a rollback is worded right meanwhile', async () => {
    const { recovery, reload, onLiveBuild } = setup();

    await recovery.recover(failure());

    expect(onLiveBuild).toHaveBeenCalledWith(deployedBuildId);
    expect(onLiveBuild.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0] ?? 0);
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

  it('should offer the reload when the page is still here after the reload should have happened', async () => {
    vi.useFakeTimers();
    const { recovery, reload, onSuperseded } = setup({ reloadTimeout: 5000 });

    await expect(recovery.recover(failure())).resolves.toBe('reloading');
    expect(onSuperseded).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);

    expect(onSuperseded).toHaveBeenCalledWith(deployedBuildId);
    await expect(recovery.recover(failure())).resolves.toBe('superseded');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should clear the guard of a refused reload, since no loop happened', async () => {
    vi.useFakeTimers();
    const { recovery, storage } = setup({ reloadTimeout: 5000 });

    await recovery.recover(failure());
    expect(storage.entries.get(staleBuildReloadKey)).toBe(guardFor(ownBuildId, deployedBuildId));
    await vi.advanceTimersByTimeAsync(5000);

    expect(storage.entries.has(staleBuildReloadKey)).toBe(false);
  });

  describe('classify', () => {
    it('should name a deploy without reloading or superseding anything', async () => {
      const { recovery, reload, onSuperseded } = setup();

      await expect(recovery.classify(failure())).resolves.toBe('superseded');

      expect(reload).not.toHaveBeenCalled();
      expect(onSuperseded).not.toHaveBeenCalled();
    });

    it('should repeat a decision already made for the same failure', async () => {
      const { recovery, fetchServerBuildId } = setup();
      const error = failure();

      await recovery.recover(error);

      await expect(recovery.classify(error)).resolves.toBe('reloading');
      expect(fetchServerBuildId).toHaveBeenCalledOnce();
    });

    it('should classify one failure once, however often it is asked', async () => {
      const { recovery, fetchServerBuildId } = setup();
      const error = failure();

      await recovery.classify(error);
      await recovery.classify(error);

      expect(fetchServerBuildId).toHaveBeenCalledOnce();
    });

    it('should call a failure the live build still has current', async () => {
      const { recovery } = setup({ fetchServerBuildId: async () => ownBuildId });

      await expect(recovery.classify(failure())).resolves.toBe('current');
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
