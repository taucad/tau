/** Channel-specific desktop updates. macOS installs the verified ZIP through Squirrel.Mac. */
import { z } from 'zod';

import type { DesktopChannel } from '#main/environment.js';
import {
  desktopArchiveName,
  desktopDownloadOrigin,
  desktopReleaseBaseUrl,
  desktopReleaseIdentity,
} from '#shared/desktop-release.js';

export const updateRepository = 'taucad/tau';
/** Milliseconds between background checks. */
export const updateCheckInterval = 4 * 60 * 60 * 1000;

const updateFeedSchema = z.object({
  currentRelease: z.string(),
  releases: z.array(
    z.object({
      version: z.string(),
      updateTo: z.object({ version: z.string(), name: z.string(), url: z.string() }),
    }),
  ),
});

export type AvailableUpdate = { readonly version: string; readonly tag: string; readonly releasePage: string };

export const updateFeedUrl = (platform: string, arch: string, channel: DesktopChannel = 'production'): string =>
  `${desktopDownloadOrigin(channel)}/latest/desktop-update-${platform}-${arch}.json`;

export const isNewerVersion = (candidate: string, current: string): boolean => {
  const pattern = /^(\d+)\.(\d+)\.(\d+)$/u;
  const next = pattern.exec(candidate);
  const now = pattern.exec(current);
  if (!next || !now) {
    return false;
  }
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(next[index]) - Number(now[index]);
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return false;
};

const defaultUpdateTarget = { channel: 'production', platform: 'darwin', arch: 'arm64' } satisfies {
  channel: DesktopChannel;
  platform: string;
  arch: string;
};

/** Refuse inconsistent metadata or a ZIP outside this channel's immutable release directory. */
export const availableUpdate = (
  feed: unknown,
  currentVersion: string,
  target: { channel: DesktopChannel; platform: string; arch: string } = defaultUpdateTarget,
): AvailableUpdate | undefined => {
  const { currentRelease, releases } = updateFeedSchema.parse(feed);
  const release = releases.find(({ version }) => version === currentRelease);
  if (!release) {
    throw new TypeError('Update feed has no matching release');
  }
  const { name: tag, version, url } = release.updateTo;
  const identity = desktopReleaseIdentity(tag);
  if (
    identity.channel !== target.channel ||
    identity.version !== currentRelease ||
    version !== currentRelease ||
    url !== `${desktopReleaseBaseUrl(tag)}/${desktopArchiveName(target.platform, target.arch)}`
  ) {
    throw new TypeError('Update feed channel, version, tag or archive disagree');
  }
  return isNewerVersion(currentRelease, currentVersion)
    ? {
        version: currentRelease,
        tag,
        releasePage: `https://github.com/${updateRepository}/releases/tag/${encodeURIComponent(tag)}`,
      }
    : undefined;
};

