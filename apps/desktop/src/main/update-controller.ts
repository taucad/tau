/** Consent and save admission shared by installer-owned and system-owned updates. */
import type { DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';

import type { AvailableUpdate, DesktopUpdater, DesktopUpdaterOptions } from '#main/updater.js';
import { defaultUpdateRetry, isNewerVersion, updateCheckInterval, updateRetryDelays } from '#main/updater.js';

/** Preparation may reserve files/leases; only commit may change the installed executable. */
export type PreparedDesktopInstallation = {
  commit(): void | Promise<void>;
  release(): void | Promise<void>;
};
export type PlatformUpdateBackend = {
  readonly systemManaged: boolean;
  readonly disabledReason?: string;
  check(): Promise<AvailableUpdate | undefined>;
  /**
   * Downloads the release the last `check` returned. `prepare` installs the last release whose download finished,
   * whatever later checks returned; a download that fails leaves nothing to install.
   */
  download(): Promise<void>;
  prepare(): Promise<PreparedDesktopInstallation>;
  /** Resolves once the restart is arranged; a rejection pauses the restart instead of quitting. */
  finish(): void | Promise<void>;
};
export type PlatformUpdateOptions = DesktopUpdaterOptions & {
  /** Main confirms the renderer workspace and save handler have actually become ready. */
  readonly confirmHealthy?: () => Promise<boolean>;
  /** Main invokes commit after saving/quiescing, before disposing services. Failure recovers the session. */
  readonly prepareToInstall: (commit: () => void | Promise<void>) => Promise<boolean>;
};

/**
 * Background download never grants install consent, and ordinary quit has no install callback. Consent is the
 * user's `install`: given before the download finishes, it is held until then and installs without a second ask.
 *
 * A newer release replaces a pending one: a check made while an update is ready downloads the newer release and
 * carries a held restart request over to it. Nothing replaces an update while Tau saves or restarts into it, and
 * a CI probe's pinned release is never replaced.
 */
export const startPlatformUpdateController = (
  options: PlatformUpdateOptions,
  backend: PlatformUpdateBackend,
): DesktopUpdater => {
  let snapshot: DesktopUpdateSnapshot = {
    revision: 0,
    requestId: 0,
    phase: 'checking',
    currentVersion: options.currentVersion,
    channel: options.channel ?? 'production',
    installOnQuit: false,
  };
  let offered: AvailableUpdate | undefined;
  let pending: Promise<AvailableUpdate | undefined> | undefined;
  let installing = false;
  let ready = false;
  /* The user asked to restart before the download finished. Only `install` sets it. */
  let installWhenReady = false;
  let failures = 0;
  let retryPending = false;
  let downloading = false;
  /* The restart is arranged and Tau is quitting: no later check may start another download. */
  let restarting = false;
  /* A check asked while a download was running. It runs when that download finishes, before any restart. */
  let recheck = false;
  /* A CI probe is bound to one release, which a newer one must never replace. */
  const pinned = options.candidateTag !== undefined || options.expectedUpdate !== undefined;
  let status = 'Checking for updates…';
  const publish = (phase: DesktopUpdateSnapshot['phase'], detail: string): void => {
    status = detail;
    snapshot = { ...snapshot, revision: snapshot.revision + 1, phase, detail };
    options.onState?.(snapshot);
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
    ready = false;
    recheck = false;
    offered = undefined;
    /* A restart request does not outlive a failure: the retry that follows is a background download again. */
    restartWhenReady(false);
    snapshot = { ...snapshot, version: undefined, releasePage: undefined };
    const message = error instanceof Error ? error.message : String(error);
    publish('error', `Update failed: ${message}. Check again to retry.`);
    options.log('warn', 'updater.error', { message });
    retryLater();
  };
  const install = async (): Promise<void> => {
    if (installing || restarting) {
      return;
    }
    if (!ready) {
      /* Asked before the update is here (while it downloads, or from a failed attempt): remember the request so
       * the download's completion restarts Tau, instead of making the user come back and ask a second time. */
      if (!backend.systemManaged && !backend.disabledReason && !installWhenReady) {
        restartWhenReady(true);
        publish(snapshot.phase, status);
      }
      /* Wait for the download in flight; only a check someone asked for looks for a newer release after it. */
      await (downloading && pending ? pending : check());
      return;
    }
    installing = true;
    restartWhenReady(false);
    let prepared: PreparedDesktopInstallation | undefined;
    try {
      // Permission/space/hash/signature failures must happen before the save/quit owner is invoked.
      prepared = await backend.prepare();
      let commitFailure: unknown;
      publish('saving', 'Saving your work before restarting…');
      if (
        !(await options.prepareToInstall(async () => {
          try {
            await prepared!.commit();
          } catch (error) {
            commitFailure = error;
            throw error;
          }
        }))
      ) {
        if (commitFailure !== undefined) {
          failed(commitFailure);
          return;
        }
        publish('restart-blocked', 'Tau stayed open. Finish saving or reviewing active machines, then try again.');
        return;
      }
      publish('restarting', 'Reopening your workspace…');
      await backend.finish();
      restarting = true;
    } catch (error) {
      if (!prepared) {
        failed(error);
        return;
      }
      publish('restart-blocked', `Restart paused: ${error instanceof Error ? error.message : String(error)}`);
      options.log('error', 'updater.restart-failed', { message: status });
    } finally {
      try {
        await prepared?.release();
      } catch (error) {
        options.log('warn', 'updater.release-failed', { message: String(error) });
      }
      installing = false;
    }
  };
  /** Download `update` (system-managed routes have nothing to download) and publish it as ready. */
  const acquire = async (update: AvailableUpdate): Promise<void> => {
    offered = update;
    snapshot = { ...snapshot, version: update.version, releasePage: update.releasePage };
    if (!backend.systemManaged) {
      /* The downloader drops its cached file when another release downloads, so the pending one is gone here. */
      ready = false;
      publish('downloading', `Downloading Tau ${update.version}…`);
      downloading = true;
      try {
        await backend.download();
      } finally {
        downloading = false;
      }
    }
    ready = true;
    failures = 0;
    publish(
      'ready',
      backend.systemManaged
        ? 'APT installed a newer version. Save and restart to use it; this session keeps its original files.'
        : 'Saves your work, then restarts to install. Quitting normally leaves the update for later.',
    );
  };
  /**
   * An update is ready: replace it when a newer release exists. Nothing is published unless one is found, and a
   * check that fails, repeats the pending release or names an older one leaves the pending update as it is.
   */
  const supersede = async (): Promise<void> => {
    let update: AvailableUpdate | undefined;
    try {
      update = await backend.check();
    } catch (error) {
      options.log('info', 'updater.supersede-check-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    /* The check took time: an install may have started, or its failure may have dropped the update. */
    if (installing || restarting || !ready || !offered || !update) {
      return;
    }
    if (!isNewerVersion(update.version, offered.version)) {
      return;
    }
    options.log('info', 'updater.superseded', { from: offered.version, version: update.version });
    await acquire(update);
  };
  const checkOnce = async (): Promise<AvailableUpdate | undefined> => {
    if (installing || restarting) {
      /* Never replace an update while Tau saves or restarts into it. */
      return offered;
    }
    if (ready && pinned) {
      return offered;
    }
    try {
      if (ready) {
        await supersede();
      } else {
        if (backend.disabledReason) {
          publish('disabled', backend.disabledReason);
          return undefined;
        }
        publish('checking', 'Checking for updates…');
        offered = await backend.check();
        if (!offered) {
          failures = 0;
          restartWhenReady(false);
          snapshot = { ...snapshot, version: undefined, releasePage: undefined };
          publish(
            backend.systemManaged ? 'system-managed' : 'current',
            backend.systemManaged
              ? 'Updates are managed by APT. Automatic installation depends on your administrator’s enrollment, holds and policy.'
              : `Tau ${options.currentVersion} is up to date.`,
          );
          return undefined;
        }
        if (
          options.expectedUpdate &&
          (offered.version !== options.expectedUpdate.version || offered.tag !== options.expectedUpdate.tag)
        ) {
          throw new Error('Qualification update differs from the expected release');
        }
        await acquire(offered);
      }
      /* oxlint-disable no-await-in-loop -- Each pass answers a check asked during the previous pass's download. */
      while (recheck) {
        recheck = false;
        await supersede();
      }
      /* oxlint-enable no-await-in-loop */
      if (ready && (installWhenReady || (options.installForProbe === true && pinned))) {
        void install();
      }
      return offered;
    } catch (error) {
      failed(error);
      return undefined;
    }
  };
  const check = async (reveal = false): Promise<AvailableUpdate | undefined> => {
    if (reveal) {
      snapshot = { ...snapshot, requestId: snapshot.requestId + 1 };
      publish(snapshot.phase, status);
    }
    if (pending) {
      /* Checks are serialized. One asked during a download is answered when that download finishes. */
      recheck ||= downloading && !pinned;
      return pending;
    }
    pending = checkOnce();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  };
  void check();
  (options.schedule ?? setInterval)(() => {
    void check();
  }, updateCheckInterval);
  return {
    check,
    install,
    download: async () => {
      await check();
    },
    snapshot: () => snapshot,
    status: () => status,
  };
};
