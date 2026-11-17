/**
 * Purpose: Write a stand-in for an external CLI that any platform can start directly.
 * Why: macOS and Linux start a `#!` script, but Windows has no shebang, and Tau never starts a `.cmd` or
 * `.bat` shim (Node cannot spawn one without a shell), so a Windows stand-in has to be a real PE
 * executable. Every Windows install carries the .NET Framework 4 C# compiler, so the first Windows call
 * compiles one launcher. Each stub is a copy of it beside a `.cjs` script of the same name: the launcher
 * runs that script with this process's Node.js, passes its own command line through unchanged, inherits
 * the standard streams and exits with the script's status.
 * Environment: test processes only; Windows needs `%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`.
 * Usage: `const cli = await writeExecutableStub(join(root, 'sentry-cli'), script)`; spawn `cli`.
 * Exit codes: n/a.
 */
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';

/** The C# 5 compiler that ships with the .NET Framework 4 on every Windows 10 and 11 install. */
const compiler = (): string =>
  join(process.env['SystemRoot'] ?? String.raw`C:\Windows`, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');

/**
 * The launcher's source, with this process's Node.js baked in.
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
 * Compile the Windows launcher once per process.
 * @returns Absolute path of the compiled launcher.
 */
const compiledLauncher = async (): Promise<string> => {
  launcher ??= (async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-executable-stub-'));
    const source = join(directory, 'stub.cs');
    const output = join(directory, 'stub.exe');
    await writeFile(source, launcherSource(process.execPath));
    execFileSync(compiler(), ['/nologo', '/target:exe', '/optimize+', `/out:${output}`, source], { stdio: 'pipe' });
    return output;
  })();
  return launcher;
};

/**
 * Write (or rewrite) one executable stub that runs `script` with this process's Node.js.
 * @param path - Absolute path without an extension; Windows adds `.exe`.
 * @param script - CommonJS body; its arguments are `process.argv.slice(2)`.
 * @returns The path to start: `path` on macOS and Linux, `path.exe` on Windows.
 */
export const writeExecutableStub = async (path: string, script: string): Promise<string> => {
  await mkdir(dirname(path), { recursive: true });
  if (process.platform !== 'win32') {
    await writeFile(path, `#!${process.execPath}\n${script}`);
    await chmod(path, 0o755);
    return path;
  }
  const executable = `${path}.exe`;
  await copyFile(await compiledLauncher(), executable);
  await writeFile(`${path}.cjs`, script);
  return executable;
};
