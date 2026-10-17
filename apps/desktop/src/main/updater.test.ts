import { describe, expect, it, vi } from 'vitest';

import type { DesktopUpdaterOptions, SquirrelUpdater } from '#main/updater.js';
import { availableUpdate, isNewerVersion, startDesktopUpdater, updateFeedUrl, updateSource } from '#main/updater.js';

const feed = (version: string, tag = `desktop@${version}`, platform = 'darwin'): unknown => ({
  currentRelease: version,
  releases: [
    {
      version,
      updateTo: {
        version,
        name: tag,
        url: `${tag.startsWith('desktop-staging@') ? 'https://downloads.taucad.dev' : 'https://downloads.tau.new'}/releases/${encodeURIComponent(tag)}/${platform === 'darwin' ? 'Tau-macos-arm64.zip' : 'Tau-linux-x64.tar.gz'}`,
      },
    },
  ],
});

type FakeSquirrel = SquirrelUpdater & { listeners: Map<string, (error?: Error) => void> };

const squirrel = (): FakeSquirrel => {
  const listeners = new Map<string, (error?: Error) => void>();
  const fake: FakeSquirrel = {
    listeners,
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, listener: (error?: Error) => void) => listeners.set(event, listener)),
  };
  return fake;
};

const options = (overrides: Partial<DesktopUpdaterOptions> = {}): DesktopUpdaterOptions => ({
  platform: 'darwin',
  arch: 'arm64',
  currentVersion: '0.2.0',
  packaged: true,
  environment: {},
  autoUpdater: squirrel(),
  fetchJson: vi.fn(async () => feed('0.3.0')),
  prepareToRestart: vi.fn(async () => true),
  openExternal: vi.fn(async () => undefined),
  log: vi.fn(),
  schedule: vi.fn(),
  ...overrides,
});

describe('isNewerVersion', () => {
  it('orders release versions numerically', () => {
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('0.9.0', '0.10.0')).toBe(false);
  });

  it('never treats a malformed or prerelease version as newer', () => {
    expect(isNewerVersion('1.0.0-beta.1', '0.1.0')).toBe(false);
    expect(isNewerVersion('2.0.0', 'dev')).toBe(false);
  });
});

describe('availableUpdate', () => {
  it('offers a newer release with its encoded release page', () => {
    expect(availableUpdate(feed('0.3.0'), '0.2.0')).toEqual({
      version: '0.3.0',
      tag: 'desktop@0.3.0',
      releasePage: 'https://github.com/taucad/tau/releases/tag/desktop%400.3.0',
    });
  });

  it('offers nothing for the same or an older release, or a malformed feed', () => {
    expect(availableUpdate(feed('0.2.0'), '0.2.0')).toBeUndefined();
    expect(availableUpdate(feed('0.1.0'), '0.2.0')).toBeUndefined();
    expect(() => availableUpdate({ currentRelease: '0.3.0', releases: [] }, '0.2.0')).toThrow(TypeError);
    expect(() => availableUpdate('not a feed', '0.2.0')).toThrow();
  });
});

describe('updateFeedUrl', () => {
  it('should read the platform feed from the channel R2 pointer', () => {
    expect(updateFeedUrl('win32', 'x64')).toBe('https://downloads.tau.new/latest/desktop-update-win32-x64.json');
  });
});

