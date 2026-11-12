/** Channel-specific desktop updates. macOS installs the verified ZIP through Squirrel.Mac. */
import { z } from 'zod';
import type { DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';

import type { DesktopChannel } from '#main/environment.js';
import { desktopArchiveName, desktopDownloadOrigin, desktopReleaseIdentity } from '#shared/desktop-release.js';
import { moveToApplicationsDetail } from '#main/app-location.js';

export const updateRepository = 'taucad/tau';
/** Milliseconds between background checks. */
export const updateCheckInterval = 4 * 60 * 60 * 1000;
/**
 * Milliseconds before each automatic retry of a failed check or download. A launch or a wake from sleep often
 * checks before the network is up; without these the failure stayed on screen until the next background check,
 * four hours later, or until someone pressed Retry. After the last delay the background check takes over.
 */
export const updateRetryDelays: readonly number[] = [15_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

/** One-shot timer for an automatic retry; never keeps the process alive on its own. */
export const defaultUpdateRetry = (callback: () => void, retryDelay: number): void => {
  setTimeout(callback, retryDelay).unref();
};

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
  /** Installer routes commit after save/quiesce and before destructive teardown. */
  readonly prepareToInstall?: (commit: () => void | Promise<void>) => Promise<boolean>;
  readonly openExternal: (url: string) => Promise<void>;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail?: unknown) => void;
  /** Milliseconds, defaults to setInterval. */
  readonly schedule?: (callback: () => void, checkInterval: number) => unknown;
  /** One automatic retry after a failed check or download. Milliseconds, defaults to an unreferenced setTimeout. */
  readonly retry?: (callback: () => void, retryDelay: number) => unknown;
  /** Diagnostic selector in the installed channel; never an arbitrary URL. */
  readonly candidateTag?: string;
  /** Diagnostic constraint; selects no URL and cannot bypass the shipping feed or signature checks. */
  readonly expectedUpdate?: { readonly tag: string; readonly version: string; readonly sourceCommit: string };
  /**
   * On macOS: whether Squirrel.Mac can replace the bundle where it runs (not from Downloads or a disk image),
   * and the move to Applications that lets it.
   */
  readonly appLocation?: { readonly blocksUpdates: boolean; readonly move: () => boolean };
};

