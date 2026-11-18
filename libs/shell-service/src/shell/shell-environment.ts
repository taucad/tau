/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
/**
 * The contained shell's environment, built from an allowlist (blueprint, Permission lifecycle; A05). Nothing of the
 * host's environment passes through except a vetted locale and login name: no Tau token, cloud key, agent socket,
 * startup hook or loader variable. The provider refuses those names as a floor under this list.
 */
import { posix, win32 } from 'node:path';

import { powerShellModuleCacheVariable } from '@taucad/sandbox/shell/identity';

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
  /**
   * On Windows, the PowerShell module analysis cache file the launch reads ({@link powerShellModuleCacheVariable}): the
   * read-only cache Tau built once for this shell, or, for the one launch that builds it, where that launch writes it.
   */
  powerShellModuleCache?: string | undefined;
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
    const windowsPowerShellHome = win32.join(system32, 'WindowsPowerShell', 'v1.0');
    const windowsPowerShellModules = win32.join(windowsPowerShellHome, 'Modules');
    /*
     * `PSModulePath`: the shell's own modules first. PowerShell 7 then gets Windows PowerShell's. Windows PowerShell 5.1
     * (its home compared without case, as Windows compares paths) gets the machine's
     * `%ProgramFiles%\WindowsPowerShell\Modules` after its own (WIN-X64 job 133853031159, T02-ps51). 5.1's command
     * auto-discovery stops at the first module folder it cannot list, and 5.1 inserts the machine folder *before* its
     * home unless the variable already names it. One folder the sandbox may not read (an administrator-only module, such
     * as the runner image's `ImageHelpers`) then hid `Microsoft.PowerShell.Utility`, and with it `Measure-Object` and
     * `Write-Output`. Named after the home, the machine folder keeps its modules available and can no longer hide the
     * built-in ones; a module behind such a folder still imports by name. PowerShell 7's order is unchanged: its rows
     * pass in the same run.
     */
    const isWindowsPowerShell = shellHome.toLowerCase() === windowsPowerShellHome.toLowerCase();
    const programFiles =
      host['ProgramW6432'] ?? host['ProgramFiles'] ?? win32.join(win32.parse(systemRoot).root, 'Program Files');
    const moduleFolders = isWindowsPowerShell
      ? [win32.join(shellHome, 'Modules'), win32.join(programFiles, 'WindowsPowerShell', 'Modules')]
      : [win32.join(shellHome, 'Modules'), windowsPowerShellModules];
    return {
      SystemRoot: systemRoot,
      windir: systemRoot,
      ComSpec: win32.join(system32, 'cmd.exe'),
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
      PATH: [...options.toolchainBins, shellHome, system32, systemRoot, win32.join(system32, 'Wbem')].join(';'),
      PSModulePath: moduleFolders.join(';'),
      /* The private home stands in for the profile the sandbox account is started without. */
      USERPROFILE: options.home,
      /*
       * Per-user application data inside the private home, gone with it. Tools that find their settings and caches
       * through these variables (npm's `%APPDATA%\npm` prefix, for one) otherwise find none and fail, or write beside
       * the working directory; with them they write into the launch's own roots. PowerShell itself reads its module
       * analysis cache from `PSModuleAnalysisCachePath`, set below, not from these.
       */
      APPDATA: win32.join(options.home, 'AppData', 'Roaming'),
      LOCALAPPDATA: win32.join(options.home, 'AppData', 'Local'),
      TEMP: options.temporary,
      TMP: options.temporary,
      ...(options.powerShellModuleCache === undefined
        ? {}
        : { [powerShellModuleCacheVariable]: options.powerShellModuleCache }),
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
