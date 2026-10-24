/** Consent and save admission shared by installer-owned and system-owned updates. */
import type { DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';

import type { AvailableUpdate, DesktopUpdater, DesktopUpdaterOptions } from '#main/updater.js';
import { updateCheckInterval } from '#main/updater.js';

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
  finish(): void;
};
export type PlatformUpdateOptions = DesktopUpdaterOptions & {
  /** Main confirms the renderer workspace and save handler have actually become ready. */
  readonly confirmHealthy?: () => Promise<boolean>;
  /** Main invokes commit after saving/quiescing, before disposing services. Failure recovers the session. */
  readonly prepareToInstall: (commit: () => void | Promise<void>) => Promise<boolean>;
};

/** Background download never grants install consent, and ordinary quit has no install callback. */
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
  let status = 'Checking for updates…';
  const publish = (phase: DesktopUpdateSnapshot['phase'], detail: string): void => {
    status = detail;
    snapshot = { ...snapshot, revision: snapshot.revision + 1, phase, detail };
    options.onState?.(snapshot);
  };
  const failed = (error: unknown): void => {
    ready = false;
    offered = undefined;
    snapshot = { ...snapshot, version: undefined, releasePage: undefined };
    const message = error instanceof Error ? error.message : String(error);
    publish('error', `Update failed: ${message}. Check again to retry.`);
    options.log('warn', 'updater.error', { message });
  };
  const install = async (): Promise<void> => {
    if (!ready || installing) {
      return;
    }
    installing = true;
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
      backend.finish();
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
      publish(
        'ready',
        backend.systemManaged
          ? 'APT installed a newer version. Save and restart to use it; this session keeps its original files.'
          : 'Saves your work, then restarts to install. Quitting normally leaves the update for later.',
      );
      if (options.installForProbe && (options.candidateTag !== undefined || options.expectedUpdate !== undefined)) {
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
