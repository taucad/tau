/**
 * Local diagnostics a person can reach without a working page (desktop resilient startup, D6 and U5).
 *
 * **Help → Troubleshooting** is installed before the first window, so it exists even when no page ever renders: on
 * macOS the menu bar needs no window, and on Windows and Linux the window is shown on a deadline. The bootstrap
 * failure dialog is the same set of exits for the case where main itself could not start.
 *
 * Everything here is pure or takes its effects as arguments; `main.ts` wires it to Electron.
 */
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import type { MenuItemConstructorOptions } from 'electron';

import { errnoOf } from '#main/desktop-signals.js';
import type { BootstrapStep } from '#main/desktop-signals.js';
import type { DesktopChannel } from '#main/environment.js';
import { desktopDownloadPage } from '#shared/desktop-release.js';

/** The submenu's label under Help. */
export const troubleshootingMenuLabel = 'Troubleshooting';

/** What the four Troubleshooting items do. */
export type TroubleshootingActions = {
  /** Quit through the shutdown owner and start again with `--safe-mode`. */
  readonly restartInSafeMode: () => void;
  /** Reveal `desktop.log` in the file manager. */
  readonly showLogs: () => void;
  /** Put {@link diagnosticsReport} on the clipboard. */
  readonly copyDiagnostics: () => void;
  /** Ask the updater to check now. */
  readonly checkForUpdates: () => void;
};

/** The parts of an application menu this module reads and changes. */
type MenuLike<Item> = {
  readonly items: readonly Item[];
  append(item: Item): void;
};
type MenuItemLike = {
  readonly role?: string | undefined;
  readonly label?: string | undefined;
  readonly submenu?: { append(item: never): void } | MenuItemConstructorOptions[] | undefined | unknown;
};

/**
 * The Troubleshooting submenu.
 *
 * @param actions - What each item does.
 * @returns The submenu item's options.
 */
export const troubleshootingMenuTemplate = (actions: TroubleshootingActions): MenuItemConstructorOptions => ({
  label: troubleshootingMenuLabel,
  submenu: [
    { label: 'Restart in Safe Mode', click: actions.restartInSafeMode },
    { label: 'Show Logs', click: actions.showLogs },
    { label: 'Copy Diagnostics', click: actions.copyDiagnostics },
    { label: 'Check for Updates…', click: actions.checkForUpdates },
  ],
});

/**
 * Add Troubleshooting to the Help menu, creating a Help menu when the application menu has none. The caller installs
 * the menu again afterwards, because a native menu does not reflect additions until it is.
 *
 * @param menu - The application menu, or `undefined` when the app has none.
 * @param createItem - `(options) => new MenuItem(options)`.
 * @param actions - What each item does.
 * @returns Whether the menu now holds Troubleshooting.
 */
export const addTroubleshootingMenu = <Item extends MenuItemLike>(
  menu: MenuLike<Item> | undefined,
  createItem: (options: MenuItemConstructorOptions) => Item,
  actions: TroubleshootingActions,
): boolean => {
  if (menu === undefined) {
    return false;
  }
  const template = troubleshootingMenuTemplate(actions);
  const help = menu.items.find((item) => item.role?.toLowerCase() === 'help' || item.label === 'Help');
  const submenu = help?.submenu as { append?: (item: Item) => void } | undefined;
  if (typeof submenu?.append === 'function') {
    submenu.append(createItem({ type: 'separator' }));
    submenu.append(createItem(template));
    return true;
  }
  menu.append(createItem({ role: 'help', label: 'Help', submenu: [template] }));
  return true;
};

/** The build and profile facts a diagnostics report starts with. */
export type DiagnosticsSummary = {
  readonly version: string;
  readonly channel: DesktopChannel;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly packaged: boolean;
  readonly electron: string | undefined;
  /** How many folders, beside Home, this profile has granted. */
  readonly grantedFolders: number;
  /** The boot-health ledger's view of this launch and the one before it (D0, D6), when this launch keeps one. */
  readonly bootHealth?: {
    readonly mode: string;
    readonly unhealthyCount: number;
    readonly stage: string;
    readonly previous?: { readonly outcome: string; readonly stage: string; readonly ended?: string | undefined };
  };
};

const bootHealthLines = (bootHealth: DiagnosticsSummary['bootHealth']): string[] =>
  bootHealth === undefined
    ? ['', 'Boot health: not recorded for this launch']
    : [
        '',
        'Boot health:',
        `Mode: ${bootHealth.mode}`,
        `Unhealthy launches: ${String(bootHealth.unhealthyCount)}`,
        bootHealth.previous === undefined
          ? 'Previous launch: none recorded for this build'
          : `Previous launch: ${bootHealth.previous.outcome} (stage ${bootHealth.previous.stage}, ended ${bootHealth.previous.ended ?? 'none'})`,
        `This launch: stage ${bootHealth.stage}`,
      ];

/** Lines of `desktop.log` a report carries. */
export const diagnosticsLogLines = 500;
/** The most of the log's tail a report reads, so a huge line cannot make the copy itself slow. */
const diagnosticsTailBytes = 1024 * 1024;

