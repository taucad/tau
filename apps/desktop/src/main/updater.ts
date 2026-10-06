/**
 * Desktop updates from a fixed feed in the repository's GitHub Releases.
 *
 * `release-build.yml` writes one feed per platform
 * (`desktop-update-<platform>-<arch>.json`, in the Squirrel.Mac JSON shape) to
 * the fixed `desktop-feed` prerelease only after every archive of a desktop
 * release is attached, so the feed always names a complete release. The feed
 * does not depend on the repository's "Latest" badge, which UI and API
 * releases share. Desktop releases still become latest and carry their own
 * feeds, for builds that read `/releases/latest/download/<feed>`.
 *
 * - macOS (signed): Electron's `autoUpdater` (Squirrel.Mac) downloads the ZIP,
 *   verifies it carries the running app's code signature, and installs it on
 *   restart. The feed is read first so an older or equal release never starts a
 *   download.
 * - Linux and Windows (unsigned, no installer framework): the app offers the
 *   release page; the person downloads the new archive themselves.
 *
 * Unpackaged runs, staging packages and `TAU_DESKTOP_UPDATES=off` never check:
 * a staging build ships as a prerelease that writes no feed, so the feed would
 * only ever offer it a production build.
 */
import { z } from 'zod';

import type { DesktopChannel } from '#main/environment.js';

/** The repository whose releases carry the desktop update feeds. */
export const updateRepository = 'taucad/tau';

/** How often a running app looks for a newer release. Milliseconds. */
export const updateCheckInterval = 4 * 60 * 60 * 1000;

/** The feed shape `release-build.yml` writes; the fields the updater reads. */
const updateFeedSchema = z.object({
  currentRelease: z.string(),
  releases: z.array(
    z.object({
      version: z.string(),
      updateTo: z.object({ version: z.string(), name: z.string(), url: z.string() }),
    }),
  ),
});

/** An available update: the release's version, tag and page. */
export type AvailableUpdate = { readonly version: string; readonly tag: string; readonly releasePage: string };

/** The release tag whose assets are the update feeds; release-build.yml replaces them. */
export const updateFeedTag = 'desktop-feed';

/** The fixed feed a platform reads. */
export const updateFeedUrl = (platform: string, arch: string, repository = updateRepository): string =>
  `https://github.com/${repository}/releases/download/${updateFeedTag}/desktop-update-${platform}-${arch}.json`;

const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/u;

/** True when `candidate` is a strictly later MAJOR.MINOR.PATCH than `current`. */
export const isNewerVersion = (candidate: string, current: string): boolean => {
  const next = versionPattern.exec(candidate);
  const now = versionPattern.exec(current);
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

/** The update a feed offers over `currentVersion`, or `undefined` when it offers none. */
export const availableUpdate = (
  feed: unknown,
  currentVersion: string,
  repository = updateRepository,
): AvailableUpdate | undefined => {
  const parsed = updateFeedSchema.safeParse(feed);
  if (!parsed.success) {
    return undefined;
  }

  const { currentRelease, releases } = parsed.data;
  const tag = releases.find(({ version }) => version === currentRelease)?.updateTo.name;
  if (tag === undefined || !isNewerVersion(currentRelease, currentVersion)) {
    return undefined;
  }

  return {
    version: currentRelease,
    tag,
    releasePage: `https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}`,
  };
};

/** The slice of Electron's `autoUpdater` the macOS path drives. */
export type SquirrelUpdater = {
  setFeedURL(options: { url: string; serverType: 'json' }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
  on(event: 'update-downloaded', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
};

export type DesktopUpdaterOptions = {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly currentVersion: string;
  readonly packaged: boolean;
  /** The packaged channel; a `staging` package never checks. Defaults to `production`. */
  readonly channel?: DesktopChannel;
  readonly environment: NodeJS.ProcessEnv;
  readonly autoUpdater: SquirrelUpdater;
  readonly fetchJson: (url: string) => Promise<unknown>;
  /** Ask the person; resolves true when they accept. */
  readonly confirm: (message: {
    readonly title: string;
    readonly detail: string;
    readonly accept: string;
  }) => Promise<boolean>;
  readonly openExternal: (url: string) => Promise<void>;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail?: unknown) => void;
  /** Repeats `callback` every `interval` milliseconds; defaults to `setInterval`. */
  readonly schedule?: (callback: () => void, interval: number) => unknown;
};

export type DesktopUpdater = {
  /** Look for a newer release now; resolves once the check (not a download) finishes. */
  check(): Promise<AvailableUpdate | undefined>;
};

/** Start checking for updates, or return an updater whose checks do nothing. */
export const startDesktopUpdater = (options: DesktopUpdaterOptions): DesktopUpdater => {
  const { platform, arch, currentVersion, autoUpdater, log } = options;
  const channel = options.channel ?? 'production';
  if (!options.packaged || channel !== 'production' || options.environment['TAU_DESKTOP_UPDATES'] === 'off') {
    log('info', 'updater.disabled', { packaged: options.packaged, channel });
    return { check: async () => undefined };
  }

  const feedUrl = updateFeedUrl(platform, arch);
  const squirrel = platform === 'darwin';
  let offered: string | undefined;
  if (squirrel) {
    autoUpdater.setFeedURL({ url: feedUrl, serverType: 'json' });
    autoUpdater.on('error', (error) => {
      log('warn', 'updater.error', { message: error.message });
    });
    const promptInstall = async (): Promise<void> => {
      const accepted = await options.confirm({
        title: offered === undefined ? 'A Tau update is ready to install' : `Tau ${offered} is ready to install`,
        detail: 'Restart Tau to finish updating.',
        accept: 'Restart now',
      });
      if (accepted) {
        autoUpdater.quitAndInstall();
      }
    };
    autoUpdater.on('update-downloaded', () => {
      log('info', 'updater.downloaded', { version: offered });
      void promptInstall();
    });
  }

  const check = async (): Promise<AvailableUpdate | undefined> => {
    let update: AvailableUpdate | undefined;
    try {
      update = availableUpdate(await options.fetchJson(feedUrl), currentVersion);
    } catch (error) {
      log('warn', 'updater.feed-failed', { message: error instanceof Error ? error.message : String(error) });
      return undefined;
    }

    if (update === undefined || update.version === offered) {
      return update;
    }

    offered = update.version;
    log('info', 'updater.available', { version: update.version, current: currentVersion });
    if (squirrel) {
      autoUpdater.checkForUpdates();
    } else {
      const accepted = await options.confirm({
        title: `Tau ${update.version} is available`,
        detail: `You have ${currentVersion}. Download the new version from its release page.`,
        accept: 'Open release page',
      });
      if (accepted) {
        await options.openExternal(update.releasePage);
      }
    }

    return update;
  };

  void check();
  (options.schedule ?? setInterval)(() => {
    void check();
  }, updateCheckInterval);
  return { check };
};
