import { describe, expect, it, vi } from 'vitest';

import type { DesktopUpdaterOptions, SquirrelUpdater } from '#main/updater.js';
import { availableUpdate, isNewerVersion, startDesktopUpdater, updateFeedUrl } from '#main/updater.js';

const feed = (version: string, tag = `desktop@${version}`): unknown => ({
  currentRelease: version,
  releases: [{ version, updateTo: { version, name: tag, url: `https://example.test/${tag}.zip` } }],
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
  confirm: vi.fn(async () => true),
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
    expect(availableUpdate({ currentRelease: '0.3.0', releases: [] }, '0.2.0')).toBeUndefined();
    expect(availableUpdate('not a feed', '0.2.0')).toBeUndefined();
  });
});

describe('updateFeedUrl', () => {
  it('reads the platform feed from the fixed desktop-feed release, not the Latest badge', () => {
    expect(updateFeedUrl('win32', 'x64')).toBe(
      'https://github.com/taucad/tau/releases/download/desktop-feed/desktop-update-win32-x64.json',
    );
  });
});

describe('startDesktopUpdater', () => {
  it.each([
    ['unpackaged', { packaged: false }],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
    ['switched off', { environment: { TAU_DESKTOP_UPDATES: 'off' } }],
    ['a staging package', { channel: 'staging' }],
  ] as const)('does nothing when %s', async (_case, overrides) => {
    const disabled = options(overrides);
    const updater = startDesktopUpdater(disabled);
    expect(await updater.check()).toBeUndefined();
    expect(disabled.fetchJson).not.toHaveBeenCalled();
    expect(disabled.autoUpdater.setFeedURL).not.toHaveBeenCalled();
  });

  it('lets Squirrel download a newer macOS release and restarts once the person accepts', async () => {
    const autoUpdater = squirrel();
    const updater = startDesktopUpdater(options({ autoUpdater, schedule: vi.fn() }));
    await updater.check();
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      url: 'https://github.com/taucad/tau/releases/download/desktop-feed/desktop-update-darwin-arm64.json',
      serverType: 'json',
    });
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    autoUpdater.listeners.get('update-downloaded')?.();
    await vi.waitFor(() => {
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    });
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
    const updater = startDesktopUpdater(options({ platform: 'linux', arch: 'x64', autoUpdater, openExternal }));
    await updater.check();
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://github.com/taucad/tau/releases/tag/desktop%400.3.0');
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
    expect(log).toHaveBeenCalledWith('warn', 'updater.feed-failed', { message: 'offline' });
  });
});
