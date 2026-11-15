/**
 * Where an ACP agent's vendor CLI is on this machine (ACP agent policy rules 2-4).
 *
 * PATH first, then the profile's declared fallbacks in order; the first
 * executable file wins. The locator is a function of the platform, the
 * environment, the home directory and an injected file probe, so the Windows
 * rules run on any test runner and a test can confine discovery to a
 * temporary home.
 *
 * Two rules shape it. On Windows a `.cmd` or `.bat` shim is never selected:
 * Node refuses to spawn one without a shell (its CVE-2024-27980 fix) and Tau
 * never starts a CLI through a shell. A `*` path segment expands to the
 * directory's entries, newest version first, because a vendor app bundle keeps
 * its CLI under a version directory that moves when the app updates.
 */

import { accessSync, constants, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

import type { AcpAdapter, AcpAgentProfile } from '#acp/registry.js';

/** The file-system reads the locator makes, injectable for tests. @public */
export type AcpExecutableFileSystem = {
  /** Whether a path names a file this process may execute. */
  readonly isExecutableFile: (path: string) => boolean;
  /** The entry names of a directory, or none when it cannot be read. */
  readonly listDirectory: (path: string) => readonly string[];
};

/** Everything the locator reads. @internal */
export type AcpLocateContext = AcpExecutableFileSystem & {
  /** Platform whose PATH rules and fallbacks apply. */
  readonly platform: NodeJS.Platform;
  /** Environment whose `PATH` (and `PATHEXT` on Windows) to search. */
  readonly environment: NodeJS.ProcessEnv;
  /** What a leading `~/` in a fallback stands for. */
  readonly home: string;
};

/** Where the locator found a CLI, or what it searched in vain. @internal */
export type AcpExecutableLocation =
  | {
      readonly found: true;
      /** Absolute path of the executable file. */
      readonly executablePath: string;
      /** Which step found it: PATH, or a declared fallback. */
      readonly executableSource: 'path' | 'fallback';
    }
  | {
      readonly found: false;
      /** What was searched, and any shim that was skipped, for the host's log. */
      readonly message: string;
      /** Windows `.cmd` and `.bat` files that matched and were not selected. */
      readonly skippedShims: readonly string[];
    };

/** Windows script shims Node cannot spawn without a shell. */
const shimSuffixes: ReadonlySet<string> = new Set(['.BAT', '.CMD']);

/** A directory name that is a dotted version, such as `2.1.325`. */
const versionName = /^\d+(?:\.\d+)*$/u;

/**
 * The `path` flavour for a platform.
 *
 * @param platform - Platform to locate on.
 * @returns `path.win32` on Windows, `path.posix` everywhere else.
 */
const pathFor = (platform: NodeJS.Platform): typeof posix => (platform === 'win32' ? win32 : posix);

/**
 * The value of one environment variable, by Windows' case-insensitive rule there.
 *
 * @param environment - Environment to read.
 * @param name - Variable name as POSIX spells it.
 * @param platform - Platform whose rule applies.
 * @returns The value, if set.
 */
const environmentValue = (
  environment: NodeJS.ProcessEnv,
  name: string,
  platform: NodeJS.Platform,
): string | undefined =>
  platform === 'win32'
    ? Object.entries(environment).find(([key]) => key.toUpperCase() === name)?.[1]
    : environment[name];

/**
 * Order directory entries for a `*` segment: dotted versions first, newest
 * first, then every other name in descending order.
 *
 * @param left - One entry name.
 * @param right - The other entry name.
 * @returns A negative number when `left` is tried first.
 */
const fallbackEntryOrder = (left: string, right: string): number => {
  const leftIsVersion = versionName.test(left);
  if (leftIsVersion !== versionName.test(right)) {
    return leftIsVersion ? -1 : 1;
  }
  if (leftIsVersion) {
    const leftParts = left.split('.').map(Number);
    const rightParts = right.split('.').map(Number);
    for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
      const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
      if (difference !== 0) {
        return difference;
      }
    }
    return 0;
  }
  return right.localeCompare(left);
};