const escapeRegExp = (value: string): string => value.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

/**
 * Replace every home directory in `text` with `~`: this account's own, under either separator, and any other
 * account's, so a report pasted into an issue names no one.
 *
 * @param text - Text that may hold paths.
 * @param home - This account's home directory.
 * @returns The scrubbed text.
 */
export const scrubHomePaths = (text: string, home: string): string => {
  let scrubbed = text;
  if (home.length > 1) {
    for (const spelling of new Set([home, home.replaceAll('\\', '/'), home.replaceAll('/', '\\')])) {
      scrubbed = scrubbed.replaceAll(new RegExp(escapeRegExp(spelling), 'giu'), '~');
    }
  }
  /* A Windows account name (behind a drive letter or a backslash) may hold spaces, so it runs to the next separator;
   * a POSIX one cannot, so it ends at whitespace. */
  return scrubbed
    .replaceAll(/(?:[a-z]:[\\/]|\\)users[\\/][^\\/:'"\r\n]+/giu, '~')
    .replaceAll(/[\\/](?:users|home)[\\/][^\\/:'"\s]+/giu, '~');
};

/* The last bytes of a file, read synchronously: the report is built in a menu click, from a file main itself owns. */
const readTail = (path: string, bytes: number): string => {
  const descriptor = openSync(path, 'r');
  try {
    const { size } = fstatSync(descriptor);
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    readSync(descriptor, buffer, 0, length, size - length);
    return buffer.toString('utf8');
  } finally {
    closeSync(descriptor);
  }
};

/**
 * The text **Copy Diagnostics** puts on the clipboard: the build, the profile's folder count, the boot-health ledger
 * and the last
 * {@link diagnosticsLogLines} lines of `desktop.log`, with every home directory replaced by `~`.
 *
 * @param summary - The build and profile facts.
 * @param logPath - `desktop.log`.
 * @param home - This account's home directory.
 * @returns The report.
 */
export const diagnosticsReport = (summary: DiagnosticsSummary, logPath: string, home: string): string => {
  let log: string;
  try {
    const lines = readTail(logPath, diagnosticsTailBytes).split('\n');
    if (lines.at(-1) === '') {
      lines.pop();
    }
    log = lines.slice(-diagnosticsLogLines).join('\n');
  } catch (error) {
    log = `(log unavailable: ${errnoOf(error)})`;
  }
  const header = [
    'Tau diagnostics',
    `Version: ${summary.version}`,
    `Channel: ${summary.channel}`,
    `Platform: ${summary.platform}-${summary.arch}`,
    `Packaged: ${String(summary.packaged)}`,
    `Electron: ${summary.electron ?? 'unknown'}`,
    `Granted folders: ${String(summary.grantedFolders)}`,
    ...bootHealthLines(summary.bootHealth),
  ];
  return scrubHomePaths(`${header.join('\n')}\n\nLast ${String(diagnosticsLogLines)} log lines:\n${log}\n`, home);
};

/**
 * Where **Download Tau** goes: a release page on GitHub, which needs nothing from the updater. Staging builds are
 * pre-releases, which `latest` does not show, so staging opens the release list.
 *
 * @param channel - The running build's channel.
 * @returns The page.
 */
export const downloadTauPage = (channel: DesktopChannel): string => desktopDownloadPage(channel);

/** What each button of {@link bootstrapFailureDialog} does, in button order. */
export const bootstrapFailureActions = ['restart-safe-mode', 'show-logs', 'download-tau', 'quit'] as const;

/* The causes a person can act on, named in plain words (D8's preflight). */
const unwritable = new Set(['EACCES', 'EPERM', 'EROFS']);

/**
 * The native dialog main shows when its bootstrap threw (B18). It names the cause a person can act on, and offers the
 * same exits as the recovery surface. It carries an error code and the step, never a path.
 *
 * @param error - What bootstrap threw.
 * @param step - Where it threw.
 * @returns `dialog.showMessageBox` options.
 */
export const bootstrapFailureDialog = (
  error: unknown,
  step: BootstrapStep,
): {
  readonly type: 'error';
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly buttons: string[];
  readonly defaultId: number;
  readonly cancelId: number;
} => {
  const errno = errnoOf(error);
  const [message, advice] = unwritable.has(errno)
    ? [
        'Tau can’t write to its data folder.',
        'Check that your account can write to the folder Tau keeps its data in, then restart Tau.',
      ]
    : errno === 'ENOSPC'
      ? ['Your disk is full.', 'Free some space on the disk Tau keeps its data on, then restart Tau.']
      : [
          'Tau couldn’t start.',
          'Restart in Safe Mode to start with fewer features, or download Tau again if this keeps happening.',
        ];
  return {
    type: 'error',
    title: 'Tau',
    message,
    detail: `${advice}\n\nStep: ${step}. Error: ${errno === 'none' ? 'unknown' : errno}.`,
    buttons: ['Restart in Safe Mode', 'Show Logs', 'Download Tau', 'Quit'],
    defaultId: 0,
    cancelId: bootstrapFailureActions.indexOf('quit'),
  };
};
