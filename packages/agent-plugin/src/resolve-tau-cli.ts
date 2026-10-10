/**
 * Finding the Tau CLI that serves the plugin's MCP tools.
 *
 * Hosts copy or load the plugin folder as-is, with no dependency install, so the
 * launcher cannot depend on `@taucad/cli`; it looks for one instead.
 *
 * @module
 */
import { posix, win32 } from 'node:path';
import type { PlatformPath } from 'node:path';

/**
 * What {@link resolveTauCli} reads from the process that will start the server.
 *
 * @public
 */
export type ResolveTauCliInput = {
  /** Process environment. `TAU_CLI` and `PATH` are read. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Host platform, as `process.platform` names it. */
  readonly platform: string;
  /** The plugin folder: it holds `package.json`, and `.dev/cli.json` in a workspace build. */
  readonly pluginRoot: string;
  /** The Node.js executable that runs a workspace CLI, normally `process.execPath`. */
  readonly execPath: string;
  /** Whether a file exists at an absolute path. */
  readonly fileExists: (path: string) => boolean;
  /** A file's UTF-8 text. Throws when the file cannot be read. */
  readonly readFile: (path: string) => string;
};

/**
 * A command that serves Tau's MCP tools over its stdio.
 *
 * @public
 */
export type TauCliCommand = {
  readonly command: string;
  readonly args: readonly string[];
};

/**
 * The workspace build's pointer at the checkout's CLI, when it is still there.
 *
 * @param input - The launching process.
 * @param path - Path functions for the host platform.
 * @returns The pointer's argv, or `undefined` when it is absent, unreadable or points at a deleted checkout.
 */
const workspaceCliArgv = (input: ResolveTauCliInput, path: PlatformPath): readonly string[] | undefined => {
  const pointer = path.join(input.pluginRoot, '.dev', 'cli.json');
  if (!input.fileExists(pointer)) {
    return undefined;
  }
  try {
    const { argv } = JSON.parse(input.readFile(pointer)) as { readonly argv?: unknown };
    if (
      Array.isArray(argv) &&
      argv.every((part): part is string => typeof part === 'string') &&
      argv[0] !== undefined &&
      input.fileExists(argv[0])
    ) {
      return argv;
    }
  } catch {
    // ponytail: an unreadable pointer counts as absent, like one into a deleted worktree.
  }
  return undefined;
};

/**
 * An installed `tau` on `PATH`, then in the usual install folders a desktop app's minimal `PATH` omits.
 *
 * @param input - The launching process.
 * @param path - Path functions for the host platform.
 * @returns The first `tau` (`tau.cmd` on Windows) that exists, or `undefined`.
 */
const installedCli = (input: ResolveTauCliInput, path: PlatformPath): string | undefined => {
  const windows = input.platform === 'win32';
  const directories = [
    ...(input.env['PATH'] ?? '').split(path.delimiter).filter((directory) => directory !== ''),
    ...(windows ? [] : ['/opt/homebrew/bin', '/usr/local/bin']),
  ];
  return directories
    .map((directory) => path.join(directory, windows ? 'tau.cmd' : 'tau'))
    .find((candidate) => input.fileExists(candidate));
};

/**
 * `npx`, pinned to the CLI released with this plugin.
 *
 * @param input - The launching process.
 * @param path - Path functions for the host platform.
 * @returns The `npx` command for the `@taucad/cli` version in the plugin's `package.json`.
 * @throws When that `package.json` names no version.
 */
const npxCli = (input: ResolveTauCliInput, path: PlatformPath): TauCliCommand => {
  const manifest = path.join(input.pluginRoot, 'package.json');
  const { version } = JSON.parse(input.readFile(manifest)) as { readonly version?: unknown };
  if (typeof version !== 'string' || version === '') {
    throw new Error(`${manifest} names no version, so the matching @taucad/cli is unknown`);
  }
  return {
    command: input.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['--yes', `--package=@taucad/cli@${version}`, 'tau', 'mcp'],
  };
};

/**
 * Resolve the command that serves Tau's MCP tools for this plugin.
 *
 * Takes the first that applies: `TAU_CLI`; the workspace pointer `.dev/cli.json`
 * that `nx build agent-plugin` writes; `tau` on `PATH`, then in `/opt/homebrew/bin`
 * and `/usr/local/bin`; otherwise `npx` with the `@taucad/cli` version this plugin
 * was released with.
 *
 * @param input - The environment, platform, plugin folder and file access of the launching process.
 * @returns The command and arguments to spawn with inherited stdio.
 * @throws When only `npx` remains and the plugin's `package.json` has no version.
 * @public
 *
 * @example <caption>Start the server from a launcher inside the plugin's `dist`</caption>
 * ```typescript
 * import { spawn } from 'node:child_process';
 * import { existsSync, readFileSync } from 'node:fs';
 * import { fileURLToPath } from 'node:url';
 * import { resolveTauCli } from '@taucad/agent-plugin';
 *
 * const cli = resolveTauCli({
 *   env: process.env,
 *   platform: process.platform,
 *   pluginRoot: fileURLToPath(new URL('..', import.meta.url)),
 *   execPath: process.execPath,
 *   fileExists: existsSync,
 *   readFile: (path) => readFileSync(path, 'utf8'),
 * });
 * spawn(cli.command, cli.args, { stdio: 'inherit' });
 * ```
 */
export const resolveTauCli = (input: ResolveTauCliInput): TauCliCommand => {
  const path = input.platform === 'win32' ? win32 : posix;
  const explicit = input.env['TAU_CLI'];
  if (explicit !== undefined && explicit !== '') {
    return { command: explicit, args: ['mcp'] };
  }
  const workspace = workspaceCliArgv(input, path);
  if (workspace !== undefined) {
    return { command: input.execPath, args: [...workspace, 'mcp'] };
  }
  const installed = installedCli(input, path);
  if (installed !== undefined) {
    return { command: installed, args: ['mcp'] };
  }
  return npxCli(input, path);
};
