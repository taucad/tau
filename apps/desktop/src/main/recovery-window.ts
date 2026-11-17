/**
 * The recovery window and its native fallback (desktop resilient startup blueprint, D0; R12).
 *
 * A small static page owned by main, loaded with `loadFile` from the app's own files with its own minimal preload, in
 * the in-memory partition `tau-recovery`. It uses neither the `app://` handler, the renderer bundle, nor the file
 * service, so a damaged cache or service worker in the app's session cannot reach it. If its load fails or its
 * renderer dies, main shows a native dialog with the core actions, which needs no renderer and no GPU process.
 *
 * Its actions arrive on `recoveryChannels.action`. The app's own renderer may send the first four and a reset of the
 * local database; the recovery window may send all of them. A reset only records the request (`recovery-resets.ts`).
 *
 * Everything here takes its effects as arguments; `main.ts` wires it to Electron.
 */
import type { RecoveryTrigger } from '#main/boot-watchdog.js';
import type { DesktopSignal } from '#main/desktop-signals.js';
import { recoveryShownSignal } from '#main/desktop-signals.js';
import { isResettableStore, requestReset } from '#main/recovery-resets.js';
import type { ResettableStore } from '#main/recovery-resets.js';

/** The recovery window's session: in memory (no `persist:` prefix), so nothing the app's session holds reaches it. */
export const recoveryPartition = 'tau-recovery';

/** The window's size. */
export const recoveryWindowSize = { width: 520, height: 560 } as const;

/** The native fallback's buttons, in order. */
export const recoveryFallbackButtons = ['Restart in Safe Mode', 'Download Tau', 'Show Logs', 'Quit'] as const;

/** One action the recovery surfaces can ask main for. */
export type RecoveryAction =
  | { readonly type: 'restart'; readonly mode: 'normal' | 'safe' }
  | { readonly type: 'show-logs' }
  | { readonly type: 'copy-diagnostics' }
  | { readonly type: 'open-recovery-window' }
  | { readonly type: 'check-for-updates' }
  | { readonly type: 'install-update' }
  | { readonly type: 'cancel-auto-install' }
  | { readonly type: 'download-tau' }
  | { readonly type: 'reset'; readonly store: ResettableStore };

type SimpleRecoveryAction = Exclude<RecoveryAction, { readonly type: 'restart' | 'reset' }>;

const simpleActions: ReadonlySet<string> = new Set<SimpleRecoveryAction['type']>([
  'show-logs',
  'copy-diagnostics',
  'open-recovery-window',
  'check-for-updates',
  'install-update',
  'cancel-auto-install',
  'download-tau',
]);

const isSimpleAction = (type: unknown): type is SimpleRecoveryAction['type'] =>
  typeof type === 'string' && simpleActions.has(type);

/**
 * Parse an action from either recovery surface.
 *
 * @param value - The IPC payload.
 * @returns The action, or `undefined` for anything the Specification does not name.
 */
export const parseRecoveryAction = (value: unknown): RecoveryAction | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { type, mode, store } = value as { type?: unknown; mode?: unknown; store?: unknown };
  if (type === 'restart') {
    return mode === 'normal' || mode === 'safe' ? { type, mode } : undefined;
  }
  if (type === 'reset') {
    return isResettableStore(store) ? { type, store } : undefined;
  }
  return isSimpleAction(type) ? { type } : undefined;
};

/** Who sent an action: the app's own trusted page, the recovery window, or nobody main trusts. */
export type RecoverySender = 'app' | 'recovery';

/**
 * Whether a sender may ask for an action.
 *
 * @param action - The action.
 * @param sender - Who asked.
 * @returns Whether it is allowed.
 */
export const isRecoveryActionAllowed = (action: RecoveryAction, sender: RecoverySender): boolean => {
  if (sender === 'recovery') {
    return true;
  }
  switch (action.type) {
    case 'restart':
    case 'show-logs':
    case 'copy-diagnostics':
    case 'open-recovery-window': {
      return true;
    }
    case 'reset': {
      return action.store === 'local-database';
    }
    default: {
      return false;
    }
  }
};

/** What each action does, in main. */
export type RecoveryActions = {
  readonly restart: (mode: 'normal' | 'safe') => Promise<void>;
  readonly showLogs: () => void;
  readonly copyDiagnostics: () => Promise<void>;
  readonly openRecoveryWindow: () => void;
  readonly checkForUpdates: () => Promise<void>;
  readonly installUpdate: () => Promise<void>;
  readonly cancelAutoInstall: () => void;
  readonly downloadTau: () => Promise<void>;
  /** A reset was recorded: the recovery window's state changed. */
  readonly resetsChanged: () => void;
};

/**
 * The handler for `recoveryChannels.action`.
 *
 * @param options - The profile, how to tell who sent an IPC event, and what each action does.
 * @returns `(payload, event) => Promise<void>`; it throws for an untrusted sender or a refused action.
 */
