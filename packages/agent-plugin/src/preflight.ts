/**
 * What the launcher checks before it fetches the Tau CLI with `npx`, and the command runner it shares.
 *
 * Each failed check is one `tau:` line on stderr with its fix and a distinct exit code, because a host
 * shows only that the server closed or timed out. Imports nothing but Node.js, so a diagnostic can run
 * the same checks.
 *
 * @module
 */
import { execFileSync } from 'node:child_process';
import type { ExecFileSyncOptions } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const windows = process.platform === 'win32';

/**
 * Whether Windows must start `command` through a shell: it starts `.cmd` and `.bat` shims, such as
 * `npx.cmd` and an npm-installed `tau.cmd`, no other way.
 *
 * @internal
 * @param command - The executable to start.
 * @returns Whether `command` is a `.cmd` or `.bat` file on Windows.
 */
export const needsShell = (command: string): boolean => windows && /\.(?:bat|cmd)$/iu.test(command);

/**
 * Run a command to completion, with nothing on its standard input and its standard error discarded.
 *
 * @param command - The executable.
 * @param args - Its arguments.
 * @param limits - Milliseconds before the command is killed (`timeout`), the bytes of standard output it may
 *   print (`maxBuffer`) and the signal that kills it past either (`killSignal`); without them it runs until it
 *   exits and may print 1 MiB.
 * @returns What it printed on standard output, trimmed.
 * @throws When it cannot start, exits non-zero, is killed or prints past `maxBuffer`.
 */
const run = (
  command: string,
  args: readonly string[],
  limits?: Pick<ExecFileSyncOptions, 'killSignal' | 'maxBuffer' | 'timeout'>,
): string => {
  const shell = needsShell(command);
  /* Discarded rather than piped, standard error never counts towards `maxBuffer`: a warning there does not
   * cost a matching `tau` its turn. */
  return execFileSync(shell ? `"${command}"` : command, args, {
    encoding: 'utf8',
    shell,
    stdio: ['ignore', 'pipe', 'ignore'],
    ...limits,
  }).trim();
};

/**
 * What a Tau CLI prints for `--version`, for `resolveTauCli`'s `versionOf`.
 *
 * At most 128 bytes are kept, which every Tau version fits: the answer reaches the CLI inside `TAU_LAUNCH`, and
 * Linux refuses to start a process with a variable over 128 KiB. A `tau` past either limit is killed with SIGKILL:
 * `execFileSync` signals once and then waits with no timer, so one that traps SIGTERM would hang the launcher.
 *
 * @internal
 * @param path - The `tau` executable.
 * @returns The version, or `undefined` when it cannot start, fails, prints more than 128 bytes, or does not
 *   answer within 2 s (a warm `tau` answers in about 45 ms).
 */
export const versionOf = (path: string): string | undefined => {
  try {
    return run(path, ['--version'], { timeout: 2000, maxBuffer: 128, killSignal: 'SIGKILL' });
  } catch {
    return undefined;
  }
};

/**
 * A check that failed: the launcher's exit code and the line it writes to stderr.
 *
 * @internal
 */
export type PreflightFailure = {
  /**
   * 2: Node.js is older than 24. 3: npm's cache is not writable. 4: npm is not on `PATH` or does not run, or is
   * older than 11.
   */
  readonly code: 2 | 3 | 4;
  /** One line that starts with `tau: `, names the fix and ends with a newline. */
  readonly message: string;
};

/**
 * What {@link preflight} found: the first failure, whose message names what it found, or what passed.
 *
 * @internal
 */
export type PreflightReport = {
  /** The first check that failed; absent when all passed. */
  readonly failure?: PreflightFailure;
  /** What `npm --version` printed, when the checks passed. */
  readonly npm?: string;
  /** The folder npm caches packages in, when the checks passed and npm named it. */
  readonly cache?: string;
};

/**
 * The checks' view of the process; each field defaults to the running one.
 *
 * @internal
 */
