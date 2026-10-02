/**
 * Desktop updates from the repository's latest GitHub Release.
 *
 * `release-build.yml` attaches one feed per platform to a desktop release
 * (`desktop-update-<platform>-<arch>.json`, in the Squirrel.Mac JSON shape) and
 * marks the release "latest" only after every archive is attached, so
 * `/releases/latest/download/<feed>` always names a complete release.
 *
 * - macOS (signed): Electron's `autoUpdater` (Squirrel.Mac) downloads the ZIP,
 *   verifies it carries the running app's code signature, and installs it on
 *   restart. The feed is read first so an older or equal release never starts a
 *   download.
 * - Linux and Windows (unsigned, no installer framework): the app offers the
 *   release page; the person downloads the new archive themselves.
 *
 * Unpackaged runs and `TAU_DESKTOP_UPDATES=off` never check.
 */
import { z } from 'zod';

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

/** The feed a platform reads from the latest release. */
export const updateFeedUrl = (platform: string, arch: string, repository = updateRepository): string =>
  `https://github.com/${repository}/releases/latest/download/desktop-update-${platform}-${arch}.json`;

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
  if (!options.packaged || options.environment['TAU_DESKTOP_UPDATES'] === 'off') {
    log('info', 'updater.disabled', { packaged: options.packaged });
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
