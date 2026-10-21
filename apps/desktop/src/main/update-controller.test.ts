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