describe('managed update source', () => {
  const mirror = 'https://mirror.example/tau';
  const mirrored = (version: string): unknown => ({
    currentRelease: version,
    releases: [
      {
        version,
        updateTo: {
          version,
          name: `desktop@${version}`,
          url: `${mirror}/releases/${encodeURIComponent(`desktop@${version}`)}/Tau-macos-arm64.zip`,
        },
      },
    ],
  });

  it('should read the public origin unless managed, and never fall back from a managed setting', () => {
    expect(updateSource({}, 'production')).toEqual({ kind: 'origin', origin: 'https://downloads.tau.new' });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
    expect(updateSource({ TAU_DESKTOP_UPDATE_FEED: `${mirror}/` }, 'production')).toEqual({
      kind: 'origin',
      origin: mirror,
    });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
    expect(updateSource({ TAU_ACQUISITION: 'locked', TAU_DESKTOP_UPDATE_FEED: mirror }, 'staging')).toEqual({
      kind: 'origin',
      origin: mirror,
    });
    for (const value of [
      'not a url',
      'http://mirror.example',
      'https://user:pw@mirror.example',
      'https://mirror.example/?x=1',
    ]) {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
      expect(updateSource({ TAU_DESKTOP_UPDATE_FEED: value }, 'production').kind).toBe('disabled');
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
    expect(updateSource({ TAU_DESKTOP_UPDATES: 'off', TAU_DESKTOP_UPDATE_FEED: mirror }, 'production').kind).toBe(
      'disabled',
    );
  });

  it('should explain why a managed desktop does not update', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
    const updater = startDesktopUpdater(options({ environment: { TAU_ACQUISITION: 'locked' } }));
    expect(updater.snapshot().phase).toBe('disabled');
    expect(updater.status()).toContain('TAU_DESKTOP_UPDATE_FEED');
  });

  it('should check, validate and download only from the mirror', async () => {
    const autoUpdater = squirrel();
    const fetchJson = vi.fn(async () => mirrored('0.3.0'));
    const updater = startDesktopUpdater(
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
      options({ autoUpdater, fetchJson, environment: { TAU_DESKTOP_UPDATE_FEED: mirror } }),
    );

    await expect(updater.check()).resolves.toMatchObject({ version: '0.3.0', tag: 'desktop@0.3.0' });
    expect(fetchJson).toHaveBeenCalledWith(`${mirror}/latest/desktop-update-darwin-arm64.json`);
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      url: `${mirror}/releases/desktop%400.3.0/desktop-update-darwin-arm64.json`,
      serverType: 'json',
    });
  });

  it('should refuse a mirrored feed that still names the public archive', async () => {
    const autoUpdater = squirrel();
    const updater = startDesktopUpdater(
      options({
        autoUpdater,
        fetchJson: vi.fn(async () => feed('0.3.0')),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
        environment: { TAU_DESKTOP_UPDATE_FEED: mirror },
      }),
    );

    await expect(updater.check()).resolves.toBeUndefined();
    expect(updater.snapshot().phase).toBe('error');
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled();
  });
});

