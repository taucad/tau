/**
 * Real `.exe` stand-ins for external CLIs in Windows tests.
 *
 * On macOS and Linux a test writes a `#!/bin/sh` stub. Windows has no shebang, and Tau never starts a
 * `.cmd` or `.bat` shim (Node cannot spawn one without a shell, `locate.ts`), so a Windows stub has to be
 * a real PE executable. Every Windows install carries the .NET Framework 4 C# compiler, so the first call
 * compiles one launcher. Each stub is a copy of it beside a `.cjs` script of the same name: the launcher
 * runs that script with this process's Node.js, passes its own command line through unchanged, inherits
 * the standard streams and exits with the script's status. Killing the stub's tree (`taskkill /T`) ends
 * the script too.
 */

import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** The C# 5 compiler that ships with the .NET Framework 4 on every Windows 10 and 11 install. */
const compiler = join(
  process.env['SystemRoot'] ?? String.raw`C:\Windows`,
  'Microsoft.NET',
  'Framework64',
  'v4.0.30319',
  'csc.exe',
);

/**
 * The launcher's source, with this process's Node.js baked in.
 *
 * @param node - Absolute path of the Node.js executable the launcher starts.
 * @returns C# source.
 */
const launcherSource = (node: string): string => `
using System;
using System.Diagnostics;
using System.IO;

static class Stub {
  static int Main() {
    string self = Process.GetCurrentProcess().MainModule.FileName;
    string script = Path.ChangeExtension(self, ".cjs");
    string line = Environment.CommandLine;
    int end = line.StartsWith("\\"") ? line.IndexOf('"', 1) + 1 : line.IndexOf(' ');
    string rest = end <= 0 || end >= line.Length ? "" : line.Substring(end).TrimStart();
    ProcessStartInfo start = new ProcessStartInfo(${JSON.stringify(node)}, "\\"" + script + "\\" " + rest);
    start.UseShellExecute = false;
    using (Process child = Process.Start(start)) {
      child.WaitForExit();
      return child.ExitCode;
    }
  }
}
`;

let launcher: Promise<string> | undefined;

/**
 * Compile the launcher once per test process.
 *
 * @returns Absolute path of the compiled launcher.
 */
const compiledLauncher = async (): Promise<string> => {
  launcher ??= (async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-windows-stub-'));
    const source = join(directory, 'stub.cs');
    const output = join(directory, 'stub.exe');
    await writeFile(source, launcherSource(process.execPath));
    execFileSync(compiler, ['/nologo', '/target:exe', '/optimize+', `/out:${output}`, source], { stdio: 'pipe' });
    return output;
  })();
  return launcher;
};

/**
 * Write one Windows executable stub.
 *
 * @param path - Absolute `.exe` path to create, with its directories.
 * @param script - CommonJS body run by Node.js; its arguments are `process.argv.slice(2)`.
 * @returns `path`.
 */
export const writeWindowsExecutable = async (path: string, script: string): Promise<string> => {
  if (!path.toLowerCase().endsWith('.exe')) {
    throw new Error(`A Windows executable stub must end in .exe: ${path}`);
  }
  await mkdir(dirname(path), { recursive: true });
  await copyFile(await compiledLauncher(), path);
  await writeFile(`${path.slice(0, -4)}.cjs`, script);
  return path;
};

/**
 * A stub body that prints `line` for `--version` and fails anything else.
 *
 * @param line - The version line.
 * @param delayMs - Milliseconds to wait before answering.
 * @returns CommonJS source.
 */
export const answeringScript = (line: string, delayMs = 0): string =>
  [
    `if (process.argv[2] !== '--version') process.exit(1);`,
    `setTimeout(() => { process.stdout.write(${JSON.stringify(`${line}\n`)}); process.exit(0); }, ${delayMs});`,
  ].join('\n');