export type SquirrelUpdater = {
  setFeedURL(options: { url: string; serverType: 'json' }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
  on(event: 'update-downloaded' | 'update-not-available', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
};

export type DesktopUpdaterOptions = {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly currentVersion: string;
  readonly packaged: boolean;
  readonly channel?: DesktopChannel;
  readonly environment: NodeJS.ProcessEnv;
  readonly autoUpdater: SquirrelUpdater;
  readonly fetchJson: (url: string) => Promise<unknown>;
  readonly confirm: (message: {
    readonly title: string;
    readonly detail: string;
    readonly accept: string;
  }) => Promise<boolean>;
  /** Finish the same save/quiesce path as normal quit before Squirrel can close any window. */
  readonly prepareToRestart: () => Promise<boolean>;
  readonly openExternal: (url: string) => Promise<void>;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail?: unknown) => void;
  /** Milliseconds, defaults to setInterval. */
  readonly schedule?: (callback: () => void, checkInterval: number) => unknown;
  /** Diagnostic selector in the installed channel; never an arbitrary URL. */
  readonly candidateTag?: string;
};

export type DesktopUpdater = {
  check(): Promise<AvailableUpdate | undefined>;
  status(): string;
  install(): Promise<void>;
};

export const startDesktopUpdater = (options: DesktopUpdaterOptions): DesktopUpdater => {
  const { platform, arch, currentVersion, autoUpdater, log } = options;
  const channel = options.channel ?? 'production';
  let feedUrl = updateFeedUrl(platform, arch, channel);
  if (options.candidateTag) {
    if (desktopReleaseIdentity(options.candidateTag).channel !== channel) {
      throw new TypeError('Candidate update probes require the installed channel');
    }
    feedUrl = `${desktopReleaseBaseUrl(options.candidateTag)}/desktop-update-${platform}-${arch}.json`;
  }
  if (!options.packaged || options.environment['TAU_DESKTOP_UPDATES'] === 'off') {
    log('info', 'updater.disabled', { packaged: options.packaged, channel });
    return {
      check: async () => undefined,
      status: () => 'Automatic updates are disabled for this build.',
      install: async () => undefined,
    };
  }

  let status = 'Checking for updates…';
  let offered: AvailableUpdate | undefined;
  let downloaded = false;
  let downloading = false;
  let checking: Promise<AvailableUpdate | undefined> | undefined;
  let installing = false;
  const squirrel = platform === 'darwin';
  const failed = (error: unknown): void => {
    downloading = false;
    downloaded = false;
    offered = undefined;
    status = `Update failed: ${error instanceof Error ? error.message : String(error)}. Check again to retry.`;
    log('warn', 'updater.error', { message: status });
  };
  const install = async (): Promise<void> => {
    if (!downloaded || installing) {
      return;
    }
    installing = true;
    try {
      if (await options.prepareToRestart()) {
        autoUpdater.quitAndInstall();
      }
    } catch (error) {
      log('error', 'updater.restart-failed', { message: error instanceof Error ? error.message : String(error) });
    } finally {
      installing = false;
    }
  };
  if (squirrel) {
    autoUpdater.on('error', failed);
    autoUpdater.on('update-not-available', () => {
      downloading = false;
      offered = undefined;
      status = 'No update was downloaded. Check again to retry.';
    });
    const promptInstall = async (): Promise<void> => {
      try {
        const accepted = await options.confirm({
          title: `Tau ${offered?.version ?? ''} is ready to install`,
          detail: 'Restart Tau to finish updating. Your projects will be saved first.',
          accept: 'Restart now',
        });
        if (accepted) {
          await install();
        }
      } catch (error) {
        failed(error);
      }
    };
    autoUpdater.on('update-downloaded', () => {
      downloading = false;
      downloaded = true;
      status = `Tau ${offered?.version ?? ''} is ready. Restart to install.`;
      log('info', 'updater.downloaded', { version: offered?.version });
      void promptInstall();
    });
  }

  const checkOnce = async (): Promise<AvailableUpdate | undefined> => {
    if (downloading || downloaded) {
      return offered;
    }
    try {
      status = 'Checking for updates…';
      const update = availableUpdate(await options.fetchJson(feedUrl), currentVersion, { channel, platform, arch });
      if (!update) {
        status = `Tau ${currentVersion} is up to date (${channel}).`;
        return undefined;
      }
      if (update.version === offered?.version) {
        return update;
      }
      offered = update;
      log('info', 'updater.available', { version: update.version, current: currentVersion, channel, feedUrl });
      if (squirrel) {
        downloading = true;
        status = `Downloading Tau ${update.version}…`;
        // Pin the native fetch to the immutable candidate that passed our validation.
        autoUpdater.setFeedURL({
          url: `${desktopReleaseBaseUrl(update.tag)}/desktop-update-${platform}-${arch}.json`,
          serverType: 'json',
        });
        autoUpdater.checkForUpdates();
      } else if (
        await options.confirm({
          title: `Tau ${update.version} is available`,
          detail: `You have ${currentVersion}. Download the new archive from its release page.`,
          accept: 'Open release page',
        })
      ) {
        await options.openExternal(update.releasePage);
      }
      return update;
    } catch (error) {
      failed(error);
      return undefined;
    }
  };
  const check = async (): Promise<AvailableUpdate | undefined> => {
    if (checking) {
      return checking;
    }
    checking = checkOnce();
    try {
      return await checking;
    } finally {
      checking = undefined;
    }
  };
  void check();
  (options.schedule ?? setInterval)(() => {
    void check();
  }, updateCheckInterval);
  return { check, status: () => status, install };
};
