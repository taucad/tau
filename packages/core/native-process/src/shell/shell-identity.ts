import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath, stat } from 'node:fs/promises';
import { dirname, posix, win32 } from 'node:path';

/**
 * The shell language a host runs (D14): Bash on macOS and Linux, PowerShell on Windows.
 *
 * @public
 */
export type ShellKind = 'bash' | 'powershell';

/**
 * The machine's own shell, resolved from fixed paths only and bound to the bytes on disk.
 *
 * @public
 */
export type ShellExecutable = Readonly<{
  kind: ShellKind;
  /** The fixed path the host launches. */
  path: string;
  /** Its real path once links are resolved; recorded so a receipt shows what actually ran. */
  realPath: string;
  /** `sha256:<hex>` of the executable's bytes. */
  digest: string;
}>;

/**
 * Why no shell was resolved. `shell-missing` covers an absent shell and one Tau refuses to trust, such as a
 * user-writable or Store copy.
 *
 * @public
 */
export type ShellExecutableRefusal = Readonly<{ status: 'shell-missing'; message: string }>;

/** @public */
export type ResolveShellExecutableOptions = Readonly<{
  platform: NodeJS.Platform;
  /** The host's environment, for `ProgramFiles`, `SystemRoot` and the profile roots on Windows. */
  environment: Readonly<Record<string, string | undefined>>;
}>;

const digestOf = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Uint8Array<ArrayBuffer>);
  }
  return `sha256:${hash.digest('hex')}`;
};

const missing = (message: string): ShellExecutableRefusal => ({ status: 'shell-missing', message });

/** Group- or other-writable, or not owned by root: someone other than the administrator could replace it. */
// oxlint-disable-next-line no-bitwise -- file mode bits.
const posixUntrusted = (mode: number, uid: number): boolean => uid !== 0 || (mode & 0o022) !== 0;

/** A root-owned system shell at one fixed path, bound to its bytes; `name` is only for messages. */
const resolveRootOwned = async (
  path: string,
  name: string,
): Promise<Readonly<{ path: string; realPath: string; digest: string }> | ShellExecutableRefusal> => {
  let real: string;
  try {
    real = await realpath(path);
  } catch {
    return missing(`${name} is not installed at ${path}.`);
  }
  const file = await stat(real);
  // oxlint-disable-next-line no-bitwise -- file mode bits.
  if (!file.isFile() || (file.mode & 0o111) === 0) {
    return missing(`${real} is not an executable file.`);
  }
  for (let entry = real; ; entry = dirname(entry)) {
    // oxlint-disable-next-line no-await-in-loop -- each ancestor is checked in order up to the root.
    const status = entry === real ? file : await stat(entry);
    if (posixUntrusted(status.mode, status.uid)) {
      return missing(`${entry} can be changed by a user other than root, so Tau does not run the ${name} below it.`);
    }
    if (entry === posix.dirname(entry)) {
      break;
    }
  }
  return { path, realPath: real, digest: await digestOf(real) };
};

const resolvePosix = async (): Promise<ShellExecutable | ShellExecutableRefusal> => {
  const resolved = await resolveRootOwned('/bin/bash', 'Bash');
  return 'status' in resolved ? resolved : { kind: 'bash', ...resolved };
};

/** Directories a Windows shell copy may never come from: the Store alias folder and every per-user profile root. */
const windowsRefusedRoots = (environment: ResolveShellExecutableOptions['environment']): readonly string[] =>
  [environment['USERPROFILE'], environment['APPDATA'], environment['LOCALAPPDATA'], environment['TEMP']]
    .filter((root): root is string => root !== undefined && root !== '')
    .map((root) => win32.resolve(root).toLowerCase());

const within = (path: string, root: string): boolean => {
  const relative = win32.relative(root, path);
  return relative !== '' && !relative.startsWith('..') && !win32.isAbsolute(relative);
};

