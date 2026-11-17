/**
 * Script stand-ins for `git` that a test names as `gitExecutable`.
 *
 * On macOS and Linux a stand-in is a file with a shebang. Windows has no
 * shebang and the port spawns `gitExecutable` without a shell, so there a shell
 * script runs under the `bash` Git for Windows ships (the toolchain every
 * native suite needs anyway) and a Node.js script under this Node.js, each
 * started by a real PE launcher: every Windows install carries the .NET
 * Framework 4 C# compiler, so the first call compiles a launcher and each
 * stand-in is a copy of it beside a `.sh` or `.cjs` file of the same name. The launcher
 * passes its own command line through unchanged, inherits the standard streams
 * and exits with the script's status; `taskkill /T` on it ends the script too.
 *
 * @internal
 */

import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const isWindows = process.platform === 'win32';

/**
 * A host path as a shell script spells it: forward slashes, which Git for
 * Windows' `bash` reads as the same Windows path; unchanged elsewhere.
 *
 * @param path - Absolute host path.
 * @returns The path to interpolate into a script.
 * @internal
 */
export const shellPath = (path: string): string => (isWindows ? path.replaceAll('\\', '/') : path);

/** Git for Windows' own `bin/bash.exe`, found from the `git` on PATH: never WSL's `bash.exe` in System32. */
const gitForWindowsShell = (): string => {
  const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  /* `<root>/mingw64/libexec/git-core` (or `clangarm64/…`). */
  return join(resolve(execPath, '..', '..', '..'), 'bin', 'bash.exe');
};

/** The C# 5 compiler that ships with the .NET Framework 4 on every Windows 10 and 11 install. */
const compiler = (): string =>
  join(process.env['SystemRoot'] ?? String.raw`C:\Windows`, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');

/**
 * The launcher's source, with its interpreter baked in.
 *
 * `MSYS_NO_PATHCONV` keeps `bash` from rewriting arguments that look like POSIX
 * paths (`core.hooksPath=/dev/null`) before the script hands them to `git`, and
 * `MSYS=noglob` from expanding a refspec or pathspec's `*` against the disk
 * while it splits the command line.
 *
 * @param interpreter - Absolute path of Git for Windows' `bash.exe`, or of Node.js.
 * @param extension - The script beside the launcher, `.sh` or `.cjs`.
 * @returns C# source.
 */
const launcherSource = (interpreter: string, extension: string): string => `
using System;
using System.Diagnostics;
using System.IO;

static class Launcher {
  static int Main() {
    string self = Process.GetCurrentProcess().MainModule.FileName;
    string script = Path.ChangeExtension(self, ${JSON.stringify(extension)});
    string line = Environment.CommandLine;
    int end = line.StartsWith("\\"") ? line.IndexOf('"', 1) + 1 : line.IndexOf(' ');
    string rest = end <= 0 || end >= line.Length ? "" : line.Substring(end).TrimStart();
    ProcessStartInfo start = new ProcessStartInfo(${JSON.stringify(interpreter)}, "\\"" + script + "\\" " + rest);
    start.UseShellExecute = false;
    start.EnvironmentVariables["MSYS_NO_PATHCONV"] = "1";
    start.EnvironmentVariables["MSYS2_ARG_CONV_EXCL"] = "*";
    start.EnvironmentVariables["MSYS"] = "noglob";
    using (Process child = Process.Start(start)) {
      child.WaitForExit();
      return child.ExitCode;
    }
  }
}
`;

const launchers = new Map<string, Promise<string>>();

/**
 * Compile one launcher per script kind, once per test process.
 *
 * @param extension - The script kind the launcher runs.
 * @returns Absolute path of the compiled launcher.
 */
const compiledLauncher = async (extension: '.sh' | '.cjs'): Promise<string> => {
  let launcher = launchers.get(extension);
  if (launcher === undefined) {
    launcher = (async () => {
      const directory = await mkdtemp(join(tmpdir(), 'tau-revisions-launcher-'));
      const source = join(directory, 'launcher.cs');
      const output = join(directory, 'launcher.exe');
      await writeFile(source, launcherSource(extension === '.sh' ? gitForWindowsShell() : process.execPath, extension));
      execFileSync(compiler(), ['/nologo', '/target:exe', '/optimize+', `/out:${output}`, source], { stdio: 'pipe' });
      return output;
    })();
    launchers.set(extension, launcher);
  }
  return launcher;
};

/**
 * Write one executable shell script.
 *
 * @param path - Absolute path to create, without an extension.
 * @param lines - The script's body, without a shebang; interpolate host paths with {@link shellPath}.
 * @param interpreter - The shebang elsewhere; Windows runs every script under Git for Windows' `bash`.
 * @returns The path to spawn: `path` itself, or `path.exe` on Windows.
 * @internal
 */
export const writeShellExecutable = async (
  path: string,
  lines: readonly string[],
  interpreter: '/bin/sh' | '/bin/bash' = '/bin/sh',
): Promise<string> => {
  await mkdir(dirname(path), { recursive: true });
  if (!isWindows) {
    await writeFile(path, [`#!${interpreter}`, ...lines, ''].join('\n'), { mode: 0o755 });
    return path;
  }
  await writeFile(`${path}.sh`, [...lines, ''].join('\n'));
  await copyFile(await compiledLauncher('.sh'), `${path}.exe`);
  return `${path}.exe`;
};

/**
 * Write one executable Node.js script, run by this process's Node.js.
 *
 * @param path - Absolute path to create, without an extension.
 * @param source - CommonJS source; its arguments are `process.argv.slice(2)`.
 * @returns The path to spawn: `path` itself, or `path.exe` on Windows.
 * @internal
 */
export const writeNodeExecutable = async (path: string, source: string): Promise<string> => {
  await mkdir(dirname(path), { recursive: true });
  if (!isWindows) {
    await writeFile(path, `#!${process.execPath}\n${source}`, { mode: 0o755 });
    return path;
  }
  await writeFile(`${path}.cjs`, source);
  await copyFile(await compiledLauncher('.cjs'), `${path}.exe`);
  return `${path}.exe`;
};
