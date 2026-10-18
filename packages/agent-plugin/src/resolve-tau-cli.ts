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
  /** What `<path> --version` prints, trimmed, or `undefined` when it fails or does not answer in time. */
  readonly versionOf: (path: string) => string | undefined;
};

/**
 * A command that serves Tau's MCP tools over its stdio, and how it was chosen.
 *
 * @public
 */
export type TauCliCommand = {
  readonly command: string;
  readonly args: readonly string[];
  /**
   * Where the command came from: `TAU_CLI` (`explicit`), the checkout's `.dev/cli.json` (`workspace`),
   * a `tau` whose version is the plugin's (`installed`), or `npx` pinned to the plugin's version (`npx`).
   */
  readonly source: 'explicit' | 'workspace' | 'installed' | 'npx';
  /** The `tau` the command starts, from `TAU_CLI` or installed; absent for the workspace pointer and `npx`. */
  readonly path?: string;
  /** The CLI's version: what it printed for `--version`, or the version `npx` fetches; absent when unknown. */
  readonly cliVersion?: string;
  /** This plugin's version, from its `package.json`. */
  readonly pluginVersion: string;
  /** Installed `tau` executables passed over before the chosen one, with the version each printed, if any. */
  readonly skipped: ReadonlyArray<{ readonly path: string; readonly version?: string }>;
};

/**
 * The plugin's version, which an installed CLI must print and `npx` fetches.
 *
 * @param input - The launching process.
 * @param path - Path functions for the host platform.
 * @returns The `version` of the plugin's `package.json`.
 * @throws When that `package.json` names no version.
 */
const pluginVersionOf = (input: ResolveTauCliInput, path: PlatformPath): string => {
  const manifest = path.join(input.pluginRoot, 'package.json');
  const { version } = JSON.parse(input.readFile(manifest)) as { readonly version?: unknown };
  if (typeof version !== 'string' || version === '') {
    throw new Error(`${manifest} names no version, so the matching @taucad/cli is unknown`);
  }
  return version;
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
 * Every installed `tau` on `PATH`, then in the usual install folders a desktop app's minimal `PATH` omits.
 *
 * @param input - The launching process.
 * @param path - Path functions for the host platform.
 * @returns Each `tau` (`tau.cmd` on Windows) that exists, in search order, each path once: joining normalizes the
 *   folder, so `/usr/local/bin` and `/usr/local/bin/` name one `tau`.
 */
const installedClis = (input: ResolveTauCliInput, path: PlatformPath): string[] => {
  const windows = input.platform === 'win32';
  const candidates = new Set(
    [
      ...(input.env['PATH'] ?? '').split(path.delimiter).filter((directory) => directory !== ''),
      ...(windows ? [] : ['/opt/homebrew/bin', '/usr/local/bin']),
    ].map((directory) => path.join(directory, windows ? 'tau.cmd' : 'tau')),
  );
  return [...candidates].filter((candidate) => input.fileExists(candidate));
};

/**
 * Resolve the command that serves Tau's MCP tools for this plugin.
 *
 * Takes the first that applies: `TAU_CLI`, run whatever its version; the workspace
 * pointer `.dev/cli.json` that `nx build agent-plugin` writes; the first installed
 * `tau` whose `--version` is this plugin's version, searching `PATH`, then
 * `/opt/homebrew/bin` and `/usr/local/bin`; otherwise `npx` with the `@taucad/cli`
 * version this plugin was released with. An installed `tau` of any other version is
 * skipped, since the plugin and the CLI are released together.
 *
 * @param input - The environment, platform, plugin folder, file access and version probe of the launching process.
 * @returns The command and arguments to spawn with inherited stdio, and how they were chosen.
 * @throws When the plugin's `package.json` has no version.
 * @public
 *
 * @example <caption>Start the server from a launcher inside the plugin's `dist`</caption>
 * ```typescript
 * import { execFileSync, spawn } from 'node:child_process';
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
 *   versionOf: (path) => {
 *     try {
 *       return execFileSync(path, ['--version'], {
 *         encoding: 'utf8',
 *         killSignal: 'SIGKILL',
 *         maxBuffer: 128,
 *         stdio: ['ignore', 'pipe', 'ignore'],
 *         timeout: 2000,
 *       }).trim();
 *     } catch {
 *       return undefined;
 *     }
 *   },
 * });
 * spawn(cli.command, cli.args, { stdio: 'inherit' });
 * ```
 */
export const resolveTauCli = (input: ResolveTauCliInput): TauCliCommand => {
  const path = input.platform === 'win32' ? win32 : posix;
  const pluginVersion = pluginVersionOf(input, path);
  const explicit = input.env['TAU_CLI'];
  if (explicit) {
    return {
      command: explicit,
      args: ['mcp'],
      source: 'explicit',
      path: explicit,
      cliVersion: input.versionOf(explicit),
      pluginVersion,
      skipped: [],
    };
  }
  const workspace = workspaceCliArgv(input, path);
  if (workspace) {
    return {
      command: input.execPath,
      args: [...workspace, 'mcp'],
      source: 'workspace',
      pluginVersion,
      skipped: [],
    };
  }
  const skipped: Array<{ readonly path: string; readonly version?: string }> = [];
  for (const installed of installedClis(input, path)) {
    const version = input.versionOf(installed);
    if (version === pluginVersion) {
      return {
        command: installed,
        args: ['mcp'],
        source: 'installed',
        path: installed,
        cliVersion: version,
        pluginVersion,
        skipped,
      };
    }
    skipped.push({ path: installed, version });
  }
  return {
    command: input.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['--yes', `--package=@taucad/cli@${pluginVersion}`, 'tau', 'mcp'],
    source: 'npx',
    cliVersion: pluginVersion,
    pluginVersion,
    skipped,
  };
};