export const createRecoveryActionHandler =
  (options: {
    readonly userData: string;
    readonly senderOf: (event: unknown) => RecoverySender | undefined;
    readonly actions: RecoveryActions;
  }) =>
  async (payload: unknown, event: unknown): Promise<void> => {
    const sender = options.senderOf(event);
    const action = parseRecoveryAction(payload);
    if (sender === undefined || action === undefined || !isRecoveryActionAllowed(action, sender)) {
      throw new Error('Desktop shell refused the recovery action.');
    }
    const { actions } = options;
    switch (action.type) {
      case 'restart': {
        await actions.restart(action.mode);
        return;
      }
      case 'show-logs': {
        actions.showLogs();
        return;
      }
      case 'copy-diagnostics': {
        await actions.copyDiagnostics();
        return;
      }
      case 'open-recovery-window': {
        actions.openRecoveryWindow();
        return;
      }
      case 'check-for-updates': {
        await actions.checkForUpdates();
        return;
      }
      case 'install-update': {
        await actions.installUpdate();
        return;
      }
      case 'cancel-auto-install': {
        actions.cancelAutoInstall();
        return;
      }
      case 'download-tau': {
        await actions.downloadTau();
        return;
      }
      case 'reset': {
        requestReset(options.userData, action.store);
        actions.resetsChanged();
      }
    }
  };

/** The parts of a `BrowserWindow` the controller uses. */
export type RecoveryWindowLike = {
  readonly webContents: {
    readonly id: number;
    on(event: string, listener: (...args: never[]) => void): unknown;
    send(channel: string, ...args: unknown[]): void;
    isDestroyed(): boolean;
  };
  loadFile(path: string): Promise<void>;
  focus(): void;
  show(): void;
  destroy(): void;
  isDestroyed(): boolean;
  once(event: 'closed', listener: () => void): unknown;
};

/** The window options the controller asks for. */
export type RecoveryWindowOptions = {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly show: boolean;
  readonly autoHideMenuBar: boolean;
  readonly webPreferences: {
    readonly partition: string;
    readonly preload: string;
    readonly sandbox: true;
    readonly contextIsolation: true;
    readonly nodeIntegration: false;
    readonly devTools: boolean;
    readonly spellcheck: false;
  };
};

/** The core actions of the native fallback. */
export type RecoveryFallbackActions = {
  /** Resolves true once the restart is under way, false when the quit owner kept the app open. */
  readonly restartInSafeMode: () => Promise<boolean>;
  readonly downloadTau: () => Promise<void>;
  readonly showLogs: () => void;
  readonly quit: () => void;
};

/** The recovery window main opens and keeps at most one of. */
export type RecoveryWindowController = {
  /** Open the window, or bring the open one forward. */
  readonly open: (trigger: RecoveryTrigger) => void;
  /** Whether a web contents is the recovery window's own. */
  readonly isRecoveryContents: (contents: { readonly id: number } | undefined) => boolean;
  /** Send a message to the open window, if any. */
  readonly send: (channel: string, ...args: unknown[]) => void;
  readonly isOpen: () => boolean;
};

/**
 * Create the recovery window's controller.
 *
 * @param host - How to create a window, where its page and preload are, how to show the native dialog, the fallback's
 * actions, and the report and log sinks.
 * @returns The controller.
 */