export type PreflightInput = {
  /** The Node.js version that runs the launcher, as `process.versions.node` gives it. */
  readonly nodeVersion?: string;
  /**
   * Runs npm with the arguments and returns its trimmed output; throws when npm cannot start, with `code`
   * `ENOENT` when it is not on `PATH`, or fails.
   */
  readonly npm?: (args: readonly string[]) => string;
};

/**
 * The Node.js check: the Tau CLI needs Node.js 24 or later.
 *
 * @internal
 * @param nodeVersion - The version to check, as `process.versions.node` gives it.
 * @returns The exit-2 failure, or `undefined` when the version is 24 or later.
 */
export const nodeFailure = (nodeVersion = process.versions.node): PreflightFailure | undefined =>
  Number.parseInt(nodeVersion, 10) < 24
    ? { code: 2, message: `tau: Node.js ${nodeVersion} started this plugin; install Node.js 24 or later\n` }
    : undefined;

/**
 * The npm checks: npm runs and is 11 or later, and a file can be created in npm's cache, where `npx` writes first.
 *
 * Stops at the first failure. npm runs twice, for `--version` and `config get cache`, about 0.1 s each.
 * The cache check is skipped when npm will not name its cache: it refuses to print a value that looks
 * like a secret, such as a path holding a UUID, and `npx` may still work there.
 *
 * @internal
 * @param npm - Runs npm, for tests; the `npm` on `PATH` by default.
 * @returns The first failure, or npm's version and cache folder.
 */
export const npmPreflight = (
  npm: NonNullable<PreflightInput['npm']> = (args) => run(windows ? 'npm.cmd' : 'npm', args),
): PreflightReport => {
  let version: string;
  try {
    version = npm(['--version']);
  } catch (error) {
    /* ENOENT is an npm missing from the host's `PATH`, as under Claude Desktop's minimal one. Windows' `cmd.exe`
     * reports a missing `npm.cmd` as a failed command, which reads as npm not running. */
    const reason = (error as { readonly code?: unknown }).code === 'ENOENT' ? 'was not found on PATH' : 'did not run';
    return { failure: { code: 4, message: `tau: npm ${reason}; install Node.js 24 or later, which includes npm\n` } };
  }
  if (!(Number.parseInt(version, 10) >= 11)) {
    return { failure: { code: 4, message: `tau: npm ${version} is older than 11; run: npm install -g npm@11\n` } };
  }
  let cache: string | undefined;
  try {
    cache = npm(['config', 'get', 'cache']);
    const temporary = join(cache, '_cacache', 'tmp');
    mkdirSync(temporary, { recursive: true });
    const probe = join(temporary, `tau-${process.pid}`);
    writeFileSync(probe, '');
    try {
      rmSync(probe);
    } catch {
      /* The write proved the cache writable: a probe that cannot be removed, as when antivirus holds it on
       * Windows (EBUSY or EPERM), does not undo that. */
    }
  } catch {
    /* Without a named cache there is nothing to check. Otherwise this is the fix npm itself prints for a
     * cache that `sudo npm` left owned by root; Windows has no owner to restore. */
    if (cache) {
      const fix =
        process.getuid === undefined ? '' : `; run: sudo chown -R ${process.getuid()}:${process.getgid?.()} "${cache}"`;
      return { failure: { code: 3, message: `tau: npm cache ${cache} is not writable${fix}\n` } };
    }
  }
  return { npm: version, cache };
};

/**
 * Check, in order, that Node.js is 24 or later ({@link nodeFailure}) and that npm and its cache will serve `npx`
 * ({@link npmPreflight}).
 *
 * @internal
 * @param input - The Node.js version and npm runner, for tests; the running process's by default.
 * @returns The first failure, or npm's version and cache folder.
 */
export const preflight = ({ nodeVersion, npm }: PreflightInput = {}): PreflightReport => {
  const failure = nodeFailure(nodeVersion);
  return failure ? { failure } : npmPreflight(npm);
};
