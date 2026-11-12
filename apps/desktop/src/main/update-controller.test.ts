import { describe, expect, it, vi } from 'vitest';
import { startPlatformUpdateController } from '#main/update-controller.js';
import type { PlatformUpdateBackend, PlatformUpdateOptions } from '#main/update-controller.js';

const setup = () => {
  const commit = vi.fn();
  const release = vi.fn();
  const backend: PlatformUpdateBackend = {
    systemManaged: false,
    check: vi.fn(async () => ({
      version: '0.2.0',
      tag: 'desktop@0.2.0',
      releasePage: 'https://github.com/taucad/tau/releases/tag/desktop%400.2.0',
    })),
    download: vi.fn(async () => undefined),
    prepare: vi.fn(async () => ({ commit, release })),
    finish: vi.fn(),
  };
  const options: PlatformUpdateOptions = {
    platform: 'win32',
    arch: 'x64',
    currentVersion: '0.1.0',
    packaged: true,
    environment: {},
    autoUpdater: { on: vi.fn(), setFeedURL: vi.fn(), checkForUpdates: vi.fn(), quitAndInstall: vi.fn() },
    fetchJson: vi.fn(),
    prepareToRestart: vi.fn(),
    prepareToInstall: vi.fn(async (action: () => void | Promise<void>) => {
      await action();
      return true;
    }),
    openExternal: vi.fn(),
    log: vi.fn(),
    schedule: vi.fn(),
    retry: vi.fn(),
  };
  return { backend, options, commit, release };
};
describe('platform update consent', () => {
  it('installs a normal-feed qualification candidate only after exact expected identity', async () => {
    const { backend, options, commit } = setup();
    const updater = startPlatformUpdateController(
      {
        ...options,
        installForProbe: true,
        expectedUpdate: { tag: 'desktop@0.2.0', version: '0.2.0', sourceCommit: 'a'.repeat(40) },
      },
      backend,
    );
    await updater.check();
    await vi.waitFor(() => {
      expect(backend.finish).toHaveBeenCalledOnce();
    });
    expect(commit).toHaveBeenCalledOnce();
  });
  it('refuses a normal-feed version different from the qualification target before download', async () => {
    const { backend, options, commit } = setup();
    const updater = startPlatformUpdateController(
      {
        ...options,
        installForProbe: true,
        expectedUpdate: { tag: 'desktop@0.3.0', version: '0.3.0', sourceCommit: 'a'.repeat(40) },
      },
      backend,
    );
    await updater.check();
    expect(updater.snapshot().phase).toBe('error');
    expect(backend.download).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
  it('downloads automatically but installs only after explicit consent and save admission', async () => {
    const { backend, options, commit, release } = setup();
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    expect(updater.snapshot()).toMatchObject({ phase: 'ready', installOnQuit: false });
    expect(commit).not.toHaveBeenCalled();
    expect(backend.finish).not.toHaveBeenCalled();
    await updater.install();
    expect(options.prepareToInstall).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(backend.finish).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(options.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });
  it('installs when the download finishes after a request made while it was downloading', async () => {
    const { backend, options, commit } = setup();
    const downloading = Promise.withResolvers<undefined>();
    backend.download = vi.fn(async () => downloading.promise);
    const updater = startPlatformUpdateController(options, backend);
    await vi.waitFor(() => {
      expect(updater.snapshot().phase).toBe('downloading');
    });
    const requested = updater.install();
    expect(updater.snapshot()).toMatchObject({ phase: 'downloading', installWhenReady: true });
    expect(commit).not.toHaveBeenCalled();
    downloading.resolve(undefined);
    await requested;
    await vi.waitFor(() => {
      expect(backend.finish).toHaveBeenCalledOnce();
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(backend.download).toHaveBeenCalledOnce();
    expect(updater.snapshot().installWhenReady).toBeUndefined();
  });
  it('takes a failed update to installed from a single retry request, and drops the request on failure', async () => {
    const { backend, options, commit } = setup();
    const retry = vi.fn();
    backend.check = vi
      .fn<PlatformUpdateBackend['check']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ version: '0.2.0', tag: 'desktop@0.2.0', releasePage: 'https://example.test/release' });
    const updater = startPlatformUpdateController({ ...options, retry }, backend);
    await vi.waitFor(() => {
      expect(updater.snapshot().phase).toBe('error');
    });
    expect(retry).toHaveBeenCalledOnce();
    expect(retry.mock.calls[0]?.[1]).toBe(15_000);

    await updater.install();
    expect(updater.snapshot().phase).toBe('error');
    expect(updater.snapshot().installWhenReady).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();

    await updater.install();
    await vi.waitFor(() => {
      expect(backend.finish).toHaveBeenCalledOnce();
    });
    expect(commit).toHaveBeenCalledOnce();
  });
  it('holds no restart request for an APT-managed installation', async () => {
    const { backend, options } = setup();
    Object.defineProperty(backend, 'systemManaged', { value: true });
    backend.check = vi.fn(async () => undefined);
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    await updater.install();
    expect(updater.snapshot().phase).toBe('system-managed');
    expect(updater.snapshot().installWhenReady).toBeUndefined();
    expect(backend.prepare).not.toHaveBeenCalled();
  });
  it('save rejection leaves the prepared candidate untouched and releases its lease', async () => {
    const { backend, options, commit, release } = setup();
    vi.spyOn(options, 'prepareToInstall').mockResolvedValue(false);
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    await updater.install();
    expect(commit).not.toHaveBeenCalled();
    expect(backend.finish).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(updater.snapshot().phase).toBe('restart-blocked');
  });
  it('a recovered commit failure clears readiness so expired metadata can be checked again', async () => {
    const { backend, options, commit } = setup();
    commit.mockRejectedValueOnce(new Error('descriptor expired'));
    vi.spyOn(options, 'prepareToInstall').mockImplementation(async (action) => {
      try {
        await action();
        return true;
      } catch {
        return false;
      }
    });
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    await updater.install();
    expect(updater.snapshot().phase).toBe('error');
    expect(backend.finish).not.toHaveBeenCalled();
    await updater.check();
    expect(backend.check).toHaveBeenCalledTimes(2);
  });
  it('preflight failure never enters shutdown', async () => {
    const { backend, options } = setup();
    backend.prepare = vi.fn(async () => {
      throw new Error('hash changed');
    });
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    await updater.install();
    expect(options.prepareToInstall).not.toHaveBeenCalled();
    expect(backend.finish).not.toHaveBeenCalled();
  });
  it('asynchronous commit failure does not quit and can retry', async () => {
    const { backend, options, commit, release } = setup();
    commit.mockRejectedValueOnce(new Error('spawn failed'));
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    await updater.install();
    expect(backend.finish).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    await updater.install();
    expect(backend.finish).toHaveBeenCalledOnce();
  });
  it('an asynchronous restart failure pauses the restart instead of finishing quietly', async () => {
    const { backend, options, release } = setup();
    backend.finish = vi.fn(async () => {
      throw new Error('spawn EAGAIN');
    });
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    await updater.install();
    expect(updater.snapshot()).toMatchObject({ phase: 'restart-blocked' });
    expect(updater.snapshot().detail).toContain('spawn EAGAIN');
    expect(release).toHaveBeenCalledOnce();
  });
  it('APT describes system policy truthfully and never downloads package files', async () => {
    const { backend, options } = setup();
    Object.defineProperty(backend, 'systemManaged', { value: true });
    backend.check = vi.fn(async () => undefined);
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    expect(updater.snapshot().phase).toBe('system-managed');
    expect(updater.status()).toContain('administrator');
    expect(backend.download).not.toHaveBeenCalled();
  });
});

describe('a newer release replaces a pending one', () => {
  const release = (version: string) => ({
    version,
    tag: `desktop@${version}`,
    releasePage: `https://github.com/taucad/tau/releases/tag/desktop%40${version}`,
  });
  /** A backend whose latest release the test moves. */
  const moving = () => {
    const base = setup();
    const state = { version: '0.2.0' };
    base.backend.check = vi.fn<PlatformUpdateBackend['check']>(async () => release(state.version));
    return { ...base, state };
  };

  it('downloads a newer release over a ready one without reopening the card or installing', async () => {
    const { backend, options, state, commit } = moving();
    const phases: string[] = [];
    const updater = startPlatformUpdateController(
      {
        ...options,
        onState: (snapshot) => {
          phases.push(snapshot.phase);
        },
      },
      backend,
    );
    await updater.check();
    expect(updater.snapshot()).toMatchObject({ phase: 'ready', version: '0.2.0' });

    state.version = '0.3.0';
    phases.length = 0;
    expect(await updater.check()).toMatchObject({ version: '0.3.0' });
    expect(phases).toEqual(['downloading', 'ready']);
    expect(updater.snapshot()).toMatchObject({ phase: 'ready', version: '0.3.0', requestId: 0 });
    expect(updater.snapshot().releasePage).toContain('desktop%400.3.0');
    expect(backend.download).toHaveBeenCalledTimes(2);
    expect(commit).not.toHaveBeenCalled();
    expect(options.retry).not.toHaveBeenCalled();
  });

  it('holds a restart asked during the replacement and installs the newer release', async () => {
    const { backend, options, state, commit } = moving();
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    state.version = '0.3.0';
    const replacing = Promise.withResolvers<undefined>();
    backend.download = vi.fn(async () => replacing.promise);
    const checked = updater.check();
    await vi.waitFor(() => {
      expect(updater.snapshot()).toMatchObject({ phase: 'downloading', version: '0.3.0' });
    });

    /* The downloader has dropped the 0.2.0 file, so Restart now cannot install it. */
    const requested = updater.install();
    expect(updater.snapshot()).toMatchObject({ phase: 'downloading', installWhenReady: true });
    expect(backend.prepare).not.toHaveBeenCalled();
    replacing.resolve(undefined);
    await Promise.all([checked, requested]);
    await vi.waitFor(() => {
      expect(backend.finish).toHaveBeenCalledOnce();
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(backend.check).toHaveBeenCalledTimes(2);
  });

  it('answers a check asked during a download when it finishes, before a held restart', async () => {
    const { backend, options, state, commit } = moving();
    const downloads = [Promise.withResolvers<undefined>(), Promise.withResolvers<undefined>()];
    backend.download = vi
      .fn<PlatformUpdateBackend['download']>()
      .mockImplementationOnce(async () => downloads[0]?.promise)
      .mockImplementationOnce(async () => downloads[1]?.promise);
    const updater = startPlatformUpdateController(options, backend);
    await vi.waitFor(() => {
      expect(updater.snapshot().phase).toBe('downloading');
    });
    const requested = updater.install();
    state.version = '0.3.0';
    const checked = updater.check();
    expect(backend.check).toHaveBeenCalledOnce();

    downloads[0]?.resolve(undefined);
    await vi.waitFor(() => {
      expect(updater.snapshot()).toMatchObject({ phase: 'downloading', version: '0.3.0', installWhenReady: true });
    });
    expect(commit).not.toHaveBeenCalled();
    downloads[1]?.resolve(undefined);
    await Promise.all([checked, requested]);
    await vi.waitFor(() => {
      expect(backend.finish).toHaveBeenCalledOnce();
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(backend.download).toHaveBeenCalledTimes(2);
  });

  it('a restart asked during a download does not by itself look for a newer release', async () => {
    const { backend, options, state } = moving();
    const downloading = Promise.withResolvers<undefined>();
    backend.download = vi.fn(async () => downloading.promise);
    const updater = startPlatformUpdateController(options, backend);
    await vi.waitFor(() => {
      expect(updater.snapshot().phase).toBe('downloading');
    });
    const requested = updater.install();
    state.version = '0.3.0';
    downloading.resolve(undefined);
    await requested;
    await vi.waitFor(() => {
      expect(backend.finish).toHaveBeenCalledOnce();
    });
    expect(backend.check).toHaveBeenCalledOnce();
    expect(backend.download).toHaveBeenCalledOnce();
  });

  it('keeps the pending release when the check fails, repeats it, or names an older one', async () => {
    const { backend, options, state } = moving();
    state.version = '0.3.0';
    const onState = vi.fn();
    const updater = startPlatformUpdateController({ ...options, onState }, backend);
    await updater.check();
    const ready = updater.snapshot();
    onState.mockClear();

    /* Never a downgrade: 0.2.0 is newer than the running 0.1.0 but older than the pending 0.3.0. */
    for (const version of ['0.3.0', '0.2.0']) {
      state.version = version;
      // oxlint-disable-next-line no-await-in-loop -- Checks are serialized; each answer is read in turn.
      expect(await updater.check()).toMatchObject({ version: '0.3.0' });
    }
    vi.mocked(backend.check).mockResolvedValueOnce(undefined);
    expect(await updater.check()).toMatchObject({ version: '0.3.0' });
    vi.mocked(backend.check).mockRejectedValueOnce(new Error('offline'));
    expect(await updater.check()).toMatchObject({ version: '0.3.0' });

    expect(updater.snapshot()).toEqual(ready);
    expect(onState).not.toHaveBeenCalled();
    expect(backend.download).toHaveBeenCalledOnce();
    expect(options.retry).not.toHaveBeenCalled();
    expect(options.log).not.toHaveBeenCalledWith('warn', 'updater.error', expect.anything());
    expect(options.log).toHaveBeenCalledWith('info', 'updater.supersede-check-failed', { message: 'offline' });
  });

  it('never replaces the release a qualification is pinned to', async () => {
    const { backend, options, state } = moving();
    const updater = startPlatformUpdateController(
      { ...options, expectedUpdate: { tag: 'desktop@0.2.0', version: '0.2.0', sourceCommit: 'a'.repeat(40) } },
      backend,
    );
    await updater.check();
    state.version = '0.3.0';
    await updater.check();
    expect(updater.snapshot()).toMatchObject({ phase: 'ready', version: '0.2.0' });
    expect(backend.check).toHaveBeenCalledOnce();
    expect(backend.download).toHaveBeenCalledOnce();
  });

  it('never replaces an update while Tau saves or restarts into it', async () => {
    const { backend, options, state, commit } = moving();
    const saving = Promise.withResolvers<boolean>();
    vi.spyOn(options, 'prepareToInstall').mockImplementation(async (action) => {
      const admitted = await saving.promise;
      await action();
      return admitted;
    });
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();

    /* A check already running when the restart starts must not act on its answer. */
    const answer = Promise.withResolvers<ReturnType<typeof release>>();
    vi.mocked(backend.check).mockImplementationOnce(async () => answer.promise);
    const reading = updater.check();
    const installation = updater.install();
    answer.resolve(release('0.3.0'));
    await reading;

    state.version = '0.3.0';
    await updater.check();
    expect(backend.check).toHaveBeenCalledTimes(2);
    expect(backend.download).toHaveBeenCalledOnce();

    saving.resolve(true);
    await installation;
    expect(commit).toHaveBeenCalledOnce();
    expect(backend.finish).toHaveBeenCalledOnce();
    await updater.check();
    await updater.install();
    expect(backend.check).toHaveBeenCalledTimes(2);
    expect(backend.download).toHaveBeenCalledOnce();
    expect(backend.finish).toHaveBeenCalledOnce();
    expect(updater.snapshot()).toMatchObject({ phase: 'restarting', version: '0.2.0' });
  });

  it('treats a failed replacement as a failed update: nothing is left to install', async () => {
    const { backend, options, state } = moving();
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    state.version = '0.3.0';
    vi.mocked(backend.download).mockRejectedValueOnce(new Error('sha512 checksum mismatch'));
    expect(await updater.check()).toBeUndefined();
    expect(updater.snapshot()).toMatchObject({ phase: 'error' });
    expect(options.retry).toHaveBeenCalledOnce();

    await updater.install();
    await vi.waitFor(() => {
      expect(backend.finish).toHaveBeenCalledOnce();
    });
    expect(backend.download).toHaveBeenCalledTimes(3);
  });

  it('follows APT to a newer runtime while one is already waiting, with nothing to download', async () => {
    const { backend, options, state } = moving();
    Object.defineProperty(backend, 'systemManaged', { value: true });
    const updater = startPlatformUpdateController(options, backend);
    await updater.check();
    expect(updater.snapshot()).toMatchObject({ phase: 'ready', version: '0.2.0' });
    state.version = '0.3.0';
    await updater.check();
    expect(updater.snapshot()).toMatchObject({ phase: 'ready', version: '0.3.0' });
    expect(backend.download).not.toHaveBeenCalled();
  });
});