describe('startDesktopUpdater', () => {
  it.each([
    ['unpackaged', { packaged: false }],
    ['ad-hoc package', { updatesEnabled: false }],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
    ['switched off', { environment: { TAU_DESKTOP_UPDATES: 'off' } }],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
    ['locked without a mirror', { environment: { TAU_ACQUISITION: 'locked' } }],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
    ['given a plain-HTTP mirror', { environment: { TAU_DESKTOP_UPDATE_FEED: 'http://mirror.example/tau' } }],
  ] as const)('does nothing when %s', async (_case, overrides) => {
    const disabled = options(overrides);
    const updater = startDesktopUpdater(disabled);
    expect(await updater.check()).toBeUndefined();
    expect(disabled.fetchJson).not.toHaveBeenCalled();
    expect(disabled.autoUpdater.setFeedURL).not.toHaveBeenCalled();
  });

  it('should download quietly and restart only after an explicit install', async () => {
    const autoUpdater = squirrel();
    const updater = startDesktopUpdater(options({ autoUpdater, schedule: vi.fn() }));
    await updater.check();
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      url: 'https://downloads.tau.new/releases/desktop%400.3.0/desktop-update-darwin-arm64.json',
      serverType: 'json',
    });
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    autoUpdater.listeners.get('update-downloaded')?.();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(updater.snapshot().phase).toBe('ready');
    await updater.install();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('never starts a Squirrel download for a release that is not newer', async () => {
    const autoUpdater = squirrel();
    const updater = startDesktopUpdater(options({ autoUpdater, fetchJson: vi.fn(async () => feed('0.2.0')) }));
    expect(await updater.check()).toBeUndefined();
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('offers the release page on Linux and Windows instead of installing', async () => {
    const openExternal = vi.fn(async () => undefined);
    const autoUpdater = squirrel();
    const updater = startDesktopUpdater(
      options({
        platform: 'linux',
        arch: 'x64',
        autoUpdater,
        openExternal,
        fetchJson: async () => feed('0.3.0', 'desktop@0.3.0', 'linux'),
      }),
    );
    await updater.check();
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
    expect(updater.snapshot().phase).toBe('available');
    await updater.download();
    expect(openExternal).toHaveBeenCalledWith(
      'https://downloads.tau.new/releases/desktop%400.3.0/Tau-linux-x64.tar.gz',
    );
  });

  it('logs a feed failure and keeps running', async () => {
    const log = vi.fn();
    const updater = startDesktopUpdater(
      options({
        log,
        fetchJson: vi.fn(async () => {
          throw new Error('offline');
        }),
      }),
    );
    expect(await updater.check()).toBeUndefined();
    expect(updater.status()).toContain('offline');
    expect(log).toHaveBeenCalledWith(
      'warn',
      'updater.error',
      expect.objectContaining({ message: expect.stringContaining('offline') as unknown }),
    );
  });
});

describe('staging and restart safety', () => {
  it('should enable staging without ever accepting production metadata', async () => {
    const config = options({
      channel: 'staging',
      currentVersion: '1.0.15',
      fetchJson: async () => feed('1.0.16', 'desktop-staging@0.0.1-staging.16'),
    });
    await startDesktopUpdater(config).check();
    expect(config.autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    expect(() =>
      availableUpdate(feed('2.0.0'), '1.0.15', { channel: 'staging', platform: 'darwin', arch: 'arm64' }),
    ).toThrow('disagree');
    expect(() => startDesktopUpdater(options({ candidateTag: 'desktop-staging@0.0.1-staging.16' }))).toThrow(
      'installed channel',
    );
  });

  it('should refuse a feed whose archive or nested version disagrees', () => {
    const updateTo = { version: '0.3.0', name: 'desktop@0.3.0', url: 'https://evil.test/app.zip' };
    expect(() =>
      availableUpdate({ currentRelease: '0.3.0', releases: [{ version: '0.3.0', updateTo }] }, '0.2.0'),
    ).toThrow('disagree');
    expect(() =>
      availableUpdate(feed('1.0.16', 'desktop-staging@0.0.1-staging.17'), '1.0.15', {
        channel: 'staging',
        platform: 'darwin',
        arch: 'arm64',
      }),
    ).toThrow('disagree');
  });

  it('should retry the same version after a native error and serialize checks', async () => {
    const autoUpdater = squirrel();
    const updater = startDesktopUpdater(options({ autoUpdater }));
    await Promise.all([updater.check(), updater.check()]);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    autoUpdater.listeners.get('error')?.(new Error('download interrupted'));
    await updater.check();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('should retry a native failure even after a download completed', async () => {
    const autoUpdater = squirrel();
    const updater = startDesktopUpdater(options({ autoUpdater }));
    await updater.check();
    autoUpdater.listeners.get('update-downloaded')?.();
    autoUpdater.listeners.get('error')?.(new Error('download validation failed'));
    await updater.check();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('should wait for saving and preserve cancellation before closing windows', async () => {
    const autoUpdater = squirrel();
    const saving = Promise.withResolvers<boolean>();
    const prepareToRestart = vi.fn(async () => saving.promise);
    const updater = startDesktopUpdater(options({ autoUpdater, prepareToRestart }));
    await updater.check();
    autoUpdater.listeners.get('update-downloaded')?.();
    const installation = updater.install();
    expect(updater.snapshot().phase).toBe('saving');
    await updater.install();
    await vi.waitFor(() => {
      expect(prepareToRestart).toHaveBeenCalledOnce();
    });
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    saving.resolve(false);
    await installation;
    expect(updater.snapshot().phase).toBe('restart-blocked');
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    prepareToRestart.mockResolvedValue(true);
    await vi.waitFor(async () => {
      await updater.install();
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
    });
  });
});

describe('quiet update snapshots', () => {
  it('should retain pending readiness across checks and reveal only manual requests', async () => {
    const autoUpdater = squirrel();
    const onState = vi.fn();
    const updater = startDesktopUpdater(options({ autoUpdater, onState }));
    await updater.check();
    autoUpdater.listeners.get('update-downloaded')?.();
    const ready = updater.snapshot();
    expect(ready).toMatchObject({ phase: 'ready', requestId: 0, version: '0.3.0' });
    await updater.check();
    expect(updater.snapshot()).toEqual(ready);
    await updater.check(true);
    expect(updater.snapshot()).toMatchObject({ phase: 'ready', requestId: 1 });
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(onState).toHaveBeenLastCalledWith(updater.snapshot());
  });
  it('should preserve automated installation only for a bounded candidate probe', async () => {
    const autoUpdater = squirrel();
    const updater = startDesktopUpdater(options({ autoUpdater, installForProbe: true, candidateTag: 'desktop@0.3.0' }));
    await updater.check();
    autoUpdater.listeners.get('update-downloaded')?.();
    await vi.waitFor(() => {
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
    });
  });
});
