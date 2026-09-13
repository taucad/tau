/**
 * The two binaries a disk host records revisions with (OQ-B8).
 *
 * `git` is the engine; `git-lfs` is how large objects reach a remote and how a
 * *stock* checkout of this project resolves the pointers Tau writes. Tau's own
 * reads and writes need only `git`, because the pointer format is host-neutral
 * (see `lfs.ts`) — but a machine missing `git-lfs` cannot push, pull or
 * `git worktree add` a project with large objects in it, and finding that out
 * at the first push is worse than being told at the start.
 *
 * Resolution is deliberately dumb: the caller names the executable or the
 * process finds it on `PATH`. The desktop app passes the path of the binary it
 * ships in its own resources; `tau serve` and the CLI take what is installed and
 * say, in one message, what is missing.
 */

import { runCommand } from '#git-command.js';
import { RevisionPortError } from '#revision-port.js';

/** One binary a disk host records revisions with. @public */
export type MissingGitTool = 'git' | 'git-lfs';

/** A host that cannot record revisions, and exactly what it is missing. @public */
export class GitToolchainError extends RevisionPortError {
  /** The binaries that did not answer, in the order a person installs them. */
  public readonly missing: readonly MissingGitTool[];

  /**
   * Name the missing half of the toolchain.
   *
   * @param missing - The binaries that did not answer.
   */
  public constructor(missing: readonly MissingGitTool[]) {
    super(
      'ENGINE_UNAVAILABLE',
      `Tau records revisions with ${missing.join(' and ')}, which ${missing.length > 1 ? 'are' : 'is'} not installed on this machine. Install ${missing.join(' and ')} and run this again.`,
    );
    this.name = 'GitToolchainError';
    this.missing = Object.freeze([...missing]);
  }
}

/** What this machine can drive a native-Git store with. @public */
export type GitToolchain = Readonly<{
  /** The executable every command of the port runs. */
  git: string;
  /** `git --version`'s own answer, without its prefix. */
  gitVersion: string;
  /** `git lfs version`'s own answer. */
  gitLfsVersion: string;
}>;

const textDecoder = new TextDecoder();
/** A version probe that has not answered in this long is not a working binary. */
const probeMilliseconds = 10_000;

/**
 * Ask one binary for its version.
 *
 * @param executable - The `git` to run.
 * @param args - The version subcommand.
 * @returns Its answer, or `undefined` when it is not there or not working.
 */
const version = async (executable: string, args: readonly string[]): Promise<string | undefined> => {
  try {
    const result = await runCommand({
      executable,
      /* The process's own directory: a version probe must not need a repository,
       * and must not pick one up either. */
      cwd: process.cwd(),
      args: [...args],
      deadline: probeMilliseconds,
    });
    return result.exitCode === 0 ? textDecoder.decode(result.stdout).trim() : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Resolve the Git toolchain this host will record revisions with.
 *
 * @param options - The binaries to use; the ones on `PATH` when absent.
 * @returns Both versions, once both binaries have answered.
 * @throws GitToolchainError `ENGINE_UNAVAILABLE`, naming exactly what is missing.
 * @public
 *
 * @example <caption>A host that checks before it serves</caption>
 * ```typescript
 * import { resolveGitToolchain } from '@taucad/revisions/node';
 *
 * const toolchain = await resolveGitToolchain();
 * toolchain.gitVersion; // '2.55.0'
 * ```
 */
export const resolveGitToolchain = async (
  options: Readonly<{ gitExecutable?: string | undefined; gitLfsExecutable?: string | undefined }> = {},
): Promise<GitToolchain> => {
  const git = options.gitExecutable ?? 'git';
  /* A bundled `git-lfs` is a binary of its own (OQ-B8); the one on `PATH` is
   * reached the way a person reaches it, as git's own subcommand. */
  const [reported, lfs] = await Promise.all([
    version(git, ['--version']),
    options.gitLfsExecutable === undefined
      ? version(git, ['lfs', 'version'])
      : version(options.gitLfsExecutable, ['version']),
  ]);
  const missing: readonly MissingGitTool[] = [
    ...(reported === undefined ? (['git'] as const) : []),
    ...(lfs === undefined ? (['git-lfs'] as const) : []),
  ];
  if (missing.length > 0) {
    throw new GitToolchainError(missing);
  }
  return Object.freeze({
    git,
    gitVersion: (reported ?? '').replace('git version ', ''),
    gitLfsVersion: lfs ?? '',
  });
};
