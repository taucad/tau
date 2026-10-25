import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitChildRunner } from '#api/publications/publication-materializer.js';

/**
 * A local git runner for suites that hand the materializer a lease directory
 * on this machine. tau-api itself never spawns git (DC3): its runner is the
 * forwarded `git-read` (`GitRepositoryService.leaseGit`).
 */

const execFileAsync = promisify(execFile);

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
/**
 * The isolation a lease's children run under, as `lease.ts` spawns its own: no
 * user or system configuration reaches them, so the only settings in force are
 * the ones hydration wrote into the directory.
 */
const gitEnvironment: Record<string, string> = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

/**
 * One `git` child in a lease, reading binary stdout.
 *
 * `lease.ts`'s own runner decodes as UTF-8, which would corrupt the bytes
 * `cat-file --batch` hands back, so the materializer keeps a buffer runner of
 * its own. The ceiling is the publication ceiling plus headroom: a tree larger
 * than that is refused from `ls-tree -l`'s sizes before anything is read.
 *
 * @param directory - The lease the child runs in.
 * @param args - Arguments after `git`.
 * @param stdin - Written to the child, when given.
 * @returns The child's stdout.
 */
export const leaseGitRunner: GitChildRunner = async (directory, args, stdin) => {
  const running = execFileAsync('git', [...args], {
    cwd: directory,
    encoding: 'buffer',
    timeout: 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: gitEnvironment as NodeJS.ProcessEnv,
  });
  if (stdin !== undefined) {
    running.child.stdin?.end(stdin);
  }
  const { stdout } = await running;
  return new Uint8Array(stdout);
};
