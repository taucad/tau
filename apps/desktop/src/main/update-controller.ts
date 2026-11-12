/** Consent and save admission shared by installer-owned and system-owned updates. */
import type { DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';

import type { AvailableUpdate, DesktopUpdater, DesktopUpdaterOptions } from '#main/updater.js';
import { defaultUpdateRetry, updateCheckInterval, updateRetryDelays } from '#main/updater.js';

/** Preparation may reserve files/leases; only commit may change the installed executable. */
export type PreparedDesktopInstallation = {
  commit(): void | Promise<void>;
  release(): void | Promise<void>;
};
export type PlatformUpdateBackend = {
  readonly systemManaged: boolean;
  readonly disabledReason?: string;
  check(): Promise<AvailableUpdate | undefined>;
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
    if (installing) {
      return;
    }
    if (!ready) {
      /* Asked before the update is here (while it downloads, or from a failed attempt): remember the request so
       * the download's completion restarts Tau, instead of making the user come back and ask a second time. */
      if (!backend.systemManaged && !backend.disabledReason && !installWhenReady) {
        restartWhenReady(true);
        publish(snapshot.phase, status);
      }
      await check();
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
  const checkOnce = async (): Promise<AvailableUpdate | undefined> => {
    if (ready || installing) {
      return offered;
    }
    try {
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
      snapshot = { ...snapshot, version: offered.version, releasePage: offered.releasePage };
      if (!backend.systemManaged) {
        publish('downloading', `Downloading Tau ${offered.version}…`);
        await backend.download();
      }
      ready = true;
      failures = 0;
      publish(
        'ready',
        backend.systemManaged
          ? 'APT installed a newer version. Save and restart to use it; this session keeps its original files.'
          : 'Saves your work, then restarts to install. Quitting normally leaves the update for later.',
      );
      if (
        installWhenReady ||
        (options.installForProbe && (options.candidateTag !== undefined || options.expectedUpdate !== undefined))
      ) {
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
