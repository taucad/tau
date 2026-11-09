import { spawn } from 'node:child_process';

/**
 * The git toolchain probe (DC3): `git --version` and `git lfs version`, with
 * the binaries on `PATH`. It lives with the processes that run git — tau-storage,
 * whose readiness refuses a Machine without git, and the API's in-process
 * fallback — so tau-api's forwarded module graph spawns no git child at all.
 */

/**
 * Runs one probe and reads its first line of output.
 *
 * @param args - Arguments after `git`.
 * @returns The trimmed output, or `undefined` when git is absent or the command failed.
 */
const probe = async (args: readonly string[]): Promise<string | undefined> =>
  new Promise((resolve) => {
    const child = spawn('git', [...args], { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    child.on('error', () => {
      resolve(undefined);
    });
    child.on('close', (code) => {
      resolve(code === 0 ? Buffer.concat(chunks).toString('utf8').trim() : undefined);
    });
  });

/** What the probe found: each version string, or `undefined` for a missing binary. */
export type GitToolchain = { readonly git: string | undefined; readonly lfs: string | undefined };

/**
 * Probes git and, when asked, git-lfs. Binaries do not appear at runtime, so
 * callers probe once per process and keep the answer.
 *
 * @param withLfs - Whether git-lfs is part of this process's toolchain (the API image has it; tau-storage does not).
 * @returns The versions found.
 */
export const probeGitToolchain = async (withLfs: boolean): Promise<GitToolchain> => {
  const git = await probe(['--version']);
  const lfs = withLfs ? await probe(['lfs', 'version']) : undefined;
  return { git, lfs };
};

/**
 * The readiness probe of git on tau-storage of git. A found git is kept, as binaries do
 * not disappear at runtime; a failed probe is not, so one spawn that failed
 * (a fork refused under load, a slow boot) never refuses the Machine for life.
 * Concurrent probes share one spawn.
 *
 * @param probeToolchain - The probe, replaced in tests.
 * @returns A function answering git's version, or `undefined` without git.
 */
export const gitVersionProbe = (
  probeToolchain: (withLfs: boolean) => Promise<GitToolchain> = probeGitToolchain,
): (() => Promise<string | undefined>) => {
  let toolchain: Promise<GitToolchain> | undefined;
  return async () => {
    toolchain ??= probeToolchain(false);
    const probing = toolchain;
    const { git } = await probing;
    if (git === undefined && toolchain === probing) {
      toolchain = undefined;
    }
    return git;
  };
};