/** The real file system. @internal */
export const acpLocalFileSystem: AcpExecutableFileSystem = {
  isExecutableFile: (path) => {
    try {
      if (!statSync(path).isFile()) {
        return false;
      }
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      /* Absent or not executable. */
      return false;
    }
  },
  listDirectory: (path) => {
    try {
      return readdirSync(path);
    } catch {
      /* Absent or unreadable: nothing to expand. */
      return [];
    }
  },
};

/**
 * The locator's context for this process, or for an injected platform and file system.
 *
 * `~/` is `HOME`, or `USERPROFILE` on Windows, and this process's home directory
 * when the environment names none.
 *
 * @param options - Environment, platform and file system; this process's by default.
 * @returns The context {@link locateAcpCli} reads.
 * @internal
 */
export const acpLocateContext = (
  options: {
    readonly environment?: NodeJS.ProcessEnv | undefined;
    readonly platform?: NodeJS.Platform | undefined;
    readonly fileSystem?: AcpExecutableFileSystem | undefined;
  } = {},
): AcpLocateContext => {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const fileSystem = options.fileSystem ?? acpLocalFileSystem;
  return {
    platform,
    environment,
    home: environmentValue(environment, platform === 'win32' ? 'USERPROFILE' : 'HOME', platform) ?? homedir(),
    isExecutableFile: fileSystem.isExecutableFile,
    listDirectory: fileSystem.listDirectory,
  };
};

/**
 * Every concrete path one declared fallback names, in the order they are tried.
 *
 * @param entry - A declared fallback: absolute or starting `~/`, `/`-separated, `*` only as a whole segment.
 * @param context - Where to read directories.
 * @returns The concrete paths, possibly none.
 */
const expandFallback = (entry: string, context: AcpLocateContext): readonly string[] => {
  const path = pathFor(context.platform);
  const [first = '', ...segments] = entry.split('/');
  /* `~` is the home directory, an empty first segment the root, and anything else a Windows drive. */
  const root = first === '~' ? context.home : first === '' ? path.sep : `${first}${path.sep}`;
  let prefixes: readonly string[] = [root];
  for (const segment of segments) {
    prefixes =
      segment === '*'
        ? prefixes.flatMap((prefix) =>
            context
              .listDirectory(prefix)
              .toSorted(fallbackEntryOrder)
              .map((name) => path.join(prefix, name)),
          )
        : prefixes.map((prefix) => path.join(prefix, segment));
  }
  return prefixes;
};

/**
 * Find a command on PATH, as a shell would, skipping Windows script shims.
 *
 * Windows tries each `PATHEXT` suffix but `.bat` and `.cmd`, and never the bare
 * name, which there is the extensionless shell script npm writes beside its
 * shim.
 *
 * @param command - Bare command name, or an absolute path returned as is.
 * @param context - Where and how to search.
 * @returns The executable, the directories searched, and the shims skipped.
 */
const locateOnPath = (
  command: string,
  context: AcpLocateContext,
): { readonly found?: string; readonly directories: number; readonly skippedShims: readonly string[] } => {
  const path = pathFor(context.platform);
  if (path.isAbsolute(command)) {
    return { found: command, directories: 0, skippedShims: [] };
  }
  const windows = context.platform === 'win32';
  const suffixes = windows
    ? (environmentValue(context.environment, 'PATHEXT', context.platform) ?? '.COM;.EXE;.BAT;.CMD')
        .split(';')
        .filter((suffix) => suffix !== '')
    : [''];
  const directories = (environmentValue(context.environment, 'PATH', context.platform) ?? '')
    .split(path.delimiter)
    .filter((directory) => directory !== '');
  const skippedShims: string[] = [];
  for (const directory of directories) {
    for (const suffix of suffixes) {
      /* Lower-cased: Windows matches it either way, and the user reads `claude.exe`. */
      const candidate = path.resolve(directory, `${command}${suffix.toLowerCase()}`);
      /* Absent or not executable: keep searching, as a shell does. */
      if (!context.isExecutableFile(candidate)) {
        continue;
      }
      if (shimSuffixes.has(suffix.toUpperCase())) {
        skippedShims.push(candidate);
        continue;
      }
      return { found: candidate, directories: directories.length, skippedShims };
    }
  }
  /* PATHEXT may omit the shims; a user who has only one still deserves to hear about it. */
  if (windows) {
    for (const directory of directories) {
      for (const suffix of shimSuffixes) {
        const candidate = path.resolve(directory, `${command}${suffix.toLowerCase()}`);
        if (
          !skippedShims.some((shim) => shim.toLowerCase() === candidate.toLowerCase()) &&
          context.isExecutableFile(candidate)
        ) {
          skippedShims.push(candidate);
        }
      }
    }
  }
  return { directories: directories.length, skippedShims };
};

