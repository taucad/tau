/** Channel-specific desktop updates. macOS installs the verified ZIP through Squirrel.Mac. */
import { z } from 'zod';
import type { DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';

import type { DesktopChannel } from '#main/environment.js';
import { desktopArchiveName, desktopDownloadOrigin, desktopReleaseIdentity } from '#shared/desktop-release.js';

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

/** The pointer to the latest release's feed under an update origin. */
const latestFeedUrl = (origin: string, platform: string, arch: string): string =>
  `${origin}/latest/desktop-update-${platform}-${arch}.json`;

export const updateFeedUrl = (platform: string, arch: string, channel: DesktopChannel = 'production'): string =>
  latestFeedUrl(desktopDownloadOrigin(channel), platform, arch);

/** A release's immutable directory under an update origin: the channel's own, or a managed mirror of it. */
const releaseBaseUrl = (tag: string, origin: string): string => `${origin}/releases/${encodeURIComponent(tag)}`;

/** Where updates come from, or why there are none. */
export type UpdateSource =
  | { readonly kind: 'origin'; readonly origin: string }
  | { readonly kind: 'disabled'; readonly reason: string };

/**
 * The managed switch (charter D25, guide Q37): `TAU_DESKTOP_UPDATES=off` turns updates off;
 * `TAU_DESKTOP_UPDATE_FEED=<https base>` reads the feed and the releases from a mirror of the
 * channel's download origin (the same `latest/` and `releases/<tag>/` layout, with the archive
 * URLs in both feed files rewritten to the mirror); and the locked managed profile
 * (`TAU_ACQUISITION=locked`) never reaches the public origin, so without a mirror it turns updates
 * off. A malformed mirror turns updates off rather than fall back to the public origin.
 *
 * @param environment - The process environment.
 * @param channel - The installed channel.
 * @returns The update origin, or the reason updates are off.
 */
export const updateSource = (environment: NodeJS.ProcessEnv, channel: DesktopChannel): UpdateSource => {
  if (environment['TAU_DESKTOP_UPDATES'] === 'off') {
    return { kind: 'disabled', reason: 'Automatic updates are turned off by TAU_DESKTOP_UPDATES=off.' };
  }
  const mirror = environment['TAU_DESKTOP_UPDATE_FEED'];
  if (mirror !== undefined && mirror !== '') {
    let url: URL | undefined;
    try {
      url = new URL(mirror);
    } catch {
      url = undefined;
    }
    if (
      url?.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return {
        kind: 'disabled',
        reason:
          'Automatic updates are off: TAU_DESKTOP_UPDATE_FEED must be an https:// URL without credentials, query or fragment.',
      };
    }
    return { kind: 'origin', origin: url.href.replace(/\/+$/u, '') };
  }
  if (environment['TAU_ACQUISITION'] === 'locked') {
    return {
      kind: 'disabled',
      reason:
        'Automatic updates are off under the locked managed profile. Set TAU_DESKTOP_UPDATE_FEED to a mirror to enable them.',
    };
  }
  return { kind: 'origin', origin: desktopDownloadOrigin(channel) };
};

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

type UpdateTarget = { channel: DesktopChannel; platform: string; arch: string; origin?: string };

const defaultUpdateTarget = { channel: 'production', platform: 'darwin', arch: 'arm64' } satisfies UpdateTarget;

/**
 * Refuse inconsistent metadata or a ZIP outside this channel's immutable release directory under
 * the update origin (the channel's own unless a managed mirror is configured).
 */
export const availableUpdate = (
  feed: unknown,
  currentVersion: string,
  target: UpdateTarget = defaultUpdateTarget,
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
    url !==
      `${releaseBaseUrl(tag, target.origin ?? desktopDownloadOrigin(target.channel))}/${desktopArchiveName(target.platform, target.arch)}`
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
  readonly onState?: (snapshot: DesktopUpdateSnapshot) => void;
  /** Only the bounded native CI probe may install without a user gesture. */
  readonly installForProbe?: boolean;
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
  check(reveal?: boolean): Promise<AvailableUpdate | undefined>;
  snapshot(): DesktopUpdateSnapshot;
  download(): Promise<void>;
  status(): string;
  install(): Promise<void>;
};

export const startDesktopUpdater = (options: DesktopUpdaterOptions): DesktopUpdater => {
  const { platform, arch, currentVersion, autoUpdater, log } = options;
  const channel = options.channel ?? 'production';
  const source = updateSource(options.environment, channel);
  const origin = source.kind === 'origin' ? source.origin : desktopDownloadOrigin(channel);
  let feedUrl = latestFeedUrl(origin, platform, arch);
  if (options.candidateTag) {
    if (desktopReleaseIdentity(options.candidateTag).channel !== channel) {
      throw new TypeError('Candidate update probes require the installed channel');
    }
    feedUrl = `${releaseBaseUrl(options.candidateTag, origin)}/desktop-update-${platform}-${arch}.json`;
  }
  let snapshot: DesktopUpdateSnapshot = { revision: 0, requestId: 0, phase: 'checking', currentVersion, channel };
  const publish = (phase: DesktopUpdateSnapshot['phase']): void => {
    snapshot = { ...snapshot, revision: snapshot.revision + 1, phase };
    options.onState?.(snapshot);
  };
  if (!options.packaged || source.kind === 'disabled') {
    const reason =
      options.packaged && source.kind === 'disabled' ? source.reason : 'Automatic updates are disabled for this build.';
    log('info', 'updater.disabled', { packaged: options.packaged, channel, reason });
    publish('disabled');
    return {
      snapshot: () => snapshot,
      download: async () => undefined,
      check: async (reveal) => {
        if (reveal) {
          snapshot = { ...snapshot, requestId: snapshot.requestId + 1 };
          publish('disabled');
        }
        return undefined;
      },
      status: () => reason,
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
    snapshot = { ...snapshot, version: undefined, releasePage: undefined };
    publish('error');
    log('warn', 'updater.error', { message: status });
  };
  const install = async (): Promise<void> => {
    if (!downloaded || installing) {
      return;
    }
    installing = true;
    publish('saving');
    try {
      if (await options.prepareToRestart()) {
        publish('restarting');
        autoUpdater.quitAndInstall();
      } else {
        publish('restart-blocked');
      }
    } catch (error) {
      publish('restart-blocked');
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
      publish('error');
    });
    autoUpdater.on('update-downloaded', () => {
      downloading = false;
      downloaded = true;
      status = `Tau ${offered?.version ?? ''} is ready. Restart to install.`;
      log('info', 'updater.downloaded', { version: offered?.version });
      publish('ready');
      if (options.installForProbe && options.candidateTag) {
        void install();
      }
    });
  }

  const checkOnce = async (): Promise<AvailableUpdate | undefined> => {
    if (downloading || downloaded) {
      return offered;
    }
    try {
      status = 'Checking for updates…';
      publish('checking');
      const update = availableUpdate(await options.fetchJson(feedUrl), currentVersion, {
        channel,
        platform,
        arch,
        origin,
      });
      if (!update) {
        status = `Tau ${currentVersion} is up to date (${channel}).`;
        offered = undefined;
        snapshot = { ...snapshot, version: undefined, releasePage: undefined };
        publish('current');
        return undefined;
      }
      if (update.version === offered?.version) {
        publish('available');
        return update;
      }
      offered = update;
      snapshot = { ...snapshot, version: update.version, releasePage: update.releasePage };
      log('info', 'updater.available', { version: update.version, current: currentVersion, channel, feedUrl });
      if (squirrel) {
        downloading = true;
        status = `Downloading Tau ${update.version}…`;
        publish('downloading');
        // Pin the native fetch to the immutable candidate that passed our validation.
        autoUpdater.setFeedURL({
          url: `${releaseBaseUrl(update.tag, origin)}/desktop-update-${platform}-${arch}.json`,
          serverType: 'json',
        });
        autoUpdater.checkForUpdates();
      } else {
        publish('available');
      }
      return update;
    } catch (error) {
      failed(error);
      return undefined;
    }
  };
  const check = async (reveal = false): Promise<AvailableUpdate | undefined> => {
    if (reveal) {
      snapshot = { ...snapshot, requestId: snapshot.requestId + 1 };
      publish(snapshot.phase);
    }
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
  return {
    check,
    status: () => status,
    install,
    snapshot: () => snapshot,
    download: async () => {
      if (!squirrel && offered) {
        await options.openExternal(`${releaseBaseUrl(offered.tag, origin)}/${desktopArchiveName(platform, arch)}`);
      }
    },
  };
};