export type DesktopUpdater = {
  check(reveal?: boolean): Promise<AvailableUpdate | undefined>;
  snapshot(): DesktopUpdateSnapshot;
  download(): Promise<void>;
  status(): string;
  /**
   * The user's request to restart into the update. Once it is downloaded this saves and restarts now; before that
   * it records the request, starts a check if none is running, and restarts as soon as the download finishes.
   */
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
  let snapshot: DesktopUpdateSnapshot = {
    revision: 0,
    requestId: 0,
    phase: 'checking',
    currentVersion,
    channel,
    installOnQuit: platform === 'darwin',
  };
  const publish = (phase: DesktopUpdateSnapshot['phase'], detail?: string): void => {
    const { detail: _previous, ...rest } = snapshot;
    snapshot = { ...rest, revision: snapshot.revision + 1, phase, ...(detail === undefined ? {} : { detail }) };
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
  /* The user asked to restart before the download finished. Only `install` sets it, so a background download
   * alone still never restarts Tau. */
  let installWhenReady = false;
  let failures = 0;
  let retryPending = false;
  /* `quitAndInstall` was called. Until Squirrel reports an error nothing may touch the staged update again. */
  let restarting = false;
  /* A check asked while Squirrel was downloading. It runs when that download finishes, before any restart. */
  let recheck = false;
  /* A CI probe is bound to one release, which a newer one must never replace. */
  const pinned = options.candidateTag !== undefined || options.expectedUpdate !== undefined;
  const squirrel = platform === 'darwin';
  /* Squirrel.Mac replaces the bundle in place, which a translocated or disk-image copy cannot allow. */
  let moveRequired = squirrel && options.appLocation?.blocksUpdates === true;
  const askToMove = (): void => {
    status = moveToApplicationsDetail;
    publish('move-required', moveToApplicationsDetail);
  };
  const restartWhenReady = (wanted: boolean): void => {
    installWhenReady = wanted;
    const { installWhenReady: _previous, ...rest } = snapshot;
    snapshot = wanted ? { ...rest, installWhenReady: true } : rest;
  };
  const retryLater = (): void => {
    const retryDelay = updateRetryDelays[failures];
    if (retryDelay === undefined || retryPending) {
      return;
    }
    failures += 1;
    retryPending = true;
    (options.retry ?? defaultUpdateRetry)(() => {
      retryPending = false;
      void check();
    }, retryDelay);
  };
  const failed = (error: unknown): void => {
    downloading = false;
    downloaded = false;
    restarting = false;
    recheck = false;
    /* A restart request does not outlive a failure: the retry that follows is a background download again. */
    restartWhenReady(false);
    const message = error instanceof Error ? error.message : String(error);
    log('warn', 'updater.error', { message });
    /* The location check can miss a read-only volume; Squirrel's own refusal says the same thing. */
    if (squirrel && offered && options.appLocation && /read-only/iu.test(message)) {
      moveRequired = true;
      askToMove();
      return;
    }
    offered = undefined;
    status = `Update failed: ${message}. Check again to retry.`;
    snapshot = { ...snapshot, version: undefined, releasePage: undefined };
    publish('error');
    retryLater();
  };
  const install = async (): Promise<void> => {
    if (installing || restarting) {
      return;
    }
    if (!downloaded) {
      /* Asked before the update is here (while it downloads, or from a failed attempt): remember the request so
       * the download's completion restarts Tau, instead of making the user come back and ask a second time. */
      if (squirrel && !moveRequired && !installWhenReady) {
        restartWhenReady(true);
        publish(snapshot.phase, snapshot.detail);
      }
      if (!downloading) {
        await check();
      }
      return;
    }
    installing = true;
    restartWhenReady(false);
    publish('saving');
    try {
      if (await options.prepareToRestart()) {
        publish('restarting');
        restarting = true;
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
      downloaded = false;
      recheck = false;
      offered = undefined;
      restartWhenReady(false);
      status = 'No update was downloaded. Check again to retry.';
      /* Our own check validated a newer release, so Squirrel finding none at the pinned feed is a failure. */
      log('warn', 'updater.error', { message: 'Squirrel found no update at the release feed' });
      snapshot = { ...snapshot, version: undefined, releasePage: undefined };
      publish('error');
      retryLater();
    });
    autoUpdater.on('update-downloaded', () => {
      downloading = false;
      downloaded = true;
      failures = 0;
      status = `Tau ${offered?.version ?? ''} is ready. Restart to install.`;
      log('info', 'updater.downloaded', { version: offered?.version });
      publish('ready');
      if (recheck) {
        /* Someone asked for a check during the download: look once more, so a restart lands on the newest. */
        recheck = false;
        void recheckThenInstall();
      } else {
        installIfAsked();
      }
    });
  }

  const latestUpdate = async (): Promise<AvailableUpdate | undefined> =>
    availableUpdate(await options.fetchJson(feedUrl), currentVersion, { channel, platform, arch, origin });
  /** Squirrel downloads the release Tau validated, from that release's own immutable feed. */
  const startDownload = (update: AvailableUpdate): void => {
    downloaded = false;
    downloading = true;
    status = `Downloading Tau ${update.version}…`;
    publish('downloading');
    autoUpdater.setFeedURL({
      url: `${releaseBaseUrl(update.tag, origin)}/desktop-update-${platform}-${arch}.json`,
      serverType: 'json',
    });
    autoUpdater.checkForUpdates();
  };
  /**
   * A downloaded update is waiting: replace it when the feed has moved to a newer release, so a restart does not
   * land on a build that is already out of date. Nothing is published unless a newer release is found, and a feed
   * that fails, repeats the pending release or names an older one leaves the pending update as it is.
   *
   * `setFeedURL` gives Electron a new `SQRLUpdater`, whose first step deletes every staged update directory
   * (Squirrel.Mac `pruneUpdateDirectories`), so from here the old update cannot be installed: the state returns to
   * `downloading` and a restart request is held for the newer build.
   */
  const supersede = async (): Promise<AvailableUpdate | undefined> => {
    let update: AvailableUpdate | undefined;
    try {
      update = await latestUpdate();
    } catch (error) {
      log('info', 'updater.supersede-check-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return offered;
    }
    /* The request took time: an install may have started, or a native failure may have dropped the update. */
    if (installing || restarting || !downloaded || !offered || !update) {
      return offered;
    }
    if (!isNewerVersion(update.version, offered.version)) {
      return offered;
    }
    log('info', 'updater.superseded', { from: offered.version, version: update.version, channel });
    offered = update;
    snapshot = { ...snapshot, version: update.version, releasePage: update.releasePage };
    try {
      startDownload(update);
    } catch (error) {
      failed(error);
      return undefined;
    }
    return update;
  };

  const checkOnce = async (): Promise<AvailableUpdate | undefined> => {
    if (installing || restarting) {
      /* Never touch a staged update while Tau saves or restarts into it. */
      return offered;
    }
    if (downloading) {
      /* Squirrel runs one download at a time, and a second check would delete the one in flight. */
      recheck = !pinned;
      return offered;
    }
    if (downloaded) {
      return pinned ? offered : supersede();
    }
    try {
      status = 'Checking for updates…';
      /* An offer already on the card (an archive to download, a copy to move) stays there while the feed is read:
       * `checking` hides the card, and wake and network checks would otherwise make it blink. */
      if (!offered) {
        publish('checking');
      }
      const update = await latestUpdate();
      if (!update) {
        status = `Tau ${currentVersion} is up to date (${channel}).`;
        offered = undefined;
        failures = 0;
        restartWhenReady(false);
        snapshot = { ...snapshot, version: undefined, releasePage: undefined };
        publish('current');
        return undefined;
      }
      if (
        options.expectedUpdate &&
        (update.version !== options.expectedUpdate.version || update.tag !== options.expectedUpdate.tag)
      ) {
        throw new Error('Qualification update differs from the expected release');
      }
      if (update.version === offered?.version) {
        if (moveRequired) {
          askToMove();
        } else {
          publish('available');
        }
        return update;
      }
      offered = update;
      snapshot = { ...snapshot, version: update.version, releasePage: update.releasePage };
      log('info', 'updater.available', { version: update.version, current: currentVersion, channel, feedUrl });
      if (moveRequired) {
        askToMove();
      } else if (squirrel) {
        startDownload(update);
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
  /** Carry out a held restart request, or the CI probe's install, once the update is downloaded. */
  const installIfAsked = (): void => {
    if (downloaded && (installWhenReady || (options.installForProbe === true && pinned))) {
      void install();
    }
  };
  const recheckThenInstall = async (): Promise<void> => {
    await check();
    installIfAsked();
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
      if (moveRequired && options.appLocation) {
        /* The card's Move to Applications: Electron relaunches Tau from Applications when it succeeds. */
        options.appLocation.move();
        return;
      }
      if (!squirrel && offered) {
        await options.openExternal(`${releaseBaseUrl(offered.tag, origin)}/${desktopArchiveName(platform, arch)}`);
      }
    },
  };
};