/**
 * A count with its noun, singular or plural.
 *
 * @param count - How many.
 * @param one - The noun for one.
 * @param many - The noun for any other count.
 * @returns For example `1 directory` or `4 directories`.
 */
const counted = (count: number, one: string, many: string): string => `${String(count)} ${count === 1 ? one : many}`;

/**
 * Find a profile's CLI on PATH, then at its declared fallbacks for the platform.
 *
 * @param profile - Profile naming the CLI and its fallbacks.
 * @param context - Platform, environment, home and file probe.
 * @returns Where the CLI is, or what was searched; `undefined` for a profile with no CLI.
 * @internal
 */
export const locateAcpCli = (
  profile: Pick<AcpAgentProfile, 'cli' | 'fallbackExecutables'>,
  context: AcpLocateContext,
): AcpExecutableLocation | undefined => {
  const { cli } = profile;
  if (cli === undefined) {
    return undefined;
  }
  const onPath = locateOnPath(cli, context);
  if (onPath.found !== undefined) {
    return { found: true, executablePath: onPath.found, executableSource: 'path' };
  }
  const fallbacks = profile.fallbackExecutables?.[context.platform] ?? [];
  for (const entry of fallbacks) {
    const found = expandFallback(entry, context).find((candidate) => context.isExecutableFile(candidate));
    if (found !== undefined) {
      return { found: true, executablePath: found, executableSource: 'fallback' };
    }
  }
  const searched = `The ${cli} CLI was not found on PATH (${counted(onPath.directories, 'directory', 'directories')}) or at ${counted(fallbacks.length, 'declared location', 'declared locations')}.`;
  const shims =
    onPath.skippedShims.length === 0
      ? ''
      : ` Skipped ${onPath.skippedShims.join(', ')}: Tau never starts a .cmd or .bat shim, because Node cannot spawn one without a shell. Install the vendor's own executable instead.`;
  return { found: false, message: `${searched}${shims}`, skippedShims: onPath.skippedShims };
};

/** A spawn of an executable that is no longer anywhere this agent's CLI is searched for. */
class AcpCliNotFoundError extends Error {
  /**
   * The refusal code a session reports.
   *
   * @returns Always `CLI_NOT_FOUND`.
   */
  public get code(): 'CLI_NOT_FOUND' {
    return 'CLI_NOT_FOUND';
  }

  public override readonly name = 'AcpCliNotFoundError';
}

/**
 * The adapter with its CLI located again, when a fallback it was found at is gone (discovery rule 7).
 *
 * A vendor app bundle keeps its CLI under a version directory that moves when
 * the app updates, so a path found at discovery can be gone by the next spawn.
 * A CLI found on PATH, or a fallback still in place, is returned unchanged.
 *
 * @param adapter - A resolved adapter.
 * @param options - Environment, platform and file system; this process's by default.
 * @returns The adapter, with a current `executablePath` when it had to move.
 * @throws An error with `code: 'CLI_NOT_FOUND'` when the CLI is no longer anywhere it is searched for.
 * @public
 */
export const resolveAcpAdapterExecutable = (
  adapter: AcpAdapter,
  options: {
    readonly environment?: NodeJS.ProcessEnv | undefined;
    readonly platform?: NodeJS.Platform | undefined;
    readonly fileSystem?: AcpExecutableFileSystem | undefined;
  } = {},
): AcpAdapter => {
  const context = acpLocateContext(options);
  if (
    adapter.executableSource !== 'fallback' ||
    adapter.executablePath === undefined ||
    context.isExecutableFile(adapter.executablePath)
  ) {
    return adapter;
  }
  const location = locateAcpCli(adapter, context);
  if (location?.found !== true) {
    throw new AcpCliNotFoundError(
      `${adapter.executablePath} is gone. ${location?.message ?? `${adapter.displayName} names no CLI to look for.`}`,
    );
  }
  return { ...adapter, executablePath: location.executablePath, executableSource: location.executableSource };
};