const resolveWindows = async (
  environment: ResolveShellExecutableOptions['environment'],
): Promise<ShellExecutable | ShellExecutableRefusal> => {
  const programFiles = environment['ProgramFiles'] ?? environment['PROGRAMFILES'];
  const systemRoot = environment['SystemRoot'] ?? environment['SYSTEMROOT'];
  const candidates: Array<{ path: string; root: string }> = [];
  if (programFiles) {
    candidates.push({ path: win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe'), root: programFiles });
  }
  if (systemRoot) {
    candidates.push({
      path: win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      root: systemRoot,
    });
  }
  const refusedRoots = windowsRefusedRoots(environment);
  for (const candidate of candidates) {
    let link;
    try {
      // oxlint-disable-next-line no-await-in-loop -- the first fixed path present wins (pwsh 7, then 5.1).
      link = await lstat(candidate.path);
    } catch {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    const real = await realpath(candidate.path);
    // oxlint-disable-next-line no-await-in-loop -- see above.
    const realRootPath = await realpath(candidate.root);
    const realRoot = realRootPath.toLowerCase();
    const lower = real.toLowerCase();
    if (
      link.isSymbolicLink() ||
      !lower.endsWith('.exe') ||
      lower.includes('\\windowsapps\\') ||
      !within(lower, realRoot) ||
      refusedRoots.some((root) => within(lower, root))
    ) {
      return missing(
        `${candidate.path} resolves to ${real}, a user- or Store-writable location Tau does not run a shell from.`,
      );
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    return { kind: 'powershell', path: candidate.path, realPath: real, digest: await digestOf(real) };
  }
  return missing(
    String.raw`Neither PowerShell 7 (%ProgramFiles%\PowerShell\7\pwsh.exe) nor Windows PowerShell 5.1 is installed at its fixed path.`,
  );
};

/**
 * Resolve the machine's own shell from its fixed paths, never `PATH` (D14).
 *
 * macOS and Linux run `/bin/bash`, refused when it or any ancestor directory is writable by anyone but root. Windows
 * runs PowerShell 7 from `%ProgramFiles%\PowerShell\7` when present, else Windows PowerShell 5.1 from
 * `%SystemRoot%\System32\WindowsPowerShell\v1.0`; a copy that is a link, or that resolves into the Store alias folder
 * or a per-user profile root, is refused. Nothing is bundled and nothing is substituted.
 *
 * @public
 * @param options - Platform and host environment.
 * @returns The executable and its digest, or a `shell-missing` refusal.
 */
export const resolveShellExecutable = async (
  options: ResolveShellExecutableOptions,
): Promise<ShellExecutable | ShellExecutableRefusal> => {
  if (options.platform === 'win32') {
    return resolveWindows(options.environment);
  }
  if (options.platform === 'darwin' || options.platform === 'linux') {
    return resolvePosix();
  }
  return missing(`${options.platform} has no supported shell.`);
};

/**
 * Arguments that run one noninteractive command (blueprint, Bash invocation and result): Bash reads no startup file;
 * PowerShell loads no profile and keeps the machine's own execution policy.
 *
 * @public
 * @param kind - The shell language.
 * @param command - The command text, passed as one argument and never reinterpreted.
 * @returns The arguments after the executable.
 */
export const shellCommandArguments = (kind: ShellKind, command: string): readonly string[] =>
  kind === 'bash'
    ? ['--noprofile', '--norc', '-c', command]
    : ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command];

/**
 * Arguments that start the interactive Terminal shell.
 *
 * @public
 * @param kind - The shell language.
 * @returns The arguments after the executable.
 */
export const shellInteractiveArguments = (kind: ShellKind): readonly string[] =>
  kind === 'bash' ? ['--noprofile', '--norc', '-i'] : ['-NoLogo', '-NoProfile'];

/**
 * The command a provider runs to report the shell's version, inside the same sandbox as any other launch.
 *
 * @public
 * @param kind - The shell language.
 * @returns The command text for {@link shellCommandArguments}.
 */
export const shellVersionCommand = (kind: ShellKind): string =>
  kind === 'bash' ? 'printf %s "$BASH_VERSION"' : '$PSVersionTable.PSVersion.ToString()';

/**
 * The macOS system Zsh the human Terminal runs so it can load the person's own Zsh startup files (operator ruling
 * 2026-11-01T18:57Z). Agent shells never run it.
 *
 * @public
 */
export type TerminalZsh = Readonly<{ path: '/bin/zsh'; realPath: string; digest: string }>;

/**
 * Resolve the human Terminal's Zsh: `/bin/zsh` only, on macOS only, refused like Bash when it or any ancestor can be
 * changed by anyone but root. Never `PATH`, never a Homebrew or user copy.
 *
 * @public
 * @param platform - The host platform.
 * @returns The verified Zsh, or a `shell-missing` refusal; the Terminal then keeps the clean Bash.
 */
export const resolveTerminalZsh = async (platform: NodeJS.Platform): Promise<TerminalZsh | ShellExecutableRefusal> => {
  if (platform !== 'darwin') {
    return missing('The Terminal runs the system Zsh only on macOS.');
  }
  const resolved = await resolveRootOwned('/bin/zsh', 'Zsh');
  return 'status' in resolved ? resolved : { ...resolved, path: '/bin/zsh' };
};

/**
 * Arguments that start the human Terminal's Zsh as an interactive login shell, so it reads `.zshenv`, `.zprofile`,
 * `.zshrc` and `.zlogin` from `ZDOTDIR`, which the provider sets to the person's home.
 *
 * @public
 */
export const terminalZshArguments: readonly string[] = ['-l', '-i'];