export const createRecoveryWindowController = (host: {
  readonly createWindow: (options: RecoveryWindowOptions) => RecoveryWindowLike;
  readonly page: string;
  readonly preload: string;
  readonly showMessageBox: (options: {
    readonly type: 'error';
    readonly title: string;
    readonly message: string;
    readonly detail: string;
    readonly buttons: string[];
    readonly defaultId: number;
    readonly cancelId: number;
  }) => Promise<{ readonly response: number }>;
  readonly fallback: RecoveryFallbackActions;
  readonly report: (signal: DesktopSignal) => void;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail?: unknown) => void;
  /** Whether DevTools may open (development builds). */
  readonly devTools?: boolean;
  /** Keep the window hidden (the e2e harness's hidden windows). */
  readonly hidden?: boolean;
}): RecoveryWindowController => {
  let window: RecoveryWindowLike | undefined;
  let dialogShowing = false;

  const showFallback = async (trigger: RecoveryTrigger): Promise<void> => {
    if (dialogShowing) {
      return;
    }
    dialogShowing = true;
    host.log('error', 'main.recovery-dialog-shown', { trigger });
    host.report(recoveryShownSignal('dialog', trigger));
    try {
      /* Show Logs, Download Tau and a refused restart leave the dialog up; the other two end the launch. */
      for (let shown = 0; shown < 64; shown += 1) {
        // oxlint-disable-next-line no-await-in-loop -- one modal dialog at a time, re-shown after each non-final choice.
        const { response } = await host.showMessageBox({
          type: 'error',
          title: 'Tau',
          message: 'Tau couldn’t open its recovery window.',
          detail: 'Restart in Safe Mode to start with fewer features, or download Tau again if this keeps happening.',
          buttons: [...recoveryFallbackButtons],
          defaultId: 0,
          cancelId: 3,
        });
        switch (recoveryFallbackButtons[response]) {
          case 'Restart in Safe Mode': {
            // oxlint-disable-next-line no-await-in-loop -- an accepted restart ends this launch.
            if (await host.fallback.restartInSafeMode()) {
              return;
            }
            continue;
          }
          case 'Download Tau': {
            // oxlint-disable-next-line no-await-in-loop -- the browser opens before the dialog returns.
            await host.fallback.downloadTau();
            continue;
          }
          case 'Show Logs': {
            host.fallback.showLogs();
            continue;
          }
          default: {
            host.fallback.quit();
            return;
          }
        }
      }
    } catch (error) {
      host.log('error', 'main.recovery-dialog-failed', error);
    } finally {
      dialogShowing = false;
    }
  };

  const fail = (
    opened: RecoveryWindowLike,
    trigger: RecoveryTrigger,
    failure: { readonly reason: string; readonly detail?: unknown },
  ): void => {
    const { reason, detail } = failure;
    host.log('error', 'main.recovery-window-failed', { reason, detail });
    if (window === opened) {
      window = undefined;
    }
    /* A window whose page failed would otherwise linger, blank, behind the dialog that replaces it. */
    if (!opened.isDestroyed()) {
      opened.destroy();
    }
    void showFallback(trigger);
  };

  const open = (trigger: RecoveryTrigger): void => {
    if (window !== undefined && !window.isDestroyed()) {
      if (host.hidden !== true) {
        window.show();
        window.focus();
      }
      return;
    }
    let opened: RecoveryWindowLike;
    try {
      opened = host.createWindow({
        ...recoveryWindowSize,
        title: 'Tau Recovery',
        show: host.hidden !== true,
        autoHideMenuBar: true,
        webPreferences: {
          partition: recoveryPartition,
          preload: host.preload,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          devTools: host.devTools === true,
          spellcheck: false,
        },
      });
    } catch (error) {
      host.log('error', 'main.recovery-window-failed', { reason: 'create', detail: String(error) });
      void showFallback(trigger);
      return;
    }
    window = opened;
    host.log('warn', 'main.recovery-shown', { trigger });
    host.report(recoveryShownSignal('window', trigger));
    opened.webContents.on('did-fail-load', (...details: unknown[]) => {
      if (details[4] === true) {
        fail(opened, trigger, { reason: 'load', detail: { errorCode: details[1] } });
      }
    });
    opened.webContents.on('render-process-gone', (...details: unknown[]) => {
      const [, gone] = details;
      const reason = typeof gone === 'object' && gone !== null && 'reason' in gone ? gone.reason : undefined;
      fail(opened, trigger, { reason: 'renderer-gone', detail: { reason } });
    });
    opened.once('closed', () => {
      if (window === opened) {
        window = undefined;
      }
    });
    // async-iife: bootstrap -- a rejected load falls back to the native dialog.
    void (async (): Promise<void> => {
      try {
        await opened.loadFile(host.page);
      } catch (error) {
        fail(opened, trigger, { reason: 'load', detail: { message: String(error) } });
      }
    })();
  };

  return {
    open,
    isRecoveryContents: (contents) =>
      contents !== undefined && window !== undefined && !window.isDestroyed() && window.webContents.id === contents.id,
    send: (channel, ...args) => {
      if (window !== undefined && !window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(channel, ...args);
      }
    },
    isOpen: () => window !== undefined && !window.isDestroyed(),
  };
};

/** The two hooks the watchdog and the renderer reload policy (WP8) act through. */
export type RecoveryHooks = {
  /** Open the recovery window for a reason. */
  readonly openRecovery: (trigger: RecoveryTrigger) => void;
  /** Quit through the quit owner, then start again with `--safe-mode`; false when the quit owner kept the app open. */
  readonly restartInSafeMode: () => Promise<boolean>;
  /** Quit through the quit owner, then start again normally; false when the quit owner kept the app open. */
  readonly restartNormally: () => Promise<boolean>;
};

/**
 * Create the recovery hooks.
 *
 * @param options - The window controller, the quit owner (`prepareToQuit`), the relauncher (`relaunchSelf`), the final
 * quit and the log.
 * @returns The hooks.
 */
export const createRecoveryHooks = (options: {
  readonly controller: { readonly open: (trigger: RecoveryTrigger) => void };
  readonly prepareToQuit: (purpose: 'restart', reason: string) => Promise<boolean>;
  readonly relaunch: (switches: readonly string[]) => Promise<void>;
  readonly quit: () => void;
  readonly log: (level: 'error', event: string, detail?: unknown) => void;
}): RecoveryHooks => {
  const restart = async (reason: string, switches: readonly string[]): Promise<boolean> => {
    if (!(await options.prepareToQuit('restart', reason))) {
      return false;
    }
    try {
      await options.relaunch(switches);
    } catch (error) {
      options.log('error', 'main.relaunch-failed', error);
    }
    options.quit();
    return true;
  };
  return {
    openRecovery: (trigger) => {
      options.controller.open(trigger);
    },
    restartInSafeMode: async () => restart('safe-mode', ['--safe-mode']),
    restartNormally: async () => restart('restart-normally', []),
  };
};
