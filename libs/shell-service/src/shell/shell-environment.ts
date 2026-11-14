/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
/**
 * The contained shell's environment, built from an allowlist (blueprint, Permission lifecycle; A05). Nothing of the
 * host's environment passes through except a vetted locale and login name: no Tau token, cloud key, agent socket,
 * startup hook or loader variable. The provider refuses those names as a floor under this list.
 */
import { posix, win32 } from 'node:path';

import { shellGitEnvironment, shellGitReadEnvironment, shellGitWriteEnvironment } from '#shell/shell-git-view.js';
import type { ShellGitView } from '#shell/shell-git-view.js';
import type { TerminalGitAccess } from '#shell/shell-grant.js';

/** A locale or login value safe to pass on: no separators, quotes or control characters. */
const plainValue = /^[A-Za-z0-9_.@-]{1,64}$/u;

/** @public */
export type ShellEnvironmentOptions = Readonly<{
  platform: NodeJS.Platform;
  /** The shell executable being launched. */
  executablePath: string;
  /** The private HOME and temporary roots for this launch. */
  home: string;
  temporary: string;
  /** Host-selected toolchain `bin` folders, searched before the system ones. */
  toolchainBins: readonly string[];
  /** The host's environment, read only for locale, login name and Windows system roots. */
  host: Readonly<Record<string, string | undefined>>;
  /**
   * A pipe launch runs under `TERM=dumb`; a Terminal under a colour terminal. The Terminal also reaches the project's
   * real git store, so it carries the git variables for how it does ({@link terminalGit}).
   */
  terminal: boolean;
  /**
   * How a Terminal reaches the project's real store: read-only (the default) without optional locks, or writable with
   * them. Neither reads the system-wide git config.
   */
  terminalGit?: TerminalGitAccess | undefined;
  /** The launch's read-only git view (blueprint E1), which git in the shell then reads instead of finding none. */
  git?: ShellGitView | undefined;
}>;

const posixSystemBins = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

/**
 * Build the complete child environment for one launch.
 *
 * @public
 * @param options - Platform, shell, private roots, toolchain and the host values it may read.
 * @returns The environment, every entry chosen by Tau.
 */
export const shellEnvironment = (options: ShellEnvironmentOptions): Readonly<Record<string, string>> => {
  const { host } = options;
  const plain = (name: string): Record<string, string> => {
    const value = host[name];
    return value !== undefined && plainValue.test(value) ? { [name]: value } : {};
  };
  if (options.platform === 'win32') {
    const systemRoot = host['SystemRoot'] ?? String.raw`C:\Windows`;
    const system32 = win32.join(systemRoot, 'System32');
    const shellHome = win32.dirname(options.executablePath);
    return {
      SystemRoot: systemRoot,
      windir: systemRoot,
      ComSpec: win32.join(system32, 'cmd.exe'),
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
      PATH: [...options.toolchainBins, shellHome, system32, systemRoot, win32.join(system32, 'Wbem')].join(';'),
      PSModulePath: [
        win32.join(shellHome, 'Modules'),
        win32.join(system32, 'WindowsPowerShell', 'v1.0', 'Modules'),
      ].join(';'),
      USERPROFILE: options.home,
      TEMP: options.temporary,
      TMP: options.temporary,
      ...plain('USERNAME'),
    };
  }
  const locale = host['LANG'] !== undefined && plainValue.test(host['LANG']) ? host['LANG'] : 'C.UTF-8';
  return {
    PATH: [...new Set([...options.toolchainBins, ...posixSystemBins])].join(posix.delimiter),
    HOME: options.home,
    TMPDIR: options.temporary,
    LANG: options.platform === 'darwin' && locale === 'C.UTF-8' ? 'en_US.UTF-8' : locale,
    SHELL: options.executablePath,
    TERM: options.terminal ? 'xterm-256color' : 'dumb',
    /* BSD `ls` on macOS colours its listing only under CLICOLOR; GNU tools ignore it. */
    ...(options.terminal ? { COLORTERM: 'truecolor', CLICOLOR: '1' } : {}),
    ...plain('USER'),
    ...plain('LOGNAME'),
    ...(options.terminal ? (options.terminalGit === 'write' ? shellGitWriteEnvironment : shellGitReadEnvironment) : {}),
    ...(options.git === undefined ? {} : shellGitEnvironment(options.git)),
  };
};
