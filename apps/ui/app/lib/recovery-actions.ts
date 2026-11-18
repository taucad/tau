/**
 * The recovery actions a classified start failure offers (desktop resilient startup blueprint D3).
 *
 * On the desktop they are the shell's: `tau.updates.check()` for Update Tau and Check for Updates, and the optional
 * `tau.troubleshooting` members for Show logs, Troubleshooting (the recovery window) and Restart in Safe Mode. The
 * troubleshooting members are declared here, renderer-local and optional, because the preload that provides them
 * (WP6) may not be present: an action whose member is missing is not offered. On the web there are no logs or
 * recovery window; Restart in Safe Mode is the `/?safe=1` page load, and an update is a reload.
 */
import { readHomeBackendMirror, resetHomeRecords } from '@taucad/files-ui/filesystem/handle-store';
import { safeModeHref } from '#lib/boot-signals.js';
import { isDesktopTarget } from '#lib/build-target.js';

/** The shell's troubleshooting members (WP6's preload), each optional. */
type TroubleshootingBridge = Readonly<{
  showLogs?: () => Promise<void>;
  open?: () => Promise<void>;
  restartInSafeMode?: () => Promise<void>;
  /** Quarantine the local database at the next start, then restart (WP9, R7). */
  resetLocalDatabase?: () => Promise<void>;
}>;

/** What the panel reads of `window.tau`, each member optional. */
type RecoveryShell = Readonly<{
  troubleshooting?: TroubleshootingBridge;
  updates?: Readonly<{ check?: () => Promise<void> }>;
}>;

/** The recovery actions, by the label the panel shows. @public */
export type RecoveryActionId =
  | 'updateTau'
  | 'checkForUpdates'
  | 'showLogs'
  | 'troubleshooting'
  | 'restartInSafeMode'
  | 'resetLocalDatabase'
  | 'resetFolderList';

/** One action the panel can offer: a button that runs, or a link to follow. @public */
export type RecoveryAction = Readonly<{ id: RecoveryActionId; label: string }> &
  (Readonly<{ kind: 'run'; run: () => void | Promise<void> }> | Readonly<{ kind: 'link'; href: string }>);

const labels: Readonly<Record<RecoveryActionId, string>> = {
  updateTau: 'Update Tau',
  checkForUpdates: 'Check for Updates',
  showLogs: 'Show logs',
  troubleshooting: 'Troubleshooting',
  restartInSafeMode: 'Restart in Safe Mode',
  resetLocalDatabase: 'Reset local database',
  resetFolderList: 'Reset folder list',
};

/* The build decides, not the global: on the web the inline icon sprite's `<symbol id="tau">` is `window.tau` too. */
const shell = (): RecoveryShell | undefined =>
  isDesktopTarget() ? (globalThis as { tau?: RecoveryShell }).tau : undefined;

const runner = (call: () => Promise<void>) => async (): Promise<void> => {
  try {
    await call();
  } catch (error) {
    console.error('[Recovery] action failed', error);
  }
};

const action = (id: RecoveryActionId): RecoveryAction | undefined => {
  const label = labels[id];
  const tau = shell();
  if (tau === undefined) {
    /* The web: no logs and no recovery window; safe mode is a page load and an update is a reload. */
    switch (id) {
      case 'restartInSafeMode': {
        return { id, label, kind: 'link', href: safeModeHref };
      }
      case 'updateTau':
      case 'checkForUpdates': {
        return {
          id,
          label,
          kind: 'run',
          run: () => {
            globalThis.location.reload();
          },
        };
      }
      case 'resetFolderList': {
        /* Only with Home's engine mirror: the reset pins Home again from it, and without it nothing is guessed (S37). */
        return readHomeBackendMirror() === undefined
          ? undefined
          : {
              id,
              label,
              kind: 'run',
              run: runner(async () => {
                await resetHomeRecords();
                globalThis.location.reload();
              }),
            };
      }
      default: {
        return undefined;
      }
    }
  }
  const calls: Readonly<Record<RecoveryActionId, (() => Promise<void>) | undefined>> = {
    updateTau: tau.updates?.check === undefined ? undefined : async () => tau.updates?.check?.(),
    checkForUpdates: tau.updates?.check === undefined ? undefined : async () => tau.updates?.check?.(),
    showLogs: tau.troubleshooting?.showLogs === undefined ? undefined : async () => tau.troubleshooting?.showLogs?.(),
    troubleshooting: tau.troubleshooting?.open === undefined ? undefined : async () => tau.troubleshooting?.open?.(),
    restartInSafeMode:
      tau.troubleshooting?.restartInSafeMode === undefined
        ? undefined
        : async () => tau.troubleshooting?.restartInSafeMode?.(),
    resetLocalDatabase:
      tau.troubleshooting?.resetLocalDatabase === undefined
        ? undefined
        : async () => tau.troubleshooting?.resetLocalDatabase?.(),
    /* The desktop's reset is the shell's quarantine; the web's database reset is not offered there. */
    resetFolderList: undefined,
  };
  const call = calls[id];
  return call === undefined ? undefined : { id, label, kind: 'run', run: runner(call) };
};

/**
 * The actions this page can offer, of those asked for, in order.
 *
 * @param ids - The actions the failure calls for.
 * @returns The ones available here.
 * @public
 */
export const recoveryActions = (ids: readonly RecoveryActionId[]): RecoveryAction[] =>
  ids.map((id) => action(id)).filter((entry): entry is RecoveryAction => entry !== undefined);
